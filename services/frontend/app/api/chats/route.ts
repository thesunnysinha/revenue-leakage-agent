import { BACKEND_URL, backendHeaders } from "@/lib/backend";

export async function GET() {
  const response = await fetch(`${BACKEND_URL}/api/v1/chats`, { headers: backendHeaders(), cache: "no-store" });
  return Response.json(await response.json(), { status: response.status });
}

export async function POST() {
  const response = await fetch(`${BACKEND_URL}/api/v1/chats`, { method: "POST", headers: backendHeaders(), cache: "no-store" });
  return Response.json(await response.json(), { status: response.status });
}
