import { BACKEND_URL, backendHeaders } from "@/lib/backend";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ message: "sessionId is required" }, { status: 400 });

  const response = await fetch(
    `${BACKEND_URL}/api/v1/agent/tool-progress?session_id=${encodeURIComponent(sessionId)}`,
    { headers: backendHeaders({ Accept: "text/event-stream" }), cache: "no-store", signal: request.signal },
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
