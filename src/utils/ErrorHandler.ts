import { Logger } from "./Logger.js";

export class FrameworkError extends Error {
  public readonly originalError?: Error;
  public readonly context?: string;
  public readonly timestamp: number;

  constructor(message: string, originalError?: Error, context?: string) {
    super(message);
    this.name = "FrameworkError";
    this.originalError = originalError;
    this.context = context;
    this.timestamp = Date.now();

    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

export class ErrorHandler {
  private readonly logger: Logger;
  private errorStats: Map<string, number> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public handleError(error: Error, context?: string): FrameworkError {
    const errorKey = `${error.name}:${error.message}`;
    const count = (this.errorStats.get(errorKey) || 0) + 1;
    this.errorStats.set(errorKey, count);

    const frameworkError = new FrameworkError(
      error.message,
      error,
      context
    );

    this.logger.error(
      context || "An error occurred",
      {
        error: error.message,
        name: error.name,
        count,
      }
    );

    return frameworkError;
  }

  public getErrorStats(): Map<string, number> {
    return new Map(this.errorStats);
  }

  public clearErrorStats(): void {
    this.errorStats.clear();
  }

  public getMostCommonErrors(limit: number = 10): Array<{ error: string; count: number }> {
    return Array.from(this.errorStats.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  public getTotalErrorCount(): number {
    return Array.from(this.errorStats.values()).reduce((sum, count) => sum + count, 0);
  }
}
