/**
 * Normalize a URL by removing trailing slashes, query parameters, and hash fragments
 * @param url - URL to normalize
 * @returns Normalized URL
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Remove query parameters and hash
    urlObj.search = '';
    urlObj.hash = '';

    // Remove trailing slash (except for root URLs)
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return the original URL
    return url;
  }
}

/**
 * Resolve a relative URL against a base URL
 * @param baseUrl - Base URL
 * @param relativeUrl - Relative URL
 * @returns Resolved absolute URL
 */
export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch (error) {
    return relativeUrl;
  }
}

/**
 * Extract base domain from a URL (handles www subdomain)
 * @param url - URL to extract domain from
 * @returns Base domain
 */
export function getBaseDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;

    // Remove www. prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    return hostname;
  } catch (error) {
    return '';
  }
}

/**
 * Check if two URLs belong to the same domain
 * @param url1 - First URL
 * @param url2 - Second URL
 * @returns True if both URLs belong to the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  const domain1 = getBaseDomain(url1);
  const domain2 = getBaseDomain(url2);

  return domain1 === domain2 && domain1 !== '';
}

/**
 * Check if a URL is valid
 * @param url - URL to validate
 * @returns True if URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a URL matches any of the exclude patterns
 * @param url - URL to check
 * @param patterns - Array of patterns (supports wildcards *)
 * @returns True if URL matches any pattern
 */
export function matchesExcludePattern(url: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    for (const pattern of patterns) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
        .replace(/\*/g, '.*'); // Convert * to .*

      const regex = new RegExp(`^${regexPattern}$`);

      if (regex.test(pathname) || regex.test(url)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Replace domain in a URL
 * @param url - Original URL
 * @param fromDomain - Domain to replace
 * @param toDomain - Replacement domain
 * @returns URL with replaced domain
 */
export function replaceUrlDomain(url: string, fromDomain: string, toDomain: string): string {
  try {
    const fromUrl = new URL(fromDomain);
    const toUrl = new URL(toDomain);
    const urlObj = new URL(url);

    if (getBaseDomain(url) === getBaseDomain(fromDomain)) {
      urlObj.protocol = toUrl.protocol;
      urlObj.hostname = toUrl.hostname;
      urlObj.port = toUrl.port;

      return urlObj.toString();
    }

    return url;
  } catch (error) {
    return url;
  }
}

/**
 * Check if a URL points to non-HTML content (PDF, image, video, etc.)
 * @param url - URL to check
 * @returns True if URL points to non-HTML content
 */
export function isNonHtmlContent(url: string): boolean {
  const nonHtmlExtensions = [
    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
    '.mp4', '.webm', '.ogg', '.mp3', '.wav',
    '.zip', '.tar', '.gz', '.rar',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.css', '.js', '.json', '.xml'
  ];

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    return nonHtmlExtensions.some(ext => pathname.endsWith(ext));
  } catch (error) {
    return false;
  }
}
