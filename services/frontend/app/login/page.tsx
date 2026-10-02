import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { displayedDemoCredentials, hasValidSession } from "@/lib/session";

export default async function LoginPage() {
  if (await hasValidSession()) redirect("/");
  return <LoginForm demoCredentials={displayedDemoCredentials()} />;
}
