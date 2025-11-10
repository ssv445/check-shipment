import { Page } from 'playwright';
import { BaseChecker } from './base.js';
import { CheckResult, CheckError, ErrorType, LinkInfo } from '../types/index.js';
import { normalizeUrl, resolveUrl, isSameDomain, isNonHtmlContent, replaceUrlDomain } from '../utils/url.js';

/**
 * LinkChecker - Validates all links on a page
 */
export class LinkChecker extends BaseChecker {
  name = 'LinkChecker';

  private startUrl: string;
  private replaceFrom?: string;
  private replaceTo?: string;
  private timeout: number;
  private retryCount: number;
  private maxRedirects = 5;

  constructor(
    startUrl: string,
    timeout: number = 60,
    retryCount: number = 3,
    replaceFrom?: string,
    replaceTo?: string
  ) {
    super();
    this.startUrl = startUrl;
    this.timeout = timeout;
    this.retryCount = retryCount;
    this.replaceFrom = replaceFrom;
    this.replaceTo = replaceTo;
  }

  /**
   * Extract all links from a page
   */
  async extractLinks(page: Page, currentUrl: string): Promise<string[]> {
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
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

    // Filter to only internal links (same domain)
    const internalLinks = resolvedLinks.filter(link => isSameDomain(link, this.startUrl));

    // Remove duplicates
    return Array.from(new Set(internalLinks));
  }

  /**
   * Validate a single URL
   */
  async validateUrl(url: string, retryAttempt: number = 0): Promise<{ success: boolean; error?: CheckError }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        // @ts-ignore
        headers: {
          'User-Agent': 'check-shipment/1.0.0'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true };
      }

      // Handle error status codes
      let errorType: ErrorType;
      if (response.status === 404) {
        errorType = ErrorType.HTTP_404;
      } else if (response.status >= 500) {
        errorType = ErrorType.HTTP_500;
      } else {
        errorType = ErrorType.HTTP_OTHER;
      }

      return {
        success: false,
        error: {
          type: errorType,
          url,
          message: `${response.status} ${response.statusText}`,
          statusCode: response.status,
          sourcePages: []
        }
      };
    } catch (error: any) {
      // Retry logic
      if (retryAttempt < this.retryCount) {
        // Exponential backoff
        const delay = Math.pow(2, retryAttempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.validateUrl(url, retryAttempt + 1);
      }

      // Categorize error
      let errorType: ErrorType;
      let message: string;

      if (error.name === 'AbortError') {
        errorType = ErrorType.TIMEOUT;
        message = `Request timeout after ${this.timeout} seconds`;
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        errorType = ErrorType.DNS_ERROR;
        message = 'DNS resolution failed';
      } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
        errorType = ErrorType.SSL_ERROR;
        message = 'SSL certificate error';
      } else {
        errorType = ErrorType.NETWORK_ERROR;
        message = error.message || 'Network error';
      }

      return {
        success: false,
        error: {
          type: errorType,
          url,
          message,
          sourcePages: []
        }
      };
    }
  }

  /**
   * Run the link checker on a page
   */
  async run(page: Page, url: string): Promise<CheckResult> {
    const errors: CheckError[] = [];
    const warnings: any[] = [];

    try {
      // Extract all links from the page
      const links = await this.extractLinks(page, url);

      // Note: We don't validate links here, we just extract them
      // The validation will be done by the crawler for all discovered links

      return {
        passed: errors.length === 0,
        errors,
        warnings
      };
    } catch (error: any) {
      errors.push({
        type: ErrorType.NETWORK_ERROR,
        url,
        message: `Failed to extract links: ${error.message}`,
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
