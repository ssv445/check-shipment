import { Page } from 'playwright';
import { BaseChecker } from './base.js';
import { CheckResult, CheckError, ErrorType, LinkInfo } from '../types/index.js';
import { normalizeUrl, resolveUrl, isSameDomain, isNonHtmlContent, replaceUrlDomain } from '../utils/url.js';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * LinkChecker - Validates all links on a page
 * Optimized with connection pooling, caching, and compression
 */
export class LinkChecker extends BaseChecker {
  name = 'LinkChecker';

  private startUrl: string;
  private replaceFrom?: string;
  private replaceTo?: string;
  private timeout: number;
  private retryCount: number;
  private maxRedirects = 5;

  // Performance optimizations
  private httpAgent: HttpAgent;
  private httpsAgent: HttpsAgent;
  private responseCache: Map<string, { success: boolean; error?: CheckError; timestamp: number }>;
  private cacheTTL = 60000; // 60 seconds cache

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

    // Initialize HTTP agents with connection pooling and keep-alive
    this.httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50, // Max concurrent connections
      maxFreeSockets: 10,
      timeout: this.timeout * 1000
    });

    this.httpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: this.timeout * 1000,
      rejectUnauthorized: false // Handle self-signed certificates
    });

    // Initialize response cache
    this.responseCache = new Map();
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
   * Validate a single URL with caching and connection pooling
   */
  async validateUrl(url: string, retryAttempt: number = 0): Promise<{ success: boolean; error?: CheckError }> {
    // Check cache first
    const cached = this.responseCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return { success: cached.success, error: cached.error };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

      // Determine which agent to use
      const isHttps = url.startsWith('https://');
      const agent = isHttps ? this.httpsAgent : this.httpAgent;

      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        // @ts-ignore - Node.js fetch supports agent
        agent,
        headers: {
          'User-Agent': 'check-shipment/1.2.0',
          'Accept-Encoding': 'gzip, deflate, br', // Request compression
          'Connection': 'keep-alive' // Explicit keep-alive
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Cache successful response
        this.responseCache.set(url, { success: true, timestamp: Date.now() });
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

      const error: CheckError = {
        type: errorType,
        url,
        message: `${response.status} ${response.statusText}`,
        statusCode: response.status,
        sourcePages: []
      };

      // Cache error response
      this.responseCache.set(url, { success: false, error, timestamp: Date.now() });

      return { success: false, error };
    } catch (err: any) {
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

      if (err.name === 'AbortError') {
        errorType = ErrorType.TIMEOUT;
        message = `Request timeout after ${this.timeout} seconds`;
      } else if (err.message?.includes('ENOTFOUND') || err.message?.includes('getaddrinfo')) {
        errorType = ErrorType.DNS_ERROR;
        message = 'DNS resolution failed';
      } else if (err.message?.includes('certificate') || err.message?.includes('SSL')) {
        errorType = ErrorType.SSL_ERROR;
        message = 'SSL certificate error';
      } else {
        errorType = ErrorType.NETWORK_ERROR;
        message = err.message || 'Network error';
      }

      const checkError: CheckError = {
        type: errorType,
        url,
        message,
        sourcePages: []
      };

      // Cache network error
      this.responseCache.set(url, { success: false, error: checkError, timestamp: Date.now() });

      return { success: false, error: checkError };
    }
  }

  /**
   * Clean up resources (agents and cache)
   */
  destroy(): void {
    // Destroy HTTP agents to release connections
    this.httpAgent.destroy();
    this.httpsAgent.destroy();

    // Clear cache
    this.responseCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.responseCache.size,
      hitRate: 0 // Could track hits/misses if needed
    };
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
