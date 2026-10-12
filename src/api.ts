export interface ForgeUser { accountid: string; username: string; screen_name: string }
export interface ForgeAccount extends ForgeUser { email: string; email_verified: boolean; role: "member" | "admin" }
export interface ForgeSession { id: string; created_at: string; last_used_at: string; expires_at: string; user_agent: string }
interface Tokens { access_token: string; refresh_token: string; token_type: string; expires_in: number; refresh_expires_at: string }
interface AuthResponse { user: ForgeAccount; tokens: Tokens; session_id?: string }

export const apiBaseUrl = (import.meta.env.VITE_FORGE_API_URL || "https://forge-34-170-115-154.sslip.io").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

// Keep credentials in memory. Reloading the app requires signing in again.
let tokens: Tokens | null = null;
let accessDeadline = 0;
let epoch = 0;
let refreshing: Promise<void> | null = null;

export function clearSession() { tokens = null; accessDeadline = 0; epoch++; refreshing = null; }

function acceptTokens(value: Tokens) {
  tokens = value;
  accessDeadline = Date.now() + value.expires_in * 1000;
}

async function raw<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiBaseUrl + path, { ...init, headers, credentials: "omit", signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  return data as T;
}

function post(body: unknown): RequestInit { return { method: "POST", body: JSON.stringify(body) }; }

async function refreshTokens(): Promise<void> {
  if (refreshing) return refreshing;
  if (!tokens) throw new ApiError("Please sign in.", 401);
  const refreshToken = tokens.refresh_token;
  const started = epoch;
  const work = (async () => {
    try {
      const result = await raw<AuthResponse>("/api/auth/refresh", post({ refresh_token: refreshToken }));
      if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
      acceptTokens(result.tokens);
    } catch (error) {
      if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
      if (started === epoch && error instanceof ApiError && error.status === 401) clearSession();
      throw error;
    }
  })();
  refreshing = work;
  try { await work; } finally { if (refreshing === work) refreshing = null; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const started = epoch;
  if (!tokens) throw new ApiError("Please sign in.", 401);
  if (Date.now() >= accessDeadline - 30000) await refreshTokens();
  if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
  if (!tokens) throw new ApiError("Please sign in.", 401);
  const sentToken = tokens.access_token;
  try {
    const result = await raw<T>(path, init, sentToken);
    if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
    return result;
  }
  catch (error) {
    if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
    if (!(error instanceof ApiError) || error.status !== 401 || !tokens) throw error;
    // Parallel requests share one rotation and reuse a token already refreshed.
    if (tokens.access_token === sentToken) await refreshTokens();
    if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
    if (!tokens) throw new ApiError("Please sign in.", 401);
    try {
      const result = await raw<T>(path, init, tokens.access_token);
      if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
      return result;
    }
    catch (retryError) {
      if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
      if (started === epoch && retryError instanceof ApiError && retryError.status === 401) clearSession();
      throw retryError;
    }
  }
}

export async function login(identifier: string, password: string): Promise<ForgeAccount> {
  clearSession();
  const started = epoch;
  const result = await raw<AuthResponse>("/api/auth/login", post({ identifier, password }));
  if (started !== epoch) throw new ApiError("Session changed. Please try again.", 409);
  acceptTokens(result.tokens);
  return result.user;
}

export function register(username: string, screen_name: string, email: string, password: string) {
  return raw<{ user: ForgeAccount; verification_required: boolean }>("/api/auth/register", post({ username, screen_name, email, password }));
}

export function getMe() { return request<ForgeAccount>("/api/auth/me"); }
export function updateScreenName(screen_name: string) { return request<ForgeUser>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ screen_name }) }); }
export function listSessions() { return request<{ sessions: ForgeSession[]; current_session_id: string }>("/api/auth/sessions"); }
export function revokeSession(id: string) { return request("/api/auth/sessions/" + encodeURIComponent(id), { method: "DELETE" }); }
export function forgotPassword(email: string) { return raw<{ message: string }>("/api/auth/forgot-password", post({ email })); }
export function resendVerification(email: string) { return raw<{ message: string }>("/api/auth/resend-verification", post({ email })); }
export function verifyEmail(token: string) { return raw<{ message: string }>("/api/auth/verify-email", post({ token })); }
export function resetPassword(token: string, password: string) { return raw<{ message: string }>("/api/auth/reset-password", post({ token, password })); }

export async function logout(all = false) {
  const started = epoch;
  try { await request("/api/auth/" + (all ? "logout-all" : "logout"), { method: "POST" }); }
  finally { if (started === epoch) clearSession(); }
}

export async function changePassword(current_password: string, new_password: string) {
  await request("/api/auth/change-password", post({ current_password, new_password }));
  clearSession();
}

export async function deleteAccount(current_password: string) {
  await request("/api/auth/me", { method: "DELETE", body: JSON.stringify({ current_password }) });
  clearSession();
}

export async function listUsers(): Promise<ForgeUser[]> {
  const users: ForgeUser[] = [];
  let cursor = "";
  do {
    const page = await request<{ users: ForgeUser[]; next_cursor?: string }>("/api/users" + (cursor ? "?after=" + encodeURIComponent(cursor) : ""));
    users.push(...page.users);
    cursor = page.next_cursor || "";
  } while (cursor);
  return users;
}
