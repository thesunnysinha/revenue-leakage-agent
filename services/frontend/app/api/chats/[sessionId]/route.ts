import { BACKEND_URL, backendHeaders } from "@/lib/backend";
import { requireApiSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const { sessionId } = await params;
  const response = await fetch(`${BACKEND_URL}/api/v1/chats/${encodeURIComponent(sessionId)}`, { headers: backendHeaders(), cache: "no-store" });
  return Response.json(await response.json(), { status: response.status });
}
