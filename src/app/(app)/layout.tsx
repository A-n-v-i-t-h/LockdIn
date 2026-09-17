import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { TabBar } from "@/components/TabBar";
import { Toast } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="app">
      {children}
      <TabBar />
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </div>
  );
}
