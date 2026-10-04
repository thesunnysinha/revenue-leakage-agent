import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_COOKIE, githubConfig } from "@/lib/session";

/** Starts the GitHub OAuth web flow. */
export async function GET() {
  const config = githubConfig();
  if (!config) {
    return Response.json({ message: "GitHub sign-in is not configured on this server." }, { status: 503 });
  }
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/github/callback`);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/github",
    maxAge: 600,
  });
  return response;
}
