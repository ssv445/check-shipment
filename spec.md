# check-shipment - Specification Document

## Project Overview

**Package Name:** `check-shipment`
**Version:** 1.0.0
**Description:** Zero-install website validator for checking broken links, SEO, and accessibility before deployment
**License:** MIT
**Minimum Node.js Version:** 22+

## Purpose

`check-shipment` is a CLI tool designed for developers to test their websites for common issues before deployment. It provides a single command that can be integrated into development workflows to catch obvious problems before shipping to production.

The tool is specifically optimized for modern React-based websites and can be run without installation using `npx`.

## Usage

```bash
npx check-shipment --url=https://example.com
```

## Technical Stack

- **Language:** TypeScript
- **Package Manager:** pnpm
- **Module System:** ESM (ES Modules)
- **Crawler:** Crawlee with PlaywrightCrawler
- **Browser:** Playwright (Chromium)
- **CLI Framework:** Commander.js

## Phase 1: Link Validation (v1.0.0)

### Core Features

1. **URL Crawling**
   - Crawl all internal links starting from a given URL
   - Use PlaywrightCrawler for full browser rendering
   - Support for JavaScript-heavy React applications (CSR, SSR, hydration)
   - Internal links only (same domain)
   - Ignore robots.txt, nofollow, and meta robots tags

2. **Link Validation**
   - Verify all discovered links return valid responses
   - Categorize errors by type (404, 500, Timeout, DNS Error, SSL Error, etc.)
   - Follow redirects and test final destination
   - Verify non-HTML content (PDFs, images) returns 200 OK without parsing
   - Max redirects: 5 (to prevent infinite loops)

3. **URL Replacement**
   - Replace production URLs with local/staging URLs for testing
   - Useful for testing local sites with production links

4. **Progress Reporting**
   - Real-time progress bar showing:
     - Current URL being crawled
     - Progress: X/Y pages crawled
     - Errors found so far
     - Time elapsed
     - Estimated time remaining

5. **Results Reporting**
   - Console output with formatted table showing:
     - Broken URL
     - HTTP Status / Error Type
     - Source Page(s)
   - Basic summary showing:
     - Total pages crawled
     - Total links checked
     - Broken links count
     - Time taken
   - Markdown report saved to `.check-shipment/report-[timestamp].md`

6. **CI/CD Integration**
   - Exit code 1 if broken links found (fails pipeline)
   - `--no-fail` flag to exit 0 even with broken links (reporting mode)

### Command-Line Arguments

#### Required Arguments

- `--url=<url>` - Starting URL to crawl

#### Optional Arguments

**Crawling Configuration:**
- `--concurrency=<number>` - Number of parallel requests (default: 3)
- `--timeout=<number>` - Request timeout in seconds (default: 60)
- `--exclude-patterns=<patterns>` - Comma-separated URL patterns to skip (e.g., `/admin/*,/api/*,*.pdf`)

**URL Replacement:**
- `--replaceFrom=<url>` - Domain to replace in discovered links
- `--replaceTo=<url>` - Domain to replace it with

**Browser Configuration:**
- Headless only (no headed mode in v1)
- Wait for networkidle + 1 second for React hydration
- Ignore SSL errors by default

**Error Handling:**
- `--retry-count=<number>` - Number of retry attempts for failed requests (default: 3)
- `--no-fail` - Exit 0 even if broken links found

**Output:**
- Reports automatically saved to `.check-shipment/report-[timestamp].md`

### Configuration File Support

The tool supports a configuration file for repeated runs.

**File Name:** `check-shipment.config.js`
**Format:** ESM JavaScript
**Location Priority:**
1. Current directory
2. Project root

**Example Configuration:**

```javascript
// check-shipment.config.js
export default {
  url: 'http://localhost:3000',
  concurrency: 3,
  timeout: 60,
  excludePatterns: ['/admin/*', '/api/*', '*.pdf'],
  replaceFrom: 'https://production.com',
  replaceTo: 'http://localhost:3000',
  retryCount: 3,
  noFail: false
}
```

**Note:** CLI arguments override config file values.

### Architecture

#### Modular Checker System

The tool is built with a modular architecture to support future extensibility:

```typescript
interface Checker {
  name: string;
  run(page: Page, url: string): Promise<CheckResult>;
}

interface CheckResult {
  passed: boolean;
  errors: CheckError[];
  warnings: CheckWarning[];
}
```

**v1.0.0 Checkers:**
- `LinkChecker` - Validates all links on the page

**Future Checkers (v2+):**
- `SEOChecker` - Will be implemented in future versions
- `AccessibilityChecker` - Will be implemented in future versions

#### Project Structure

```
check-shipment/
├── src/
│   ├── cli.ts                 # CLI entry point, Commander.js setup
│   ├── crawler.ts             # Crawlee/Playwright crawler logic
│   ├── checkers/
│   │   ├── base.ts            # Base Checker interface
│   │   ├── link-checker.ts    # Link validation checker
│   │   └── index.ts           # Checker exports
│   ├── reporters/
│   │   ├── console.ts         # Console table reporter
│   │   ├── markdown.ts        # Markdown file reporter
│   │   └── index.ts           # Reporter exports
│   ├── utils/
│   │   ├── url.ts             # URL normalization, resolution
│   │   ├── config.ts          # Config file loading
│   │   └── validation.ts      # Input validation
│   └── types/
│       └── index.ts           # TypeScript type definitions
├── .check-shipment/           # Report output directory (gitignored)
├── check-shipment.config.js   # Example config file
├── package.json
├── tsconfig.json
└── README.md
```

### Behavior Specifications

#### URL Normalization

- Remove trailing slashes (except for root URLs)
- Remove query parameters and hash fragments
- Normalize protocol (http/https)

#### Same Domain Detection

- Extract base domain (handles www subdomains)
- `www.example.com` and `example.com` treated as same domain
- Handle localhost and IP addresses

#### Non-HTML Content Handling

- Verify 200 OK status
- Do not parse for links
- Supported types: PDFs, images, videos, downloads, etc.

#### Redirect Handling

- Follow up to 5 redirects
- Test final destination URL
- Do not report redirects as warnings in v1

#### Error Retry Logic

- Retry failed requests up to 3 times (configurable)
- Wait with exponential backoff between retries
- After max retries, log error and continue crawling
- Do not fail entire crawl for individual page errors

#### Start URL Validation

- Validate start URL before beginning crawl
- Fail fast if start URL is not accessible
- Exit with error code and helpful message

#### Exit Codes

- **0** - Success (no broken links or `--no-fail` flag used)
- **1** - Broken links found
- **2** - Crawler error (invalid URL, network issues, etc.)

### Help Documentation

Running `npx check-shipment` without arguments shows full help menu:

```
check-shipment - Website validator for pre-deployment testing

Usage:
  npx check-shipment --url=<url> [options]

Required Arguments:
  --url=<url>                Starting URL to crawl

Crawling Options:
  --concurrency=<number>     Parallel requests (default: 3)
  --timeout=<number>         Request timeout in seconds (default: 60)
  --exclude-patterns=<list>  Skip URL patterns (comma-separated)
  --retry-count=<number>     Retry attempts for failures (default: 3)

URL Replacement:
  --replaceFrom=<url>        Domain to replace in links
  --replaceTo=<url>          Replacement domain

Output Options:
  --no-fail                  Exit 0 even with broken links

Examples:
  # Basic usage
  npx check-shipment --url=http://localhost:3000

  # Test local site with production URLs
  npx check-shipment --url=http://localhost:3000 \
    --replaceFrom=https://production.com \
    --replaceTo=http://localhost:3000

  # Exclude admin and API routes
  npx check-shipment --url=https://example.com \
    --exclude-patterns="/admin/*,/api/*"

  # Use config file
  npx check-shipment (reads check-shipment.config.js)

Configuration File:
  Create check-shipment.config.js in your project:

  export default {
    url: 'http://localhost:3000',
    concurrency: 3,
    timeout: 60,
    excludePatterns: ['/admin/*', '*.pdf'],
    noFail: false
  }

Reports:
  Reports are saved to .check-shipment/report-[timestamp].md

For more information, visit: https://github.com/username/check-shipment
```

### Package.json Configuration

```json
{
  "name": "check-shipment",
  "version": "1.0.0",
  "description": "Zero-install website validator for checking broken links, SEO, and accessibility before deployment",
  "type": "module",
  "bin": {
    "check-shipment": "./dist/cli.js"
  },
  "keywords": [
    "crawler",
    "validator",
    "link-checker",
    "seo",
    "accessibility",
    "testing",
    "ci-cd",
    "playwright",
    "react",
    "deployment",
    "preflight"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "license": "MIT"
}
```

### Dependencies

**Production Dependencies:**
- `crawlee` - Web crawling framework
- `playwright` - Browser automation (auto-install on first run)
- `commander` - CLI framework
- `chalk` - Terminal colors
- `cli-progress` - Progress bars
- `cli-table3` - Console tables

**Development Dependencies:**
- `typescript`
- `@types/node`
- `tsx` - TypeScript execution
- `vitest` - Testing framework

### Playwright Setup

- Use `playwright-core` initially (smaller package)
- Auto-install Chromium browser on first run
- Show progress during browser installation
- Cache browsers in user's system (standard Playwright behavior)

### Error Messages

Provide clear, actionable error messages:

**Invalid Start URL:**
```
❌ Start URL is not accessible: https://example.com
   Status: 404 Not Found

Please ensure:
  1. The URL is correct
  2. The server is running (if localhost)
  3. The domain is accessible
```

**Network Errors:**
```
❌ Failed to crawl: https://example.com/page
   Error: Network timeout after 60 seconds
   Attempted: 3 times

Skipping and continuing with other pages...
```

### Report Format

**Markdown Report Example:**

```markdown
# check-shipment Report

**Date:** 2025-01-10 14:30:45
**Start URL:** http://localhost:3000
**Duration:** 45 seconds

## Summary

- **Total Pages Crawled:** 127
- **Total Links Checked:** 456
- **Broken Links Found:** 3
- **Success Rate:** 99.3%

## Broken Links

### 404 Not Found (2)

| Broken URL | Source Page |
|------------|-------------|
| http://localhost:3000/old-blog-post | http://localhost:3000/blog |
| http://localhost:3000/missing | http://localhost:3000/about |

### Timeout (1)

| Broken URL | Source Page |
|------------|-------------|
| http://localhost:3000/slow-page | http://localhost:3000/home |

---

Generated by check-shipment v1.0.0
```

## Phase 2: SEO Validation (Future)

### High-Level Feature Outline

**SEOChecker Module:**
- Missing/duplicate title tags
- Missing/duplicate meta descriptions
- Missing h1 tags or multiple h1 tags
- Image alt text validation
- Canonical URL checks
- Open Graph tags validation
- Structured data validation
- Mobile-friendliness checks

**Additional CLI Arguments:**
- `--enable-seo` - Enable SEO checker
- `--seo-rules=<list>` - Specify which SEO rules to check

## Phase 3: Accessibility Validation (Future)

### High-Level Feature Outline

**AccessibilityChecker Module:**
- ARIA label validation
- Color contrast ratios
- Keyboard navigation testing
- Heading hierarchy validation
- Form label associations
- Image alt text (accessibility perspective)
- Focus management
- Screen reader compatibility

**Additional CLI Arguments:**
- `--enable-a11y` - Enable accessibility checker
- `--wcag-level=<A|AA|AAA>` - WCAG compliance level

## Documentation Requirements

### README.md Sections

1. **Introduction**
   - What is check-shipment?
   - Why use it?
   - Key features

2. **Installation**
   - Zero-install usage with npx
   - Optional global installation
   - System requirements

3. **Quick Start**
   - Basic usage example
   - Common use cases

4. **Configuration**
   - CLI arguments reference
   - Config file setup
   - Environment-specific configurations

5. **CI/CD Integration**
   - GitHub Actions example
   - GitLab CI example
   - Jenkins example
   - Exit code handling

6. **Examples**
   - Testing local development server
   - Testing staging environment
   - Excluding patterns
   - URL replacement scenarios

7. **Reports**
   - Where reports are saved
   - How to read reports
   - Sharing reports with team

8. **Troubleshooting**
   - Common issues and solutions
   - Playwright browser installation issues
   - SSL certificate errors
   - Timeout issues
   - Memory/performance issues

9. **Contributing**
   - How to contribute
   - Development setup
   - Running tests

10. **License**
    - MIT license information

### CI/CD Integration Examples

**GitHub Actions:**
```yaml
name: Check Website

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - name: Build site
        run: npm run build
      - name: Start server
        run: npm start &
      - name: Wait for server
        run: npx wait-on http://localhost:3000
      - name: Validate website
        run: npx check-shipment --url=http://localhost:3000
```

**GitLab CI:**
```yaml
validate:
  image: node:22
  script:
    - npm run build
    - npm start &
    - npx wait-on http://localhost:3000
    - npx check-shipment --url=http://localhost:3000
  only:
    - merge_requests
    - main
```

## Development Roadmap

### v1.0.0 - Link Validation (Initial Release)
- Core crawling functionality
- Link validation
- Progress reporting
- Markdown reports
- CLI with Commander.js
- Config file support
- CI/CD integration

### v1.1.0 - Enhanced Link Validation
- External link checking (optional)
- Sitemap integration
- Performance metrics (optional)

### v2.0.0 - SEO Validation
- SEO checker module
- Meta tags validation
- Structured data checking

### v3.0.0 - Accessibility Validation
- Accessibility checker module
- WCAG compliance testing
- Comprehensive a11y reports

## Success Criteria

### v1.0.0 Must Have:
- ✅ Successfully crawl React-based websites
- ✅ Detect and report all broken links
- ✅ Handle JavaScript-rendered content
- ✅ Generate markdown reports
- ✅ Work with `npx` (zero-install)
- ✅ Exit with proper codes for CI/CD
- ✅ Configuration file support
- ✅ URL replacement for local testing
- ✅ Clear error messages and help documentation

### Performance Targets:
- Crawl 100 pages in under 2 minutes (with concurrency=3)
- Memory usage under 500MB for typical sites
- Handle sites with 1000+ pages gracefully

### User Experience Goals:
- Single command to run full validation
- Clear, actionable error messages
- Beautiful progress indication
- Easy to integrate into existing workflows
- Minimal configuration required for basic usage

## NPM Package Metadata

**Author:** Shyam Verma
**Repository:** https://github.com/[username]/check-shipment
**Homepage:** https://github.com/[username]/check-shipment#readme
**Bugs:** https://github.com/[username]/check-shipment/issues

## Testing Strategy

### Unit Tests
- URL normalization functions
- Same domain detection
- Config file parsing
- Error categorization

### Integration Tests
- Full crawl of test sites
- Error detection accuracy
- Report generation
- CLI argument parsing

### End-to-End Tests
- Test against real websites
- CI/CD pipeline integration
- Config file scenarios

## Reference Implementation

The reference implementation at `/Users/shyam/www/readybytes.in/nextjs/scripts/validate-urls.ts` provides the following proven patterns:

1. URL normalization and resolution
2. Same domain detection logic
3. Queue-based crawling approach
4. Error handling and categorization
5. Progress reporting structure
6. Summary statistics format

These patterns should be adapted and enhanced for the modular architecture while maintaining the proven functionality.

---

**Specification Version:** 1.0
**Last Updated:** 2025-01-10
**Status:** Ready for Implementation
