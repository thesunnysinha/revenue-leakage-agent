import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  githubConfig,
  sessionCookieOptions,
} from "@/lib/session";

function sameState(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function githubLogin(code: string, config: NonNullable<ReturnType<typeof githubConfig>>) {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${config.appUrl}/api/auth/github/callback`,
    }),
  });
  const { access_token: accessToken } = await tokenResponse.json() as { access_token?: string };
  if (!accessToken) return null;
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  if (!userResponse.ok) return null;
  const { login } = await userResponse.json() as { login?: string };
  return login ?? null;
}

export async function GET(request: Request) {
  const config = githubConfig();
  const sessionToken = createSessionToken();
  if (!config || !sessionToken) {
    return Response.json({ message: "GitHub sign-in is not configured on this server." }, { status: 503 });
  }

  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${config.appUrl}/login?error=${reason}`);
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/github" });
    return response;
  };

  const params = new URL(request.url).searchParams;
  const cookieState = request.headers.get("cookie")
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);
  const code = params.get("code");
  if (params.get("error") || !code) return fail("denied");
  if (!sameState(params.get("state"), cookieState)) return fail("state");

  const login = await githubLogin(code, config).catch(() => null);
  if (!login) return fail("github");

  const response = NextResponse.redirect(`${config.appUrl}/`);
  response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/github" });
  return response;
}
