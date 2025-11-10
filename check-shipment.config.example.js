// Example configuration file for check-shipment
// Copy this file to check-shipment.config.js and modify as needed

export default {
  // Starting URL to crawl (required)
  url: 'http://localhost:3000',

  // Number of parallel requests (default: 3)
  concurrency: 3,

  // Request timeout in seconds (default: 60)
  timeout: 60,

  // URL patterns to skip (supports wildcards *)
  // Examples: '/admin/*', '/api/*', '*.pdf', '/downloads/*'
  excludePatterns: [
    '/admin/*',
    '/api/*',
    '*.pdf'
  ],

  // Domain replacement for testing local sites with production URLs
  // replaceFrom: 'https://production.com',
  // replaceTo: 'http://localhost:3000',

  // Number of retry attempts for failed requests (default: 3)
  retryCount: 3,

  // Exit 0 even if broken links found (default: false)
  noFail: false
};
