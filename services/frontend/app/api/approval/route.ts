import { BACKEND_URL, backendHeaders } from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/v1/agent/approval`, {
    method: "POST",
    headers: backendHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
