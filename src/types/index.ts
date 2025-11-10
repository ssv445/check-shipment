import { Page } from 'playwright';

/**
 * Configuration options for check-shipment
 */
export interface CheckShipmentConfig {
  /** Starting URL to crawl */
  url: string;
  /** Number of parallel requests (default: 3) */
  concurrency?: number;
  /** Request timeout in seconds (default: 60) */
  timeout?: number;
  /** URL patterns to skip (e.g., ['/admin/*', '*.pdf']) */
  excludePatterns?: string[];
  /** Domain to replace in discovered links */
  replaceFrom?: string;
  /** Domain to replace it with */
  replaceTo?: string;
  /** Number of retry attempts for failed requests (default: 3) */
  retryCount?: number;
  /** Exit 0 even if broken links found */
  noFail?: boolean;
  /** Use sitemap.xml to discover URLs (default: false) */
  useSitemap?: boolean;
  /** Custom sitemap URL (optional, will auto-discover if not provided) */
  sitemapUrl?: string;
}

/**
 * Base interface for all checkers
 */
export interface Checker {
  name: string;
  run(page: Page, url: string): Promise<CheckResult>;
}

/**
 * Result returned by a checker
 */
export interface CheckResult {
  passed: boolean;
  errors: CheckError[];
  warnings: CheckWarning[];
}

/**
 * Error found by a checker
 */
export interface CheckError {
  type: ErrorType;
  url: string;
  message: string;
  statusCode?: number;
  sourcePages: string[];
}

/**
 * Warning found by a checker
 */
export interface CheckWarning {
  type: string;
  message: string;
  url: string;
}

/**
 * Types of errors that can be found
 */
export enum ErrorType {
  HTTP_404 = '404 Not Found',
  HTTP_500 = '500 Internal Server Error',
  HTTP_OTHER = 'HTTP Error',
  TIMEOUT = 'Timeout',
  DNS_ERROR = 'DNS Error',
  SSL_ERROR = 'SSL Error',
  NETWORK_ERROR = 'Network Error',
  REDIRECT_LOOP = 'Redirect Loop',
  INVALID_URL = 'Invalid URL',
}

/**
 * Information about a discovered link
 */
export interface LinkInfo {
  url: string;
  sourcePages: Set<string>;
  status?: 'pending' | 'checking' | 'success' | 'error';
  error?: CheckError;
}

/**
 * Crawl statistics
 */
export interface CrawlStats {
  pagesCrawled: number;
  linksChecked: number;
  brokenLinks: number;
  startTime: number;
  endTime?: number;
}

/**
 * Report data structure
 */
export interface ReportData {
  config: CheckShipmentConfig;
  stats: CrawlStats;
  errors: CheckError[];
  timestamp: string;
}
