const seen = new Set<string>();

/**
 * Emit a one-time `console.warn` in development only (stripped from production
 * builds by the `NODE_ENV` check, which bundlers dead-code-eliminate). Used to
 * flag silent misconfigurations — a feature enabled without the handler that
 * makes it work, etc. — that would otherwise fail quietly.
 */
export function devWarn(key: string, message: string): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  if (seen.has(key)) return;
  seen.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[@ham/editor] ${message}`);
}
