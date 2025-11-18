import { PlaywrightCrawler, log } from 'crawlee';
import { LinkChecker } from './checkers/index.js';
import { PageValidator } from './checkers/page-validator.js';
import { SEOValidator } from './checkers/seo-validator.js';
import { CheckShipmentConfig, LinkInfo, CrawlStats, CheckError, ReportData } from './types/index.js';
import { normalizeUrl, isSameDomain, matchesExcludePattern, isNonHtmlContent } from './utils/url.js';
import { discoverSitemap, getSitemapUrls } from './utils/sitemap.js';

/**
 * Main crawler class
 */
export class WebsiteCrawler {
  private config: CheckShipmentConfig;
  private linkChecker: LinkChecker;
  private pageValidator: PageValidator;
  private seoValidator: SEOValidator;
  private discoveredLinks: Map<string, LinkInfo> = new Map();
  private crawledUrls: Set<string> = new Set(); // Track URLs already crawled in browser
  private stats: CrawlStats;

  constructor(config: CheckShipmentConfig) {
    this.config = config;
    this.linkChecker = new LinkChecker(
      config.url,
      config.timeout,
      config.retryCount,
      config.replaceFrom,
      config.replaceTo
    );
    this.pageValidator = new PageValidator(
      config.url,
      config.replaceFrom,
      config.replaceTo
    );
    this.seoValidator = new SEOValidator();
    this.stats = {
      pagesCrawled: 0,
      linksChecked: 0,
      brokenLinks: 0,
      skippedLinks: 0,
      seoChecked: 0,
      seoErrors: 0,
      seoCheckStats: {
        canonicalUrl: { checked: 0, passed: 0, failed: 0 },
        metaDescription: { checked: 0, passed: 0, failed: 0 },
        pageTitle: { checked: 0, passed: 0, failed: 0 },
        openGraphTags: { checked: 0, passed: 0, failed: 0 }
      },
      startTime: Date.now()
    };
  }

  /**
   * Validate the start URL before beginning crawl
   */
  async validateStartUrl(): Promise<void> {
    const result = await this.linkChecker.validateUrl(this.config.url);
    if (!result.success) {
      throw new Error(
        `Start URL is not accessible: ${this.config.url}\n` +
        `Error: ${result.error?.message}\n\n` +
        `Please ensure:\n` +
        `  1. The URL is correct\n` +
        `  2. The server is running (if localhost)\n` +
        `  3. The domain is accessible`
      );
    }
  }

  /**
   * Print simple status update
   */
  printStatus(url: string, status: 'crawled' | 'validated', isError: boolean = false): void {
    const timestamp = new Date().toISOString().substring(11, 19);
    const statusText = status === 'crawled' ? 'CRAWLED' : isError ? 'ERROR' : 'OK';
    console.log(`[${timestamp}] ${statusText} ${url}`);
  }

  /**
   * Print queue status
   */
  printQueueStatus(): void {
    const pending = Array.from(this.discoveredLinks.values()).filter(l => l.status === 'pending').length;
    console.log(`Queue: ${this.stats.pagesCrawled} crawled, ${this.stats.linksChecked} validated, ${this.stats.skippedLinks} skipped, ${pending} pending, ${this.stats.brokenLinks} errors`);
  }

  /**
   * Add a discovered link to the tracking map
   */
  addDiscoveredLink(url: string, sourcePage: string): void {
    const normalizedUrl = normalizeUrl(url);

    if (!this.discoveredLinks.has(normalizedUrl)) {
      this.discoveredLinks.set(normalizedUrl, {
        url: normalizedUrl,
        sourcePages: new Set([sourcePage]),
        status: 'pending'
      });
    } else {
      const linkInfo = this.discoveredLinks.get(normalizedUrl)!;
      linkInfo.sourcePages.add(sourcePage);
    }
  }

  /**
   * Validate remaining links that weren't crawled (external links, skipped links, etc.)
   * This is for links that were discovered but not loaded in the browser
   */
  async validateRemainingLinks(): Promise<void> {
    // Only validate links that haven't been validated yet (status === 'pending')
    const linksToValidate = Array.from(this.discoveredLinks.values()).filter(
      link => link.status === 'pending'
    );

    if (linksToValidate.length === 0) {
      console.log('\nAll discovered links have been validated during crawling.\n');
      return;
    }

    console.log(`\nValidating ${linksToValidate.length} remaining links (concurrency: ${this.config.concurrency})...\n`);

    // Validate links in batches
    const batchSize = this.config.concurrency || 3;
    for (let i = 0; i < linksToValidate.length; i += batchSize) {
      const batch = linksToValidate.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async link => {
          // Check if URL should be excluded
          if (this.config.excludePatterns && matchesExcludePattern(link.url, this.config.excludePatterns)) {
            link.status = 'skipped';
            link.skipReason = 'Excluded by pattern';
            this.stats.skippedLinks++;
            const timestamp = new Date().toISOString().substring(11, 19);
            console.log(`[${timestamp}] SKIP ${link.url} (excluded by pattern)`);
            return;
          }

          // Check if URL is non-HTML content
          if (isNonHtmlContent(link.url)) {
            link.status = 'skipped';
            link.skipReason = 'Non-HTML content';
            this.stats.skippedLinks++;
            const timestamp = new Date().toISOString().substring(11, 19);
            console.log(`[${timestamp}] SKIP ${link.url} (non-HTML content)`);
            return;
          }

          link.status = 'checking';
          const result = await this.linkChecker.validateUrl(link.url);

          const timestamp = new Date().toISOString().substring(11, 19);

          if (result.success) {
            link.status = 'success';
            console.log(`[${timestamp}] 200 ${link.url}`);
          } else {
            link.status = 'error';
            if (result.error) {
              result.error.sourcePages = Array.from(link.sourcePages);
              link.error = result.error;
              this.stats.brokenLinks++;
              // Show only HTTP error code for errors
              const errorCode = result.error.statusCode || result.error.type;
              console.log(`[${timestamp}] ${errorCode} ${link.url}`);
            }
          }

          this.stats.linksChecked++;
        })
      );

      // Print queue status every 20 URLs
      if ((i + batchSize) % 20 === 0 || i + batchSize >= linksToValidate.length) {
        this.printQueueStatus();
      }
    }

    console.log(`\nRemaining validation complete: ${this.stats.linksChecked} total checked, ${this.stats.brokenLinks} errors, ${this.stats.skippedLinks} skipped\n`);
  }

  /**
   * Fetch URLs from sitemap if enabled
   */
  async fetchSitemapUrls(): Promise<string[]> {
    if (!this.config.useSitemap) {
      return [];
    }

    try {
      console.log('Fetching URLs from sitemap...\n');

      // Use provided sitemap URL or discover it
      let sitemapUrl: string | undefined = this.config.sitemapUrl;
      if (!sitemapUrl) {
        const discoveredUrl = await discoverSitemap(this.config.url);
        if (!discoveredUrl) {
          console.log('No sitemap found, falling back to regular crawl\n');
          return [];
        }
        sitemapUrl = discoveredUrl;
      }

      console.log(`Using sitemap: ${sitemapUrl}\n`);

      const urls = await getSitemapUrls(sitemapUrl, this.config.url);

      // Don't filter - add all URLs to queue and handle exclusion during validation
      // Randomize URLs to find broken links faster
      const shuffled = urls.sort(() => Math.random() - 0.5);

      console.log(`Found ${urls.length} URLs in sitemap (randomized)\n`);
      return shuffled;
    } catch (error: any) {
      console.log(`Failed to fetch sitemap: ${error.message}`);
      console.log('Falling back to regular crawl\n');
      return [];
    }
  }

  /**
   * Run the crawler
   */
  async crawl(): Promise<ReportData> {
    // Configure logging level based on verbose flag
    if (!this.config.verbose) {
      log.setLevel(log.LEVELS.ERROR); // Only show errors, hide INFO/WARN
    }

    console.log('\nStarting website crawl...\n');

    // Validate start URL
    await this.validateStartUrl();
    console.log('Start URL is accessible\n');

    // Fetch sitemap URLs if enabled
    const sitemapUrls = await this.fetchSitemapUrls();

    console.log('Starting crawler...\n');

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1000, // Limit to prevent infinite crawls
      maxConcurrency: this.config.concurrency,
      requestHandlerTimeoutSecs: this.config.timeout,

      launchContext: {
        launchOptions: {
          headless: true,
          args: [
            '--ignore-certificate-errors',
            '--use-mock-keychain', // Prevent macOS keychain access prompt
            '--password-store=basic' // Use basic password storage instead of system keychain
          ]
        }
      },

      preNavigationHooks: [
        // Block unnecessary resources to speed up page loads
        async ({ page, request }, goToOptions) => {
          // Block images, stylesheets, fonts, and other non-essential resources
          await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();

            // Block images, stylesheets, fonts, media
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
              return route.abort();
            }

            // Block external scripts (CDN, analytics, etc.) but keep same-origin scripts
            if (resourceType === 'script') {
              const isSameOrigin = url.startsWith(this.config.url);
              if (!isSameOrigin) {
                return route.abort();
              }
            }

            return route.continue();
          });

          // Check if URL should be excluded
          if (this.config.excludePatterns && matchesExcludePattern(request.url, this.config.excludePatterns)) {
            request.noRetry = true;
            throw new Error('URL excluded by pattern');
          }

          // Check if URL is non-HTML content
          if (isNonHtmlContent(request.url)) {
            request.noRetry = true;
            throw new Error('Non-HTML content');
          }

          // Set longer timeout for navigation
          goToOptions.timeout = this.config.timeout! * 1000;
        }
      ],

      requestHandler: async ({ request, page, enqueueLinks, response }) => {
        try {
          const currentUrl = normalizeUrl(request.url);

          // Mark this URL as crawled
          this.crawledUrls.add(currentUrl);

          // Wait for network idle + 1 second for React hydration
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);

          // === VALIDATION STEP: Validate the loaded page immediately ===
          const validationResult = await this.pageValidator.run(page, currentUrl, response || null);

          // === SEO VALIDATION: Run SEO checks on the page ===
          const seoResult = await this.seoValidator.run(page, currentUrl);

          // Track SEO validation stats
          this.stats.seoChecked++;

          // Track individual SEO check results
          const seoStats = this.stats.seoCheckStats!;

          // Canonical URL check
          seoStats.canonicalUrl.checked++;
          const hasCanonicalError = seoResult.errors.some(e =>
            e.type === 'Missing Canonical URL' ||
            e.type === 'Duplicate Canonical URLs' ||
            e.type === 'Invalid Canonical URL'
          );
          if (hasCanonicalError) {
            seoStats.canonicalUrl.failed++;
          } else {
            seoStats.canonicalUrl.passed++;
          }

          // Meta Description check
          seoStats.metaDescription.checked++;
          const hasMetaDescError = seoResult.errors.some(e => e.type === 'Missing Meta Description');
          if (hasMetaDescError) {
            seoStats.metaDescription.failed++;
          } else {
            seoStats.metaDescription.passed++;
          }

          // Page Title check
          seoStats.pageTitle.checked++;
          const hasTitleError = seoResult.errors.some(e => e.type === 'Missing Page Title');
          if (hasTitleError) {
            seoStats.pageTitle.failed++;
          } else {
            seoStats.pageTitle.passed++;
          }

          // Open Graph Tags check
          seoStats.openGraphTags.checked++;
          const hasOgError = seoResult.errors.some(e => e.type === 'Missing Open Graph Tags');
          if (hasOgError) {
            seoStats.openGraphTags.failed++;
          } else {
            seoStats.openGraphTags.passed++;
          }

          // Track overall SEO errors
          if (seoResult.errors.length > 0) {
            this.stats.seoErrors++;
          }

          // Merge errors from both validators
          const allErrors = [...validationResult.errors, ...seoResult.errors];
          const allWarnings = [...validationResult.warnings, ...seoResult.warnings];

          const timestamp = new Date().toISOString().substring(11, 19);

          // Add/update link info with validation result
          if (!this.discoveredLinks.has(currentUrl)) {
            this.discoveredLinks.set(currentUrl, {
              url: currentUrl,
              sourcePages: new Set(['Direct navigation']),
              status: allErrors.length > 0 ? 'error' : 'success'
            });
          }

          // Record any errors found during validation
          if (allErrors.length > 0) {
            const linkInfo = this.discoveredLinks.get(currentUrl)!;
            linkInfo.status = 'error';
            linkInfo.error = allErrors[0]; // Take first error
            linkInfo.error.sourcePages = Array.from(linkInfo.sourcePages);
            this.stats.brokenLinks++;

            const errorCode = linkInfo.error.statusCode || linkInfo.error.type;
            console.log(`[${timestamp}] ${errorCode} ${currentUrl}`);
          } else {
            const linkInfo = this.discoveredLinks.get(currentUrl)!;
            linkInfo.status = 'success';
            console.log(`[${timestamp}] 200 ${currentUrl}`);
          }

          this.stats.linksChecked++;

          // === LINK EXTRACTION: Extract links for further crawling ===
          const links = await this.pageValidator.extractLinks(page, currentUrl);

          // Add discovered links to tracking
          for (const link of links) {
            this.addDiscoveredLink(link, currentUrl);
          }

          // Enqueue internal links for crawling
          const linksToEnqueue = links.filter(link => {
            const normalized = normalizeUrl(link);

            // Skip if already crawled in browser
            if (this.crawledUrls.has(normalized)) {
              return false;
            }

            // Skip if matches exclude patterns
            if (this.config.excludePatterns && matchesExcludePattern(link, this.config.excludePatterns)) {
              return false;
            }

            // Skip non-HTML content
            if (isNonHtmlContent(link)) {
              return false;
            }

            // Only internal links
            return isSameDomain(link, this.config.url);
          });

          // Enqueue unique links for crawling
          for (const link of linksToEnqueue) {
            const normalized = normalizeUrl(link);
            // Double-check before enqueuing
            if (!this.crawledUrls.has(normalized)) {
              await enqueueLinks({
                urls: [normalized],
                transformRequestFunction: req => {
                  req.url = normalizeUrl(req.url);
                  return req;
                }
              });
            }
          }

          // Update stats
          this.stats.pagesCrawled++;

          // Print queue status every 10 pages
          if (this.stats.pagesCrawled % 10 === 0) {
            this.printQueueStatus();
          }

        } catch (error: any) {
          // Skip excluded and non-HTML URLs silently
          if (error.message?.includes('excluded') || error.message?.includes('Non-HTML')) {
            return;
          }

          const timestamp = new Date().toISOString().substring(11, 19);
          console.error(`[${timestamp}] ERROR CRAWL - ${request.url}: ${error.message}`);
        }
      },

      failedRequestHandler: async ({ request }, error) => {
        // Record failed page as broken
        const linkInfo: LinkInfo = {
          url: request.url,
          sourcePages: new Set(['Direct navigation']),
          status: 'error',
          error: {
            type: error.message.includes('timeout')
              ? 'Timeout' as any
              : 'Network Error' as any,
            url: request.url,
            message: error.message,
            sourcePages: ['Direct navigation']
          }
        };

        this.discoveredLinks.set(request.url, linkInfo);
        this.stats.brokenLinks++;
      }
    });

    // Start crawling with either sitemap URLs or the start URL
    if (sitemapUrls.length > 0) {
      // If using sitemap, ONLY use sitemap URLs (no crawling)
      for (const url of sitemapUrls) {
        this.addDiscoveredLink(url, 'sitemap.xml');
      }

      console.log(`\nUsing ${sitemapUrls.length} URLs from sitemap, skipping regular crawl\n`);
      this.stats.pagesCrawled = 0; // No pages were actually crawled in browser
    } else {
      // Regular crawl starting from the configured URL
      await crawler.run([this.config.url]);
      console.log('\nCrawling complete. Found ' + this.discoveredLinks.size + ' unique URLs\n');
    }

    // Validate remaining links that weren't crawled (external links, etc.)
    await this.validateRemainingLinks();

    // Print SEO validation summary
    const seoPassedCount = this.stats.seoChecked - this.stats.seoErrors;
    const seoStats = this.stats.seoCheckStats!;

    console.log('\n' + '='.repeat(60));
    console.log('SEO VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total pages checked: ${this.stats.seoChecked}`);
    console.log(`✓ Passed all SEO checks: ${seoPassedCount}`);
    console.log(`✗ Failed one or more checks: ${this.stats.seoErrors}`);
    console.log('');
    console.log('Individual SEO Checks:');
    console.log('─'.repeat(60));
    console.log(`  1. Canonical URL`);
    console.log(`     Checked: ${seoStats.canonicalUrl.checked} | ✓ Passed: ${seoStats.canonicalUrl.passed} | ✗ Failed: ${seoStats.canonicalUrl.failed}`);
    console.log(`  2. Meta Description`);
    console.log(`     Checked: ${seoStats.metaDescription.checked} | ✓ Passed: ${seoStats.metaDescription.passed} | ✗ Failed: ${seoStats.metaDescription.failed}`);
    console.log(`  3. Page Title`);
    console.log(`     Checked: ${seoStats.pageTitle.checked} | ✓ Passed: ${seoStats.pageTitle.passed} | ✗ Failed: ${seoStats.pageTitle.failed}`);
    console.log(`  4. Open Graph Tags`);
    console.log(`     Checked: ${seoStats.openGraphTags.checked} | ✓ Passed: ${seoStats.openGraphTags.passed} | ✗ Failed: ${seoStats.openGraphTags.failed}`);
    console.log('='.repeat(60) + '\n');

    // Finalize stats
    this.stats.endTime = Date.now();

    // Collect errors
    const errors: CheckError[] = Array.from(this.discoveredLinks.values())
      .filter(link => link.error)
      .map(link => link.error!);

    // Generate report data
    const reportData: ReportData = {
      config: this.config,
      stats: this.stats,
      errors,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    // Clean up resources
    this.linkChecker.destroy();

    // Clear data structures to free memory
    this.discoveredLinks.clear();
    this.crawledUrls.clear();

    return reportData;
  }
}
