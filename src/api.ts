import { isNative, HOME } from "./native";

const BASE = isNative ? HOME : "";
const KEY = "ledger.auth";

export interface Account { id: string; email: string; name: string; role: "athlete" | "coach"; coachId: string | null; coachName: string | null; invite: string | null; admin?: boolean; emailVerified?: boolean; consent?: number | null; notify?: boolean }
export const loadAuth = (): { token: string; user: Account } | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
export const saveAuth = (a: { token: string; user: Account } | null) => { try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

let token: string | null = loadAuth()?.token ?? null;
export const setToken = (t: string | null) => { token = t; };

export async function api<T = any>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError(0, "You are offline. Try again when you have a connection."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}
