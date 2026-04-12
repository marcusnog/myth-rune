const counters = new Map<string, number>();
const gauges = new Map<string, number>();

export function incrementMetric(name: string, amount = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

export function observeMax(name: string, value: number): void {
  gauges.set(name, Math.max(gauges.get(name) ?? 0, value));
}

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [name, value] of counters.entries()) {
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }
  for (const [name, value] of gauges.entries()) {
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }
  return `${lines.join("\n")}\n`;
}
