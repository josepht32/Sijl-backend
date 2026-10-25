export interface WatermarkContext {
  email: string;
  traceCode: string;
  downloadedAt: Date;
}

export function buildWatermarkLines(context: WatermarkContext): string[] {
  const stamp = `${context.downloadedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return [`Sijil · ${context.email}`, `${context.traceCode} · ${stamp}`];
}

export function makeTraceCode(id: string): string {
  return `DL-${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}
