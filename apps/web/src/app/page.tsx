import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Dashboard } from "@/components/dashboard";

export default async function HomePage() {
  const session = await auth();

  if (!session?.accessToken) {
    redirect("/login");
  }

  return <Dashboard accessToken={session.accessToken} />;
}
