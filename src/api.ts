export interface ForgeUser {
  accountid: string;
  username: string;
  screen_name: string;
}

export const apiBaseUrl = (
  import.meta.env.VITE_FORGE_API_URL || "https://forge-34-170-115-154.sslip.io"
).replace(/\/$/, "");

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiBaseUrl + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export async function listUsers(token: string): Promise<ForgeUser[]> {
  const users: ForgeUser[] = [];
  let cursor = "";
  do {
    const page = await request<{ users: ForgeUser[]; next_cursor?: string }>(
      "/api/users" + (cursor ? "?after=" + encodeURIComponent(cursor) : ""), token,
    );
    users.push(...page.users);
    cursor = page.next_cursor || "";
  } while (cursor);
  return users;
}

export function createUser(token: string, username: string, screenName: string): Promise<ForgeUser> {
  return request("/api/users", token, {
    method: "POST",
    body: JSON.stringify({ username, screen_name: screenName }),
  });
}

export function updateScreenName(token: string, accountid: string, screenName: string): Promise<ForgeUser> {
  return request("/api/users/" + encodeURIComponent(accountid), token, {
    method: "PATCH",
    body: JSON.stringify({ screen_name: screenName }),
  });
}
