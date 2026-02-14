export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string) {
      if (shouldLog("debug")) {
        process.stderr.write(formatMessage("debug", module, message) + "\n");
      }
    },
    info(message: string) {
      if (shouldLog("info")) {
        process.stderr.write(formatMessage("info", module, message) + "\n");
      }
    },
    warn(message: string) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", module, message));
      }
    },
    error(message: string) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", module, message));
      }
    },
  };
}
