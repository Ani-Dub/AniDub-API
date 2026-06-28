type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel = (
  (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel
);

const shouldLog = (level: LogLevel) => levelOrder[level] >= levelOrder[configuredLevel];

const formatContext = (context?: Record<string, unknown>) => {
  if (!context || Object.keys(context).length === 0) return "";
  return ` ${JSON.stringify(context)}`;
};

export const createLogger = (scope: string) => ({
  debug: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog("debug")) {
      console.debug(`[${scope}] ${message}${formatContext(context)}`);
    }
  },
  info: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog("info")) {
      console.info(`[${scope}] ${message}${formatContext(context)}`);
    }
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog("warn")) {
      console.warn(`[${scope}] ${message}${formatContext(context)}`);
    }
  },
  error: (message: string, context?: Record<string, unknown>, error?: unknown) => {
    if (shouldLog("error")) {
      const detail = error instanceof Error ? error.stack || error.message : error;
      console.error(
        `[${scope}] ${message}${formatContext(context)}`,
        detail ? detail : undefined
      );
    }
  },
});

export const logger = createLogger("app");
