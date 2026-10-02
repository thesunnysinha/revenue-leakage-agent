import { BACKEND_URL, backendHeaders } from "@/lib/backend";
import { requireApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const apiKey = request.headers.get("X-OpenAI-API-Key");
  if (!apiKey || apiKey.length < 20 || apiKey.length > 512) {
    return Response.json({ error: "Enter a valid OpenAI API key to continue." }, { status: 400 });
  }
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/v1/agent/approval`, {
    method: "POST",
    headers: backendHeaders({ "Content-Type": "application/json", "X-OpenAI-API-Key": apiKey }),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
