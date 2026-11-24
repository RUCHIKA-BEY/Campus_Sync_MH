// Small per-browser conveniences (saved events, demo tickets).
// Storage can be unavailable (private mode, blocked site data), so every
// access is wrapped and the app works without it. This is NEVER used for
// roles, permissions or anything that must be trusted.

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the in-memory state still works for this visit */
  }
}
