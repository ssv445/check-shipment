# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-10

### Added
- **Sitemap Support**: Automatically discover and use sitemap.xml for faster URL discovery
- `--use-sitemap` flag to enable sitemap-based crawling
- `--sitemap-url` option to specify custom sitemap URL
- Support for sitemap indexes (sitemapindex.xml)
- Support for gzipped sitemaps (.xml.gz)
- Automatic sitemap discovery from common locations and robots.txt
- Configuration options: `useSitemap` and `sitemapUrl` in config file

### Changed
- Improved crawling performance for large websites when using sitemaps
- Updated README with sitemap usage examples and benefits
- Added sitemap configuration to example config file

### Technical
- New `src/utils/sitemap.ts` module for sitemap parsing
- Uses xml2js for XML parsing
- Added xml2js as production dependency

## [1.0.0] - 2025-11-10

### Added
- Initial release of check-shipment
- **Link Validation**: Crawl and validate all internal links on a website
- **JavaScript Support**: Full browser rendering using Playwright for React/Vue/Angular apps
- **Progress Reporting**: Real-time progress bar with statistics
- **Console Reporter**: Beautiful formatted table output in terminal
- **Markdown Reports**: Detailed reports saved to `.check-shipment/report-[timestamp].md`
- **Configuration File Support**: Use `check-shipment.config.js` for persistent configuration
- **CLI Options**: Comprehensive command-line arguments for all features
- **URL Replacement**: Test local sites with production URLs
- **Exclude Patterns**: Skip specific URL patterns with wildcard support
- **Error Handling**: Automatic retry with exponential backoff
- **Exit Codes**: Proper exit codes for CI/CD integration (0 = success, 1 = broken links, 2 = error)
- **Concurrency Control**: Parallel crawling with configurable concurrency
- **Timeout Configuration**: Configurable request timeout
- **Error Categorization**: Detailed error types (404, 500, Timeout, DNS Error, SSL Error, etc.)

### Features
- ✅ Crawl websites with full JavaScript rendering
- ✅ Detect broken links (404, 500, network errors)
- ✅ Handle redirects (up to 5 redirects)
- ✅ Exclude patterns with wildcards
- ✅ URL replacement for local testing
- ✅ Configuration file support
- ✅ Beautiful progress bars
- ✅ Comprehensive error messages
- ✅ CI/CD ready with proper exit codes
- ✅ Zero-install with npx support

### Documentation
- Comprehensive README.md with examples
- CLI help documentation
- Configuration file examples
- CI/CD integration examples (GitHub Actions, GitLab CI, Jenkins)
- Troubleshooting guide

### Technical Details
- Built with TypeScript
- Uses Crawlee + Playwright for crawling
- Commander.js for CLI
- cli-progress for progress bars
- cli-table3 for formatted output
- chalk for colored terminal output
- ESM module system
- Node.js 22+ required

[1.0.0]: https://github.com/shyamverma/check-shipment/releases/tag/v1.0.0
