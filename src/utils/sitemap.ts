import { parseStringPromise } from 'xml2js';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

/**
 * Fetch and parse a sitemap.xml file
 * @param sitemapUrl - URL to the sitemap.xml file
 * @returns Array of URLs from the sitemap
 */
export async function fetchSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isGzipped = sitemapUrl.endsWith('.gz') || contentType.includes('gzip');

    let xmlContent: string;

    if (isGzipped) {
      // Handle gzipped sitemaps
      const buffer = await response.arrayBuffer();
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];

      await pipeline(
        Readable.from(Buffer.from(buffer)),
        gunzip,
        async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk);
          }
        }
      );

      xmlContent = Buffer.concat(chunks).toString('utf-8');
    } else {
      xmlContent = await response.text();
    }

    // Parse XML
    const parsed = await parseStringPromise(xmlContent);

    // Check if it's a sitemap index or a regular sitemap
    if (parsed.sitemapindex) {
      // This is a sitemap index - fetch all referenced sitemaps
      const sitemaps = parsed.sitemapindex.sitemap || [];
      const allUrls: string[] = [];

      for (const sitemap of sitemaps) {
        const sitemapLoc = sitemap.loc?.[0];
        if (sitemapLoc) {
          try {
            const urls = await fetchSitemap(sitemapLoc);
            allUrls.push(...urls);
          } catch (error) {
            console.error(`Failed to fetch sitemap ${sitemapLoc}:`, error);
          }
        }
      }

      return allUrls;
    } else if (parsed.urlset) {
      // This is a regular sitemap - extract URLs
      const urls = parsed.urlset.url || [];
      return urls
        .map((url: any) => url.loc?.[0])
        .filter((loc: string | undefined) => loc !== undefined);
    }

    return [];
  } catch (error: any) {
    throw new Error(`Failed to parse sitemap: ${error.message}`);
  }
}

/**
 * Try to discover sitemap.xml at common locations
 * @param baseUrl - Base URL of the website
 * @returns URL of the discovered sitemap, or null if not found
 */
export async function discoverSitemap(baseUrl: string): Promise<string | null> {
  const url = new URL(baseUrl);
  const commonLocations = [
    `${url.origin}/sitemap.xml`,
    `${url.origin}/sitemap_index.xml`,
    `${url.origin}/sitemap.xml.gz`,
    `${url.origin}/sitemap-index.xml`
  ];

  for (const location of commonLocations) {
    try {
      const response = await fetch(location, { method: 'HEAD' });
      if (response.ok) {
        return location;
      }
    } catch (error) {
      // Continue to next location
    }
  }

  // Try robots.txt
  try {
    const robotsUrl = `${url.origin}/robots.txt`;
    const response = await fetch(robotsUrl);
    if (response.ok) {
      const robotsTxt = await response.text();
      const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
      if (sitemapMatch) {
        return sitemapMatch[1].trim();
      }
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

/**
 * Get URLs from sitemap with optional filtering
 * @param sitemapUrl - URL to the sitemap
 * @param baseUrl - Base URL to filter by (only return URLs from same domain)
 * @returns Filtered array of URLs
 */
export async function getSitemapUrls(sitemapUrl: string, baseUrl: string): Promise<string[]> {
  const urls = await fetchSitemap(sitemapUrl);
  const baseUrlObj = new URL(baseUrl);

  // Filter to only include URLs from the same domain
  return urls.filter(url => {
    try {
      const urlObj = new URL(url);
      return urlObj.origin === baseUrlObj.origin;
    } catch {
      return false;
    }
  });
}
