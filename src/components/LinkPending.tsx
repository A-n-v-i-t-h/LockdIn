"use client";

import { useLinkStatus } from "next/link";

/**
 * Goes inside a <Link>: a red line on the link while its page loads, so a tap shows
 * at once even when the server takes a moment. Shown after 100 ms (see globals.css).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={pending ? "link-pending on" : "link-pending"} />;
}
