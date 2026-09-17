"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  checkin: "Check-in saved. The coach has updated today's card.",
  tonight: "Totals saved.",
  session: "Session finished. Tomorrow's card follows what you lifted.",
  measure: "Measurements saved.",
  settings: "Settings saved.",
  password: "Password changed. Other devices are signed out.",
  override: "Override saved and logged.",
  coach: "The coach ran.",
  replay: "Replay test finished.",
};

/** Shows a one-line confirmation after a redirect with ?saved=<key>. */
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("saved");
  const [hidden, setHidden] = useState<string | null>(null);
  const message = key && hidden !== key ? MESSAGES[key] : null;

  useEffect(() => {
    if (!message || !key) return;
    const t = setTimeout(() => {
      setHidden(key);
      const next = new URLSearchParams(params.toString());
      next.delete("saved");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 4000);
    return () => clearTimeout(t);
  }, [message, key, params, pathname, router]);

  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button type="button" onClick={() => setHidden(key)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
