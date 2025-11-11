import { Page, Response } from 'playwright';
import { BaseChecker } from './base.js';
import { CheckResult, CheckError, ErrorType } from '../types/index.js';
import { normalizeUrl, resolveUrl, replaceUrlDomain } from '../utils/url.js';

/**
 * PageValidator - Validates a page that's already loaded in the browser
 * Runs during crawling to check:
 * - HTTP status codes
 * - Soft 404 errors (pages that return 200 but show "not found" content)
 * - Extract links for further crawling
 */
export class PageValidator extends BaseChecker {
  name = 'PageValidator';

  private startUrl: string;
  private replaceFrom?: string;
  private replaceTo?: string;

  constructor(
    startUrl: string,
    replaceFrom?: string,
    replaceTo?: string
  ) {
    super();
    this.startUrl = startUrl;
    this.replaceFrom = replaceFrom;
    this.replaceTo = replaceTo;
  }

  /**
   * Detect soft 404 errors
   * These are pages that return 200 OK but show "not found" content
   */
  async detectSoft404(page: Page): Promise<boolean> {
    try {
      const indicators = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const title = document.title.toLowerCase();

        // Common soft 404 indicators
        const patterns = [
          'page not found',
          '404',
          'not found',
          'page cannot be found',
          'page does not exist',
          'page doesn\'t exist',
          'the page you are looking for',
          'the page you requested',
          'could not be found',
          'no longer exists'
        ];

        // Check if any pattern appears in title or body
        const foundInTitle = patterns.some(pattern => title.includes(pattern));
        const foundInBody = patterns.some(pattern => bodyText.includes(pattern));

        // Additional check: page has very little content (possible error page)
        const hasMinimalContent = bodyText.length < 200;

        return {
          foundInTitle,
          foundInBody,
          hasMinimalContent,
          title,
          bodyLength: bodyText.length
        };
      });

      // Consider it a soft 404 if:
      // 1. "not found" appears in title, OR
      // 2. "not found" appears in body AND page has minimal content
      return indicators.foundInTitle ||
             (indicators.foundInBody && indicators.hasMinimalContent);
    } catch (error) {
      // If we can't analyze the page, assume it's not a soft 404
      return false;
    }
  }

  /**
   * Extract all links from the page
   */
  async extractLinks(page: Page, currentUrl: string): Promise<string[]> {
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href =>
          href &&
          !href.startsWith('javascript:') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('tel:') &&
          !href.startsWith('#') // Skip anchor links
        );
    });

    // Resolve and normalize all links
    const resolvedLinks = links.map(link => {
      let resolved = resolveUrl(currentUrl, link);

      // Apply URL replacement if configured
      if (this.replaceFrom && this.replaceTo) {
        resolved = replaceUrlDomain(resolved, this.replaceFrom, this.replaceTo);
      }

      return normalizeUrl(resolved);
    });

    // Remove duplicates
    return Array.from(new Set(resolvedLinks));
  }

  /**
   * Run validation on an already-loaded page
   * This runs during the crawl phase, not after
   */
  async run(page: Page, url: string, response: Response | null): Promise<CheckResult> {
    const errors: CheckError[] = [];
    const warnings: any[] = [];

    try {
      // Check HTTP status from the response
      if (response) {
        const status = response.status();

        if (status === 404) {
          errors.push({
            type: ErrorType.HTTP_404,
            url,
            message: '404 Not Found',
            statusCode: 404,
            sourcePages: []
          });
        } else if (status >= 500) {
          errors.push({
            type: ErrorType.HTTP_500,
            url,
            message: `${status} Server Error`,
            statusCode: status,
            sourcePages: []
          });
        } else if (status >= 400) {
          errors.push({
            type: ErrorType.HTTP_OTHER,
            url,
            message: `${status} ${response.statusText()}`,
            statusCode: status,
            sourcePages: []
          });
        } else if (status === 200) {
          // Check for soft 404
          const isSoft404 = await this.detectSoft404(page);
          if (isSoft404) {
            errors.push({
              type: ErrorType.HTTP_404,
              url,
              message: '200 OK but appears to be a "Not Found" page (Soft 404)',
              statusCode: 200,
              sourcePages: []
            });
          }
        }
      }

      return {
        passed: errors.length === 0,
        errors,
        warnings
      };
    } catch (error: any) {
      errors.push({
        type: ErrorType.NETWORK_ERROR,
        url,
        message: `Failed to validate page: ${error.message}`,
        sourcePages: []
      });

      return {
        passed: false,
        errors,
        warnings
      };
    }
  }
}
