import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="app">
      <main id="main" className="login">
        <div className="hazard" aria-hidden="true" style={{ margin: 0 }} />
        <div className="hd">
          <span className="st-logo" style={{ fontSize: 16 }}>
            <Icon name="lock" size={16} stroke={2.4} />
            Station 00 · Access
          </span>
          <h1 className="h1">LockdIn</h1>
          <p className="sub">Training, food and the rest of the day. One athlete, one key.</p>
        </div>
        <LoginForm next={next ?? ""} />
      </main>
    </div>
  );
}
