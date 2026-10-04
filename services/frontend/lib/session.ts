import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ledgerlens_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function sessionSecret(): string | null {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (configured && configured.length >= 32 && !configured.startsWith("replace-with-")) return configured;
  return process.env.NODE_ENV === "development"
    ? "ledgerlens-local-development-session-secret-change-me"
    : null;
}

export const OAUTH_STATE_COOKIE = "ledgerlens_oauth_state";

export type GithubConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  allowedUsers: string[];
};

/** GitHub SSO settings, or null when not (fully) configured. Fails closed without an allowlist. */
export function githubConfig(): GithubConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  const allowedUsers = (process.env.GITHUB_ALLOWED_USERS ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const placeholder = (value: string) => !value || value.startsWith("replace-with-");
  if (placeholder(clientId) || placeholder(clientSecret) || !allowedUsers.length) return null;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return { clientId, clientSecret, appUrl, allowedUsers };
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${expiresAt}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expiresAtText, nonce, suppliedSignature, ...rest] = token.split(".");
  if (!expiresAtText || !nonce || !suppliedSignature || rest.length) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const payload = `${expiresAtText}.${nonce}`;
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireApiSession(): Promise<Response | null> {
  return (await hasValidSession())
    ? null
    : Response.json({ message: "Authentication required" }, { status: 401 });
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
