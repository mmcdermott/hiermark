const seen = new Set<string>();

/** One-time `console.warn` in development only (see @ham/editor's devWarn). */
export function devWarn(key: string, message: string): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  if (seen.has(key)) return;
  seen.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[@ham/canvas] ${message}`);
}
