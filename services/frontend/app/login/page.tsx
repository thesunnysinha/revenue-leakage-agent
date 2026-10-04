import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { githubConfig, hasValidSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await hasValidSession()) redirect("/");
  const { error } = await searchParams;
  return <LoginForm configured={githubConfig() !== null} error={error} />;
}
