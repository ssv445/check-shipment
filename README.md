# check-shipment

> Zero-install website validator - Check broken links and SEO before deployment

Catch broken links and SEO issues before your users do. One command, zero configuration.

## Features

- ✅ **Link Validation** - Find 404s, broken links, and network errors
- 🔍 **SEO Checks** - Validate canonical URLs, meta tags, and Open Graph
- 🚀 **JavaScript Support** - Full browser rendering for React, Vue, Next.js
- ⚡ **Fast** - Parallel crawling with sitemap support
- 🔧 **Zero Install** - Run with `npx`, no setup needed

## Quick Start

```bash
# Check any website
npx check-shipment --url=https://example.com

# Check local dev server
npx check-shipment --url=http://localhost:3000

# Use sitemap (recommended for speed)
npx check-shipment --url=https://example.com --use-sitemap
```

**Requirements:** Node.js 22+

## Usage

### Basic Command

```bash
npx check-shipment --url=<url>
```

### Common Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url` | Starting URL to crawl | Required |
| `--use-sitemap` | Use sitemap.xml (faster) | false |
| `--concurrency` | Parallel requests | 3 |
| `--exclude-patterns` | Skip URL patterns | none |
| `--timeout` | Request timeout (seconds) | 60 |
| `--no-fail` | Don't exit with error code | false |

### Config File

Create `check-shipment.config.js`:

```javascript
export default {
  url: 'http://localhost:3000',
  useSitemap: true,
  excludePatterns: ['/admin/*', '*.pdf'],
  concurrency: 5
};
```

Then run: `npx check-shipment`

## Examples

```bash
# Basic usage
npx check-shipment --url=http://localhost:3000

# With sitemap (recommended)
npx check-shipment --url=https://example.com --use-sitemap

# Exclude patterns
npx check-shipment --url=https://example.com \
  --exclude-patterns="/admin/*,*.pdf"

# Test local with production URLs
npx check-shipment --url=http://localhost:3000 \
  --replaceFrom=https://production.com \
  --replaceTo=http://localhost:3000

# Faster crawling
npx check-shipment --url=https://example.com \
  --concurrency=10 --use-sitemap
```

## SEO Validation

Automatically checks every page for:

1. **Canonical URL** - Validates presence and correctness
2. **Meta Description** - Checks existence and length (50-160 chars)
3. **Page Title** - Ensures proper title tags (30-60 chars)
4. **Open Graph Tags** - Validates og:title, og:description, og:image

Example output:
```
============================================================
SEO VALIDATION SUMMARY
============================================================
Total pages checked: 25
✓ Passed all SEO checks: 20
✗ Failed one or more checks: 5

Individual SEO Checks:
────────────────────────────────────────────────────────────
  1. Canonical URL
     Checked: 25 | ✓ Passed: 22 | ✗ Failed: 3
  2. Meta Description
     Checked: 25 | ✓ Passed: 24 | ✗ Failed: 1
  3. Page Title
     Checked: 25 | ✓ Passed: 25 | ✗ Failed: 0
  4. Open Graph Tags
     Checked: 25 | ✓ Passed: 20 | ✗ Failed: 5
============================================================
```

## CI/CD Integration

**Exit Codes:**
- `0` - Success
- `1` - Broken links or SEO errors found
- `2` - Configuration error

**GitHub Actions:**
```yaml
- name: Validate website
  run: npx check-shipment --url=http://localhost:3000
```

**Package.json script:**
```json
{
  "scripts": {
    "validate": "check-shipment --url=http://localhost:3000"
  }
}
```

## Reports

Markdown reports are saved to `.check-shipment/report-[timestamp].md`

**What gets checked:**
- Broken links (404s, 500s, timeouts, DNS errors)
- SEO issues (missing canonical, meta tags, Open Graph)
- Soft 404s (pages that return 200 but show "not found")

**How it works:**
1. Renders pages with Playwright (full JavaScript support)
2. Extracts and validates all links
3. Checks SEO on every page
4. Generates detailed console + markdown reports

## Troubleshooting

**Playwright browser issues:**
```bash
npx playwright install chromium
```

**Pages timing out:**
```bash
npx check-shipment --url=https://example.com --timeout=120
```

**Slow on large sites:**
```bash
# Use sitemap + higher concurrency
npx check-shipment --url=https://example.com --use-sitemap --concurrency=10
```

## Development

```bash
git clone https://github.com/shyamverma/check-shipment.git
cd check-shipment
npm install
npm run dev -- --url=http://localhost:3000
```

## License

MIT © [Shyam Verma](https://github.com/shyamverma)

---

**⭐ [Star on GitHub](https://github.com/shyamverma/check-shipment) | 🐛 [Report Issues](https://github.com/shyamverma/check-shipment/issues)**
