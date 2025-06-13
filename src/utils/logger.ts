/**
 * Simple logging utility with environment-based log levels
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private logLevel: LogLevel

  constructor() {
    const level = process.env.LOG_LEVEL?.toUpperCase() ?? 'INFO'
    this.logLevel = LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO
  }

  error(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(message, ...args)
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      console.warn(message, ...args)
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(message, ...args)
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log('[DEBUG]', message, ...args)
    }
  }
}

export const logger = new Logger()