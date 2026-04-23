type Level = 30 | 40 | 50; // info, warn, error (Pino-style numbers)

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...extra,
  };
  // One JSON object per line for platform parsing
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => emit(30, msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit(40, msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit(50, msg, extra),
};

