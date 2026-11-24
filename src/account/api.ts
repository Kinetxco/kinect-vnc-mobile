export const WEBSITE_URL = "https://kinectvnc.com";

export type AccountTokens = {
  userJwt: string;
  refreshToken: string;
  jwtExpiresIn: number | null;
  email: string | null;
  signalHost: string | null;
};

async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${WEBSITE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The Kinect account site is unreachable.");
  }
  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "")
        : "";
    throw new Error(message || `Sign-in failed (${response.status}).`);
  }
  return payload;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tokensFrom(payload: unknown): AccountTokens {
  const body = (payload ?? {}) as Record<string, unknown>;
  const userJwt = typeof body.user_jwt === "string" ? body.user_jwt : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!userJwt || !refreshToken) throw new Error("The account site did not return a sign-in.");
  return {
    userJwt,
    refreshToken,
    jwtExpiresIn: typeof body.jwt_expires_in === "number" ? body.jwt_expires_in : null,
    email: typeof body.email === "string" ? body.email : null,
    signalHost: typeof body.signal_host === "string" ? body.signal_host : null,
  };
}

export async function signIn(email: string, password: string): Promise<AccountTokens> {
  return tokensFrom(
    await post("/api/desktop/session", {
      email: email.trim(),
      password,
    })
  );
}

export async function refreshTokens(refreshToken: string): Promise<AccountTokens> {
  return tokensFrom(await post("/api/desktop/token/refresh", { refresh_token: refreshToken }));
}

export async function fetchEntitlement(refreshToken: string): Promise<string | null> {
  try {
    const payload = (await post("/api/desktop/entitlement", { refresh_token: refreshToken })) as {
      entitlement?: unknown;
    };
    return typeof payload?.entitlement === "string" && payload.entitlement.trim()
      ? payload.entitlement
      : null;
  } catch {
    return null;
  }
}
