const TOKEN_KEY = "mt_token";
const NATIVE_TOKEN_KEY = "moneytail.session.token";
const SESSION_DB = "moneytail-session";
const SESSION_STORE = "credentials";

function resolveApiUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Android emulator WebView loading host Next via 10.0.2.2
    if (host === "10.0.2.2") return "http://10.0.2.2:3001";
  }
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    (process.env.NODE_ENV === "production"
      ? "https://moneytail-api.vercel.app"
      : "http://localhost:3001")
  );
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  void persistDurableToken(token);
  invalidateApiCache();
}

/** Restore Android session storage before deciding that the user is logged out. */
export async function hydrateToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const local = getToken();
  if (local) await writeIndexedToken(local);
  const indexed = local ? null : await readIndexedToken();
  if (indexed) {
    localStorage.setItem(TOKEN_KEY, indexed);
    void persistNativeToken(indexed);
    return indexed;
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return local;
    const { Preferences } = await import("@capacitor/preferences");
    if (local) {
      await Preferences.set({ key: NATIVE_TOKEN_KEY, value: local });
      return local;
    }
    const stored = await Preferences.get({ key: NATIVE_TOKEN_KEY });
    if (!stored.value) return null;
    localStorage.setItem(TOKEN_KEY, stored.value);
    await writeIndexedToken(stored.value);
    return stored.value;
  } catch {
    return local;
  }
}

async function persistDurableToken(token: string | null) {
  await Promise.allSettled([
    writeIndexedToken(token),
    persistNativeToken(token),
  ]);
}

async function persistNativeToken(token: string | null) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import("@capacitor/preferences");
    if (token) {
      await Preferences.set({ key: NATIVE_TOKEN_KEY, value: token });
    } else {
      await Preferences.remove({ key: NATIVE_TOKEN_KEY });
    }
  } catch {
    /* Native bridge may be unavailable in a normal browser. */
  }
}

function sessionDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(SESSION_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readIndexedToken() {
  const db = await sessionDb();
  if (!db) return null;
  return new Promise<string | null>((resolve) => {
    const tx = db.transaction(SESSION_STORE, "readonly");
    const request = tx.objectStore(SESSION_STORE).get(NATIVE_TOKEN_KEY);
    request.onsuccess = () =>
      resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}

async function writeIndexedToken(token: string | null) {
  const db = await sessionDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SESSION_STORE, "readwrite");
    const store = tx.objectStore(SESSION_STORE);
    if (token) store.put(token, NATIVE_TOKEN_KEY);
    else store.delete(NATIVE_TOKEN_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function parseError(res: Response) {
  if (res.status === 413) {
    throw new Error(
      "הקובץ גדול מדי לשרת (מגבלת ענן). נסו CSV או תמונה/PDF קטנים יותר.",
    );
  }
  let message = "שגיאת שרת";
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join(", ");
    else if (body.message) message = body.message;
  } catch {
    if (res.status >= 500) {
      message = "שגיאת שרת בהעלאה — נסו שוב או העלו CSV";
    }
  }
  throw new Error(message);
}

/** Short TTL GET cache — collapses remount / StrictMode double-fetch. */
const GET_TTL_MS = 4_000;
const getCache = new Map<string, { at: number; data: unknown }>();

export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.startsWith(pathPrefix)) getCache.delete(key);
  }
}

function cacheKey(path: string, method: string) {
  return `${method}:${path}`;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (method === "GET" && typeof window !== "undefined") {
    const key = cacheKey(path, method);
    const hit = getCache.get(key);
    if (hit && Date.now() - hit.at < GET_TTL_MS) {
      return hit.data as T;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${resolveApiUrl()}/api${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("לא הצלחנו להתחבר לשרת — בדקו את החיבור ונסו שוב");
  }

  if (!res.ok) await parseError(res);
  if (res.status === 204) {
    if (method !== "GET") invalidateApiCache();
    return undefined as T;
  }
  const data = (await res.json()) as T;
  if (method === "GET" && typeof window !== "undefined") {
    getCache.set(cacheKey(path, method), { at: Date.now(), data });
  } else if (method !== "GET") {
    invalidateApiCache();
  }
  return data;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const result = await api<T>(path, { method: "POST", body: formData });
  invalidateApiCache();
  return result;
}

/** Download authenticated text/blob (e.g. CSV export). */
export async function apiDownload(path: string, filename: string) {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${resolveApiUrl()}/api${path}`, { headers });
  if (!res.ok) await parseError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatIls(n: number) {
  const abs = Math.abs(n);
  // Sub-₪1 amounts must not round to ₪0 in lists/toasts.
  const maxFrac = abs > 0 && abs < 1 ? 2 : Number.isInteger(n) ? 0 : 2;
  const minFrac = abs > 0 && abs < 1 ? 2 : 0;
  return `₪${n.toLocaleString("he-IL", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: minFrac,
  })}`;
}
