import winston from "winston";
import path from "path";

export class Logger {
  private logger: winston.Logger;

  constructor(level: string = "info", logFile?: string) {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        ),
      }),
    ];

    if (logFile) {
      transports.push(
        new winston.transports.File({
          filename: path.resolve(logFile),
          format: winston.format.combine(
            winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            winston.format.json()
          ),
        })
      );
    }

    this.logger = winston.createLogger({
      level,
      transports,
    });
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  public error(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.logger.error(message, error);
    }
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  public setLevel(level: string): void {
    this.logger.level = level;
  }

  public getLevel(): string {
    return this.logger.level;
  }
}
