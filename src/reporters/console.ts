import Table from 'cli-table3';
import chalk from 'chalk';
import { ReportData, CheckError, ErrorType } from '../types/index.js';

/**
 * Format duration in seconds to human-readable format
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Group errors by type
 */
function groupErrorsByType(errors: CheckError[]): Map<ErrorType, CheckError[]> {
  const grouped = new Map<ErrorType, CheckError[]>();

  for (const error of errors) {
    if (!grouped.has(error.type)) {
      grouped.set(error.type, []);
    }
    grouped.get(error.type)!.push(error);
  }

  return grouped;
}

/**
 * Print console report
 */
export function printConsoleReport(reportData: ReportData): void {
  const { config, stats, errors } = reportData;
  const duration = stats.endTime
    ? Math.floor((stats.endTime - stats.startTime) / 1000)
    : 0;

  console.log('\n' + chalk.bold.blue('━'.repeat(80)));
  console.log(chalk.bold.blue('  check-shipment Report'));
  console.log(chalk.bold.blue('━'.repeat(80)) + '\n');

  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Start URL:      ${chalk.cyan(config.url)}`);
  console.log(`  Pages Crawled:  ${chalk.cyan(stats.pagesCrawled)}`);
  console.log(`  Links Checked:  ${chalk.cyan(stats.linksChecked)}`);
  console.log(`  Broken Links:   ${stats.brokenLinks > 0 ? chalk.red(stats.brokenLinks) : chalk.green(stats.brokenLinks)}`);

  if (stats.linksChecked > 0) {
    const successRate = ((stats.linksChecked - stats.brokenLinks) / stats.linksChecked * 100).toFixed(1);
    console.log(`  Success Rate:   ${parseFloat(successRate) >= 99 ? chalk.green(successRate + '%') : chalk.yellow(successRate + '%')}`);
  }

  console.log(`  Duration:       ${chalk.cyan(formatDuration(duration))}`);
  console.log();

  // If no errors, show success message
  if (errors.length === 0) {
    console.log(chalk.bold.green('✓ No broken links found!\n'));
    return;
  }

  // Group errors by type
  const groupedErrors = groupErrorsByType(errors);

  console.log(chalk.bold.red(`✗ Found ${errors.length} broken link${errors.length === 1 ? '' : 's'}:\n`));

  // Print errors grouped by type
  for (const [errorType, errorList] of groupedErrors) {
    console.log(chalk.bold(`${errorType} (${errorList.length}):`));

    const table = new Table({
      head: [
        chalk.bold('Broken URL'),
        chalk.bold('Source Page(s)')
      ],
      colWidths: [50, 50],
      wordWrap: true,
      style: {
        head: ['cyan']
      }
    });

    for (const error of errorList) {
      const sourcePages = error.sourcePages.slice(0, 3); // Show max 3 source pages
      const sourcePagesText = sourcePages.join('\n');
      const moreText = error.sourcePages.length > 3
        ? chalk.dim(`\n...and ${error.sourcePages.length - 3} more`)
        : '';

      table.push([
        chalk.red(error.url),
        sourcePagesText + moreText
      ]);
    }

    console.log(table.toString());
    console.log();
  }

  console.log(chalk.dim(`Reports saved to: ${chalk.cyan('.check-shipment/report-*.md')}\n`));
}

/**
 * Print error message
 */
export function printError(message: string, details?: string): void {
  console.error(chalk.bold.red('\n✗ Error: ') + message);
  if (details) {
    console.error(chalk.dim(details));
  }
  console.error();
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.bold.green('\n✓ ') + message + '\n');
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}
