import Link from "next/link";

const LINKS = [
  { href: "/train", label: "Today" },
  { href: "/train/week", label: "Week" },
  { href: "/train/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
  { href: "/train/history", label: "History" },
  { href: "/train/measure", label: "Measure" },
];

export function TrainNav({ current }: { current: string }) {
  return (
    <nav className="pill-nav" aria-label="Training sections">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`chip${l.href === current ? " up" : ""}`} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
