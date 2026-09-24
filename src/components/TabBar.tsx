"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { LinkPending } from "./LinkPending";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" || p.startsWith("/checkin") || p.startsWith("/tonight") },
  { href: "/train", label: "Train", icon: "train", match: (p) => p.startsWith("/train") || p.startsWith("/coach") },
  { href: "/plan", label: "Plan", icon: "plan", match: (p) => p.startsWith("/plan") },
  { href: "/calendar", label: "Calendar", icon: "cal", match: (p) => p.startsWith("/calendar") },
  { href: "/journal", label: "Journal", icon: "journal", match: (p) => p.startsWith("/journal") },
];

export function TabBar() {
  const pathname = usePathname() || "/";
  return (
    <nav className="tb" aria-label="Main">
      {TABS.map((t) => {
        const on = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
