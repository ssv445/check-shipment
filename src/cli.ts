#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { WebsiteCrawler } from './crawler.js';
import { printConsoleReport, printError, printSuccess } from './reporters/index.js';
import { saveMarkdownReport } from './reporters/markdown.js';
import { loadConfigFile, mergeConfig, applyDefaults } from './utils/config.js';
import { validateConfig, ValidationError } from './utils/validation.js';
import { CheckShipmentConfig } from './types/index.js';

const program = new Command();

program
  .name('check-shipment')
  .description('Zero-install website validator for checking broken links, SEO, and accessibility before deployment')
  .version('1.1.0')
  .option('--url <url>', 'Starting URL to crawl')
  .option('--concurrency <number>', 'Number of parallel requests (default: 3)', parseInt)
  .option('--timeout <number>', 'Request timeout in seconds (default: 60)', parseInt)
  .option('--exclude-patterns <patterns>', 'Comma-separated URL patterns to skip (e.g., /admin/*,/api/*,*.pdf)')
  .option('--replaceFrom <url>', 'Domain to replace in discovered links')
  .option('--replaceTo <url>', 'Domain to replace it with')
  .option('--retry-count <number>', 'Number of retry attempts for failed requests (default: 3)', parseInt)
  .option('--no-fail', 'Exit 0 even if broken links found')
  .option('--use-sitemap', 'Use sitemap.xml to discover URLs (faster)')
  .option('--sitemap-url <url>', 'Custom sitemap URL (auto-discovers if not provided)')
  .addHelpText('after', `

Examples:
  ${chalk.cyan('# Basic usage')}
  npx check-shipment --url=http://localhost:3000

  ${chalk.cyan('# Test local site with production URLs')}
  npx check-shipment --url=http://localhost:3000 \\
    --replaceFrom=https://production.com \\
    --replaceTo=http://localhost:3000

  ${chalk.cyan('# Exclude admin and API routes')}
  npx check-shipment --url=https://example.com \\
    --exclude-patterns="/admin/*,/api/*"

  ${chalk.cyan('# Use sitemap for faster discovery')}
  npx check-shipment --url=https://example.com --use-sitemap

  ${chalk.cyan('# Use config file')}
  npx check-shipment ${chalk.dim('(reads check-shipment.config.js)')}

Configuration File:
  Create check-shipment.config.js in your project:

  ${chalk.dim('export default {')}
  ${chalk.dim('  url: \'http://localhost:3000\',')}
  ${chalk.dim('  concurrency: 3,')}
  ${chalk.dim('  timeout: 60,')}
  ${chalk.dim('  excludePatterns: [\'/admin/*\', \'*.pdf\'],')}
  ${chalk.dim('  noFail: false')}
  ${chalk.dim('}')}

Reports:
  Reports are saved to ${chalk.cyan('.check-shipment/report-[timestamp].md')}

For more information, visit: ${chalk.blue('https://github.com/shyamverma/check-shipment')}
`);

async function main() {
  try {
    program.parse(process.argv);
    const options = program.opts();

    // If no arguments provided, show help
    if (process.argv.length <= 2) {
      program.help();
      return;
    }

    // Load config file
    const fileConfig = await loadConfigFile();

    // Parse CLI options
    const cliOptions: Partial<CheckShipmentConfig> = {
      url: options.url,
      concurrency: options.concurrency,
      timeout: options.timeout,
      excludePatterns: options.excludePatterns ? options.excludePatterns.split(',').map((p: string) => p.trim()) : undefined,
      replaceFrom: options.replaceFrom,
      replaceTo: options.replaceTo,
      retryCount: options.retryCount,
      noFail: options.fail === false, // Commander converts --no-fail to fail: false
      useSitemap: options.useSitemap,
      sitemapUrl: options.sitemapUrl
    };

    // Merge configs (CLI takes precedence)
    const mergedConfig = mergeConfig(cliOptions, fileConfig);

    // Apply defaults
    const config = applyDefaults(mergedConfig);

    // Validate configuration
    validateConfig(config);

    // Display configuration
    console.log(chalk.bold('\nConfiguration:'));
    console.log(chalk.dim('  URL:         ') + chalk.cyan(config.url));
    console.log(chalk.dim('  Concurrency: ') + chalk.cyan(config.concurrency));
    console.log(chalk.dim('  Timeout:     ') + chalk.cyan(config.timeout + 's'));
    console.log(chalk.dim('  Retry Count: ') + chalk.cyan(config.retryCount));

    if (config.excludePatterns && config.excludePatterns.length > 0) {
      console.log(chalk.dim('  Exclude:     ') + chalk.cyan(config.excludePatterns.join(', ')));
    }

    if (config.replaceFrom && config.replaceTo) {
      console.log(chalk.dim('  Replace:     ') + chalk.cyan(`${config.replaceFrom} → ${config.replaceTo}`));
    }

    if (config.useSitemap) {
      console.log(chalk.dim('  Use Sitemap: ') + chalk.cyan('Yes'));
      if (config.sitemapUrl) {
        console.log(chalk.dim('  Sitemap URL: ') + chalk.cyan(config.sitemapUrl));
      }
    }

    // Create and run crawler
    const crawler = new WebsiteCrawler(config);
    const reportData = await crawler.crawl();

    // Print console report
    printConsoleReport(reportData);

    // Save markdown report
    const reportPath = await saveMarkdownReport(reportData);
    console.log(chalk.dim(`Report saved to: ${chalk.cyan(reportPath)}\n`));

    // Exit with appropriate code
    if (reportData.errors.length > 0 && !config.noFail) {
      process.exit(1);
    }

    process.exit(0);

  } catch (error: any) {
    if (error instanceof ValidationError) {
      printError('Invalid configuration', error.message);
      process.exit(2);
    }

    // Handle start URL validation errors
    if (error.message?.includes('Start URL is not accessible')) {
      printError(error.message);
      process.exit(2);
    }

    // Handle other errors
    printError('An error occurred', error.message || String(error));
    if (error.stack) {
      console.error(chalk.dim(error.stack));
    }
    process.exit(2);
  }
}

main();
