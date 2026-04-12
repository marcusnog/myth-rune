export function logInfo(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", msg, ...extra }));
}

export function logWarn(msg: string, extra: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ level: "warn", msg, ...extra }));
}

export function logError(msg: string, extra: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: "error", msg, ...extra }));
}
