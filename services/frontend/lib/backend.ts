import "server-only";

/** Server-only helpers for authenticated requests from Next.js to FastAPI. */

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export function backendHeaders(extra?: HeadersInit): Headers {
  const token = process.env.BACKEND_API_TOKEN;
  if (!token || token.length < 32) {
    throw new Error("BACKEND_API_TOKEN must be configured with at least 32 characters.");
  }
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
