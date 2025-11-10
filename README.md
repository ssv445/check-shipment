# check-shipment

> Zero-install website validator for checking broken links, SEO, and accessibility before deployment

`check-shipment` is a powerful CLI tool designed for developers to test their websites for common issues before deployment. It provides a single command that can be integrated into development workflows to catch obvious problems before shipping to production.

## Features

✅ **Link Validation** - Detect broken links, 404s, and network errors
🚀 **JavaScript Support** - Full browser rendering for React, Vue, and other SPA frameworks
⚡ **Fast & Concurrent** - Parallel crawling for quick results
📊 **Beautiful Reports** - Console output and markdown reports
🔧 **Zero Install** - Run directly with `npx`
🎯 **CI/CD Ready** - Perfect for pre-deployment checks
⚙️ **Configurable** - Support for config files and CLI options

## Quick Start

```bash
# Run directly with npx (no installation required)
npx check-shipment --url=https://example.com

# Test local development server
npx check-shipment --url=http://localhost:3000

# Use configuration file
npx check-shipment
```

## Installation

### Zero-Install (Recommended)

Run directly with `npx`:

```bash
npx check-shipment --url=https://example.com
```

### Global Installation

For frequent use:

```bash
npm install -g check-shipment
check-shipment --url=https://example.com
```

### Requirements

- **Node.js**: Version 22 or higher
- **Operating Systems**: macOS, Linux, Windows

## Usage

### Basic Usage

```bash
npx check-shipment --url=<url> [options]
```

### CLI Options

#### Required Arguments

- `--url=<url>` - Starting URL to crawl

#### Crawling Options

- `--concurrency=<number>` - Number of parallel requests (default: 3)
- `--timeout=<number>` - Request timeout in seconds (default: 60)
- `--exclude-patterns=<patterns>` - Comma-separated URL patterns to skip
- `--retry-count=<number>` - Number of retry attempts for failed requests (default: 3)
- `--use-sitemap` - Use sitemap.xml to discover URLs (faster, recommended)
- `--sitemap-url=<url>` - Custom sitemap URL (auto-discovers if not provided)

#### URL Replacement

- `--replaceFrom=<url>` - Domain to replace in discovered links
- `--replaceTo=<url>` - Domain to replace it with

#### Output Options

- `--no-fail` - Exit with code 0 even if broken links are found

### Configuration File

Create a `check-shipment.config.js` file in your project root:

```javascript
export default {
  url: 'http://localhost:3000',
  concurrency: 3,
  timeout: 60,
  excludePatterns: ['/admin/*', '/api/*', '*.pdf'],
  retryCount: 3,
  noFail: false,
  useSitemap: true, // Use sitemap.xml for faster URL discovery
  // sitemapUrl: 'https://example.com/sitemap.xml' // Optional: specify custom sitemap
};
```

**Note:** CLI arguments override config file values.

## Examples

### Test Local Development Server

```bash
npx check-shipment --url=http://localhost:3000
```

### Test Local Site with Production URLs

If your local site has links pointing to production:

```bash
npx check-shipment --url=http://localhost:3000 \
  --replaceFrom=https://production.com \
  --replaceTo=http://localhost:3000
```

### Exclude Specific Patterns

```bash
npx check-shipment --url=https://example.com \
  --exclude-patterns="/admin/*,/api/*,*.pdf"
```

### Higher Concurrency for Faster Crawls

```bash
npx check-shipment --url=https://example.com \
  --concurrency=10
```

### Use in Reporting Mode (No CI Failures)

```bash
npx check-shipment --url=https://example.com --no-fail
```

### Use Sitemap for Faster Discovery

Using sitemap.xml is **highly recommended** for faster and more comprehensive URL discovery:

```bash
# Auto-discover and use sitemap.xml
npx check-shipment --url=https://example.com --use-sitemap

# Use a specific sitemap URL
npx check-shipment --url=https://example.com \
  --use-sitemap \
  --sitemap-url=https://example.com/sitemap.xml
```

**Benefits of using sitemap:**
- Much faster than crawling every page
- Discovers all URLs without following links
- Works with large websites (1000+ pages)
- Automatically handles sitemap indexes
- Supports gzipped sitemaps (.xml.gz)

## CI/CD Integration

`check-shipment` is designed for seamless CI/CD integration.

### Exit Codes

- **0** - Success (no broken links or `--no-fail` flag used)
- **1** - Broken links found
- **2** - Configuration or crawler error

### GitHub Actions

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

      - name: Install dependencies
        run: npm install

      - name: Build site
        run: npm run build

      - name: Start server
        run: npm start &

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Validate website
        run: npx check-shipment --url=http://localhost:3000
```

### GitLab CI

```yaml
validate:
  image: node:22
  script:
    - npm install
    - npm run build
    - npm start &
    - npx wait-on http://localhost:3000
    - npx check-shipment --url=http://localhost:3000
  only:
    - merge_requests
    - main
```

### Jenkins

```groovy
pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                sh 'npm install'
                sh 'npm run build'
            }
        }

        stage('Test') {
            steps {
                sh 'npm start &'
                sh 'npx wait-on http://localhost:3000'
                sh 'npx check-shipment --url=http://localhost:3000'
            }
        }
    }
}
```

## Reports

Reports are automatically saved to `.check-shipment/report-[timestamp].md`

### Report Format

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
| http://localhost:3000/old-page | http://localhost:3000/blog |
| http://localhost:3000/missing | http://localhost:3000/about |

---

*Generated by check-shipment v1.0.0*
```

## How It Works

1. **Crawling** - Uses Playwright to render pages with full JavaScript support
2. **Link Discovery** - Extracts all internal links from each page
3. **Validation** - Tests each discovered link for accessibility
4. **Reporting** - Generates detailed reports in console and markdown format

### Features

- Full browser rendering (supports React, Vue, Angular, etc.)
- Handles client-side routing and hydration
- Follows redirects (up to 5 redirects)
- Categorizes errors by type (404, 500, Timeout, DNS Error, SSL Error, etc.)
- Exponential backoff retry logic
- Excludes patterns support (wildcards)
- URL replacement for local testing

## Troubleshooting

### Playwright Browser Installation Issues

If you encounter issues with Playwright browser installation:

```bash
# Install browsers manually
npx playwright install chromium
```

### SSL Certificate Errors

SSL errors are ignored by default. If you want to enforce SSL validation, this can be configured in a future version.

### Timeout Issues

If pages are timing out:

```bash
# Increase timeout
npx check-shipment --url=https://example.com --timeout=120
```

### Memory/Performance Issues

For large websites:

```bash
# Reduce concurrency
npx check-shipment --url=https://example.com --concurrency=1
```

### Common Issues

**Issue:** "Start URL is not accessible"
- **Solution:** Ensure the server is running and the URL is correct

**Issue:** "Too many pages to crawl"
- **Solution:** Use `--exclude-patterns` to skip unnecessary sections

**Issue:** "Slow crawling"
- **Solution:** Increase `--concurrency` for faster results

## Roadmap

### v1.x - Link Validation
- ✅ Core link validation
- ✅ Progress reporting
- ✅ Markdown reports
- ✅ Config file support
- ⏳ External link checking (optional)
- ⏳ Sitemap integration

### v2.x - SEO Validation
- Meta tags validation
- Structured data checking
- Open Graph tags
- Mobile-friendliness

### v3.x - Accessibility Validation
- WCAG compliance testing
- ARIA validation
- Color contrast checking
- Keyboard navigation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/shyamverma/check-shipment.git
cd check-shipment

# Install dependencies
pnpm install

# Run in development mode
pnpm dev --url=http://localhost:3000

# Build
pnpm build

# Run tests
pnpm test
```

## License

MIT © [Shyam Verma](https://github.com/shyamverma)

## Links

- [GitHub Repository](https://github.com/shyamverma/check-shipment)
- [Issue Tracker](https://github.com/shyamverma/check-shipment/issues)
- [NPM Package](https://www.npmjs.com/package/check-shipment)

## Support

If you find this tool helpful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 📖 Improving documentation

---

**Made with ❤️ by [Shyam Verma](https://github.com/shyamverma)**
