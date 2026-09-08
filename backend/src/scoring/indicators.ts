export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(values.length - period);
  return window.reduce((sum, v) => sum + v, 0) / period;
}

export function stddev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(values.length - period);
  const mean = window.reduce((sum, v) => sum + v, 0) / period;
  const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

export function rollingMax(values: number[], window: number): number {
  const slice = values.slice(Math.max(0, values.length - window));
  return Math.max(...slice);
}

/** Klasyczny RSI (Wilder), domyślnie 14-okresowy, liczony z cen zamknięcia. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
