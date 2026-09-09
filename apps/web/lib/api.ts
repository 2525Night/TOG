const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "production"
    ? "https://moneytail-api.fly.dev"
    : "http://localhost:3001");

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mt_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("mt_token", token);
  else localStorage.removeItem("mt_token");
  invalidateApiCache();
}

async function parseError(res: Response) {
  let message = "שגיאת שרת";
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join(", ");
    else if (body.message) message = body.message;
  } catch {
    /* ignore */
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

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
  });

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
  const res = await fetch(`${API_URL}/api${path}`, { headers });
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
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}
