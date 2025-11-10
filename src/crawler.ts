import { PlaywrightCrawler, Dataset } from 'crawlee';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { LinkChecker } from './checkers/index.js';
import { CheckShipmentConfig, LinkInfo, CrawlStats, CheckError, ReportData } from './types/index.js';
import { normalizeUrl, isSameDomain, matchesExcludePattern, isNonHtmlContent } from './utils/url.js';

/**
 * Main crawler class
 */
export class WebsiteCrawler {
  private config: CheckShipmentConfig;
  private linkChecker: LinkChecker;
  private discoveredLinks: Map<string, LinkInfo> = new Map();
  private stats: CrawlStats;
  private progressBar: cliProgress.SingleBar | null = null;

  constructor(config: CheckShipmentConfig) {
    this.config = config;
    this.linkChecker = new LinkChecker(
      config.url,
      config.timeout,
      config.retryCount,
      config.replaceFrom,
      config.replaceTo
    );
    this.stats = {
      pagesCrawled: 0,
      linksChecked: 0,
      brokenLinks: 0,
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
   * Initialize progress bar
   */
  initProgressBar(): void {
    this.progressBar = new cliProgress.SingleBar({
      format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} pages | {errors} errors | {duration}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    this.progressBar.start(100, 0, {
      errors: 0,
      duration: '0s'
    });
  }

  /**
   * Update progress bar
   */
  updateProgressBar(): void {
    if (!this.progressBar) return;

    const elapsed = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const duration = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

    // Estimate total pages (this is approximate)
    const estimatedTotal = Math.max(this.stats.pagesCrawled + this.discoveredLinks.size, 100);

    this.progressBar.setTotal(estimatedTotal);
    this.progressBar.update(this.stats.pagesCrawled, {
      errors: this.stats.brokenLinks,
      duration
    });
  }

  /**
   * Stop progress bar
   */
  stopProgressBar(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
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
   * Validate all discovered links
   */
  async validateAllLinks(): Promise<void> {
    const linksToValidate = Array.from(this.discoveredLinks.values()).filter(
      link => link.status === 'pending'
    );

    // Validate links in batches
    const batchSize = this.config.concurrency || 3;
    for (let i = 0; i < linksToValidate.length; i += batchSize) {
      const batch = linksToValidate.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async link => {
          link.status = 'checking';
          const result = await this.linkChecker.validateUrl(link.url);

          if (result.success) {
            link.status = 'success';
          } else {
            link.status = 'error';
            if (result.error) {
              result.error.sourcePages = Array.from(link.sourcePages);
              link.error = result.error;
              this.stats.brokenLinks++;
            }
          }

          this.stats.linksChecked++;
          this.updateProgressBar();
        })
      );
    }
  }

  /**
   * Run the crawler
   */
  async crawl(): Promise<ReportData> {
    console.log(chalk.blue('\nStarting website crawl...\n'));

    // Validate start URL
    await this.validateStartUrl();
    console.log(chalk.green('✓ Start URL is accessible\n'));

    // Initialize progress bar
    this.initProgressBar();

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1000, // Limit to prevent infinite crawls
      maxConcurrency: this.config.concurrency,
      requestHandlerTimeoutSecs: this.config.timeout,

      launchContext: {
        launchOptions: {
          headless: true,
          args: ['--ignore-certificate-errors']
        }
      },

      preNavigationHooks: [
        async ({ request }, goToOptions) => {
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

      requestHandler: async ({ request, page, enqueueLinks }) => {
        try {
          const currentUrl = request.url;

          // Wait for network idle + 1 second for React hydration
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);

          // Extract links using the LinkChecker
          const links = await this.linkChecker.extractLinks(page, currentUrl);

          // Add discovered links to tracking
          for (const link of links) {
            this.addDiscoveredLink(link, currentUrl);
          }

          // Enqueue internal links for crawling
          const linksToEnqueue = links.filter(link => {
            // Skip if already crawled or in queue
            if (this.stats.pagesCrawled > 0 && this.discoveredLinks.has(normalizeUrl(link))) {
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

          // Enqueue links for crawling
          for (const link of linksToEnqueue) {
            await enqueueLinks({
              urls: [link],
              transformRequestFunction: req => {
                req.url = normalizeUrl(req.url);
                return req;
              }
            });
          }

          // Update stats
          this.stats.pagesCrawled++;
          this.updateProgressBar();

        } catch (error: any) {
          // Skip excluded and non-HTML URLs silently
          if (error.message?.includes('excluded') || error.message?.includes('Non-HTML')) {
            return;
          }

          console.error(chalk.yellow(`\n⚠ Failed to crawl: ${request.url}`));
          console.error(chalk.dim(`   Error: ${error.message}\n`));
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

    // Start crawling
    await crawler.run([this.config.url]);

    // Stop progress bar
    this.stopProgressBar();

    console.log(chalk.blue('\n\nValidating discovered links...\n'));

    // Validate all discovered links
    await this.validateAllLinks();

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

    return reportData;
  }
}
