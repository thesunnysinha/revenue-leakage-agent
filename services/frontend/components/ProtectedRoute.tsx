import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasValidSession } from "@/lib/session";

export default async function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!(await hasValidSession())) redirect("/login");
  return children;
}
