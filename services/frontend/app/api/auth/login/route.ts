import { NextResponse } from "next/server";
import { createSessionToken, demoCredentials, sessionCookieOptions } from "@/lib/session";
import { timingSafeEqual, createHash } from "node:crypto";

function matches(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const credentials = demoCredentials();
  const token = createSessionToken();
  if (!credentials || !token) {
    return Response.json({ message: "Demo authentication is not configured on this server." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { username?: unknown; password?: unknown };
  const validUsername = matches(body.username, credentials.username);
  const validPassword = matches(body.password, credentials.password);
  if (!(validUsername && validPassword)) {
    return Response.json({ message: "Incorrect username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("ledgerlens_session", token, sessionCookieOptions);
  return response;
}
