const TOKEN_KEY = "sentinel.token";

export function isSignInMessage(message: string) {
  return /sign in with ethereum/i.test(message);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = apiBase();
  if (!base) throw new ApiError("NEXT_PUBLIC_API_URL is not set.", 0);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers, credentials: "include", mode: "cors" });
  } catch {
    throw new ApiError("Backend offline.", 0);
  }

  if (!response.ok) {
    let message = `Backend returned ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      message = response.status === 0 ? "Backend offline." : message;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function demoApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.NEXT_PUBLIC_DEMO_TOKEN;
  if (!token) throw new ApiError("NEXT_PUBLIC_DEMO_TOKEN is not set.", 0);
  const headers = new Headers(init.headers);
  headers.set("x-demo-token", token);
  return api<T>(path, { ...init, headers });
}
