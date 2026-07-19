// Supabase Auth (GoTrue) via REST — Phase 3.3 user accounts.
// Same house style as supabase.ts: plain fetch, no SDK.
//
// Accounts mode turns on when SUPABASE_URL + SUPABASE_ANON_KEY are
// in .env. Without them the platform behaves exactly as before
// (open locally, or ACCESS_PASSWORD team gate online).

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SignupResult {
  /** Session present when the account is usable immediately. */
  session: AuthSession | null;
  /** True when Supabase requires the user to confirm via email first. */
  needsConfirmation: boolean;
}

export function accountsEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function base(): string {
  return (process.env.SUPABASE_URL as string).replace(/\/$/, "") + "/auth/v1";
}

function headers(token?: string): Record<string, string> {
  const anon = process.env.SUPABASE_ANON_KEY as string;
  return {
    apikey: anon,
    authorization: `Bearer ${token ?? anon}`,
    "content-type": "application/json",
  };
}

interface GoTrueUser {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string };
}

interface GoTrueSession {
  access_token?: string;
  refresh_token?: string;
  user?: GoTrueUser;
}

function toUser(u: GoTrueUser): AuthUser {
  const email = u.email ?? "";
  return {
    id: u.id,
    email,
    displayName: u.user_metadata?.display_name || email.split("@")[0] || "user",
  };
}

async function errText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error_description?: string; msg?: string; message?: string; error?: string };
    return body.error_description || body.msg || body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function signup(
  email: string,
  password: string,
  displayName?: string
): Promise<SignupResult> {
  const res = await fetch(base() + "/signup", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      password,
      data: { display_name: displayName || email.split("@")[0] },
    }),
  });
  if (!res.ok) throw new Error(await errText(res));
  const body = (await res.json()) as GoTrueSession & GoTrueUser;
  if (body.access_token && body.refresh_token && body.user) {
    return {
      session: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        user: toUser(body.user),
      },
      needsConfirmation: false,
    };
  }
  // No session back = email confirmation is on for this Supabase project.
  return { session: null, needsConfirmation: true };
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(base() + "/token?grant_type=password", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await errText(res));
  const body = (await res.json()) as GoTrueSession;
  if (!body.access_token || !body.refresh_token || !body.user) {
    throw new Error("Login did not return a session");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    user: toUser(body.user),
  };
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const res = await fetch(base() + "/token?grant_type=refresh_token", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(await errText(res));
  const body = (await res.json()) as GoTrueSession;
  if (!body.access_token || !body.refresh_token || !body.user) {
    throw new Error("Refresh did not return a session");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    user: toUser(body.user),
  };
}

export async function logout(accessToken: string): Promise<void> {
  // Best effort — revokes the refresh token server-side.
  await fetch(base() + "/logout", {
    method: "POST",
    headers: headers(accessToken),
  }).catch(() => undefined);
}

// ---- token verification with a small cache ------------------------
// Every request carries the access token; asking Supabase "who is
// this?" each time would be slow, so verified tokens are cached for
// five minutes (well under the token's one-hour life).

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { user: AuthUser; until: number }>();

export async function verifyToken(accessToken: string): Promise<AuthUser | null> {
  const hit = cache.get(accessToken);
  if (hit && hit.until > Date.now()) return hit.user;

  const res = await fetch(base() + "/user", { headers: headers(accessToken) });
  if (!res.ok) {
    cache.delete(accessToken);
    return null;
  }
  const body = (await res.json()) as GoTrueUser;
  if (!body.id) return null;
  const user = toUser(body);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(accessToken, { user, until: Date.now() + CACHE_TTL_MS });
  return user;
}

/** Test hook. */
export function clearAuthCache(): void {
  cache.clear();
}
