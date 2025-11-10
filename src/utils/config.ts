import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { pathToFileURL } from 'url';
import { CheckShipmentConfig } from '../types/index.js';

/**
 * Load configuration from check-shipment.config.js file
 * @returns Configuration object or null if not found
 */
export async function loadConfigFile(): Promise<Partial<CheckShipmentConfig> | null> {
  const configFiles = [
    'check-shipment.config.js',
    'check-shipment.config.mjs'
  ];

  // Check current directory first
  for (const configFile of configFiles) {
    const configPath = resolve(process.cwd(), configFile);
    if (existsSync(configPath)) {
      try {
        const configUrl = pathToFileURL(configPath).href;
        const module = await import(configUrl);
        return module.default || module;
      } catch (error) {
        console.error(`Error loading config file ${configFile}:`, error);
        return null;
      }
    }
  }

  // If not found in current directory, check project root
  // (traverse up to find package.json or .git)
  let currentDir = process.cwd();
  const root = resolve('/');

  while (currentDir !== root) {
    const hasPackageJson = existsSync(join(currentDir, 'package.json'));
    const hasGit = existsSync(join(currentDir, '.git'));

    if (hasPackageJson || hasGit) {
      for (const configFile of configFiles) {
        const configPath = join(currentDir, configFile);
        if (existsSync(configPath)) {
          try {
            const configUrl = pathToFileURL(configPath).href;
            const module = await import(configUrl);
            return module.default || module;
          } catch (error) {
            console.error(`Error loading config file ${configFile}:`, error);
            return null;
          }
        }
      }
      break;
    }

    currentDir = resolve(currentDir, '..');
  }

  return null;
}

/**
 * Merge CLI options with config file options
 * CLI options take precedence over config file options
 * @param cliOptions - Options from CLI
 * @param fileConfig - Options from config file
 * @returns Merged configuration
 */
export function mergeConfig(
  cliOptions: Partial<CheckShipmentConfig>,
  fileConfig: Partial<CheckShipmentConfig> | null
): Partial<CheckShipmentConfig> {
  if (!fileConfig) {
    return cliOptions;
  }

  return {
    ...fileConfig,
    ...cliOptions
  };
}

/**
 * Get default configuration values
 * @returns Default configuration
 */
export function getDefaultConfig(): Partial<CheckShipmentConfig> {
  return {
    concurrency: 3,
    timeout: 60,
    retryCount: 3,
    noFail: false,
    excludePatterns: []
  };
}

/**
 * Apply defaults to a configuration object
 * @param config - Configuration object
 * @returns Configuration with defaults applied
 */
export function applyDefaults(config: Partial<CheckShipmentConfig>): CheckShipmentConfig {
  const defaults = getDefaultConfig();

  return {
    url: config.url || '',
    concurrency: config.concurrency ?? defaults.concurrency!,
    timeout: config.timeout ?? defaults.timeout!,
    retryCount: config.retryCount ?? defaults.retryCount!,
    noFail: config.noFail ?? defaults.noFail!,
    excludePatterns: config.excludePatterns ?? defaults.excludePatterns!,
    replaceFrom: config.replaceFrom,
    replaceTo: config.replaceTo
  };
}
