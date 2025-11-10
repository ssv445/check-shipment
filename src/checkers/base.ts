import { Checker } from '../types/index.js';

/**
 * Base class for all checkers
 * Provides common functionality that can be extended by specific checkers
 */
export abstract class BaseChecker implements Checker {
  abstract name: string;

  abstract run(...args: any[]): Promise<any>;
}
