import { Page } from 'playwright';
import { BaseChecker } from './base.js';
import { CheckResult, CheckError, CheckWarning, ErrorType } from '../types/index.js';
import { isValidUrl, normalizeUrl, resolveUrl } from '../utils/url.js';

/**
 * SEOValidator - Validates SEO-related aspects of a page
 * Checks for:
 * - Canonical URL presence and validity
 * - Meta description
 * - Page title
 * - Open Graph tags
 */
export class SEOValidator extends BaseChecker {
  name = 'SEOValidator';

  constructor() {
    super();
  }

  /**
   * Extract canonical URL from the page
   */
  async extractCanonicalUrl(page: Page): Promise<{ canonical: string | null; count: number }> {
    try {
      const result = await page.evaluate(() => {
        const canonicalTags = document.querySelectorAll('link[rel="canonical"]');
        const urls = Array.from(canonicalTags).map(tag => (tag as HTMLLinkElement).href);
        return {
          canonical: urls[0] || null,
          count: urls.length
        };
      });
      return result;
    } catch (error) {
      return { canonical: null, count: 0 };
    }
  }

  /**
   * Extract meta description from the page
   */
  async extractMetaDescription(page: Page): Promise<string | null> {
    try {
      const description = await page.evaluate(() => {
        const metaTag = document.querySelector('meta[name="description"]');
        return metaTag ? (metaTag as HTMLMetaElement).content : null;
      });
      return description;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract page title
   */
  async extractTitle(page: Page): Promise<string | null> {
    try {
      const title = await page.evaluate(() => document.title);
      return title || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check for Open Graph tags
   */
  async checkOpenGraphTags(page: Page): Promise<{ hasOgTitle: boolean; hasOgDescription: boolean; hasOgImage: boolean }> {
    try {
      const result = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        const ogImage = document.querySelector('meta[property="og:image"]');

        return {
          hasOgTitle: !!ogTitle,
          hasOgDescription: !!ogDescription,
          hasOgImage: !!ogImage
        };
      });
      return result;
    } catch (error) {
      return { hasOgTitle: false, hasOgDescription: false, hasOgImage: false };
    }
  }

  /**
   * Run SEO validation on an already-loaded page
   */
  async run(page: Page, url: string): Promise<CheckResult> {
    const errors: CheckError[] = [];
    const warnings: CheckWarning[] = [];

    try {
      // 1. Check for canonical URL
      const { canonical, count } = await this.extractCanonicalUrl(page);

      if (count === 0) {
        errors.push({
          type: ErrorType.MISSING_CANONICAL,
          url,
          message: 'Page is missing canonical URL tag',
          sourcePages: []
        });
      } else if (count > 1) {
        errors.push({
          type: ErrorType.DUPLICATE_CANONICAL,
          url,
          message: `Page has ${count} canonical URL tags (should have exactly 1)`,
          sourcePages: []
        });
      } else if (canonical) {
        // Validate the canonical URL
        const normalizedCanonical = normalizeUrl(canonical);

        if (!isValidUrl(canonical)) {
          errors.push({
            type: ErrorType.INVALID_CANONICAL,
            url,
            message: `Canonical URL is not valid: ${canonical}`,
            sourcePages: []
          });
        } else {
          // Check if canonical is self-referential (best practice)
          const normalizedCurrentUrl = normalizeUrl(url);
          if (normalizedCanonical !== normalizedCurrentUrl) {
            warnings.push({
              type: 'Non-Self-Referential Canonical',
              message: `Canonical URL points to different page: ${canonical}`,
              url
            });
          }
        }
      }

      // 2. Check for meta description
      const metaDescription = await this.extractMetaDescription(page);
      if (!metaDescription || metaDescription.trim() === '') {
        errors.push({
          type: ErrorType.MISSING_META_DESCRIPTION,
          url,
          message: 'Page is missing meta description',
          sourcePages: []
        });
      } else {
        // Warn if meta description is too short or too long
        const length = metaDescription.length;
        if (length < 50) {
          warnings.push({
            type: 'Short Meta Description',
            message: `Meta description is too short (${length} chars, recommended: 50-160)`,
            url
          });
        } else if (length > 160) {
          warnings.push({
            type: 'Long Meta Description',
            message: `Meta description is too long (${length} chars, recommended: 50-160)`,
            url
          });
        }
      }

      // 3. Check for page title
      const title = await this.extractTitle(page);
      if (!title || title.trim() === '') {
        errors.push({
          type: ErrorType.MISSING_TITLE,
          url,
          message: 'Page is missing title tag',
          sourcePages: []
        });
      } else {
        // Warn if title is too short or too long
        const length = title.length;
        if (length < 10) {
          warnings.push({
            type: 'Short Title',
            message: `Page title is too short (${length} chars, recommended: 30-60)`,
            url
          });
        } else if (length > 60) {
          warnings.push({
            type: 'Long Title',
            message: `Page title is too long (${length} chars, recommended: 30-60)`,
            url
          });
        }
      }

      // 4. Check for Open Graph tags
      const ogTags = await this.checkOpenGraphTags(page);
      const missingOgTags: string[] = [];

      if (!ogTags.hasOgTitle) missingOgTags.push('og:title');
      if (!ogTags.hasOgDescription) missingOgTags.push('og:description');
      if (!ogTags.hasOgImage) missingOgTags.push('og:image');

      if (missingOgTags.length > 0) {
        errors.push({
          type: ErrorType.MISSING_OPEN_GRAPH,
          url,
          message: `Page is missing Open Graph tags: ${missingOgTags.join(', ')}`,
          sourcePages: []
        });
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
        message: `Failed to validate SEO: ${error.message}`,
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
