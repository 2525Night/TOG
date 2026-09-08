/**
 * Short-lived in-process memo for MonthFacts.
 * Collapses parallel fan-out (dashboard analyze+report+summary) without
 * stale multi-request cache — TTL is seconds, invalidated on writes.
 */
const DEFAULT_TTL_MS = 3_000;

type Entry<T> = { at: number; value: Promise<T> };

export class TtlMemo<T> {
  private readonly map = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  getOrSet(key: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.map.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value;
    const value = factory().catch((err) => {
      this.map.delete(key);
      throw err;
    });
    this.map.set(key, { at: now, value });
    return value;
  }

  /** Drop all keys for a user (prefix `userId:`). */
  invalidatePrefix(prefix: string) {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  clear() {
    this.map.clear();
  }
}
