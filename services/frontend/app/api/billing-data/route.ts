import { BACKEND_URL, backendHeaders } from "@/lib/backend";
import { requireApiSession } from "@/lib/session";

export async function GET() {
  const authError = await requireApiSession();
  if (authError) return authError;
  const response = await fetch(`${BACKEND_URL}/api/v1/billing-data`, {
    headers: backendHeaders(),
    cache: "no-store",
  });
  return Response.json(await response.json(), { status: response.status });
}
