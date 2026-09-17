import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEntry, listEntries, usedTags } from "@/lib/modules/journal";
import { deleteEntryAction } from "@/app/actions/modules";
import { fmtShort, localDate, localTime, now } from "@/lib/time";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { EntryForm } from "./EntryForm";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; edit?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const at = now();
  const today = localDate(at);
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const tag = (sp.tag ?? "").slice(0, 30);
  const [entries, tags, editing] = await Promise.all([
    listEntries(db, user.id, { search: q, tag, limit: 100 }),
    usedTags(db, user.id),
    sp.edit ? getEntry(db, user.id, sp.edit) : Promise.resolve(null),
  ]);
  const firstName = user.displayName.split(" ")[0] || "you";
  const qs = (next: { q?: string; tag?: string }) => {
    const p = new URLSearchParams();
    if (next.q) p.set("q", next.q);
    if (next.tag) p.set("tag", next.tag);
    const s = p.toString();
    return s ? `/journal?${s}` : "/journal";
  };

  return (
    <main id="main" className="scr">
      <Header chip={fmtShort(today)} />
      <div className="hd">
        <div className="eyebrow">
          {fmtShort(today)} · {localTime(at)}
        </div>
        <h1 className="h1">Journal</h1>
      </div>

      <section className="card" aria-labelledby="write-h" id="write">
        <span id="write-h" className="lbl">
          {editing ? `Editing · ${fmtShort(editing.entryDate)}` : "Tonight"}
        </span>
        {!editing ? <div style={{ fontWeight: 700 }}>How was today, {firstName}?</div> : null}
        <EntryForm key={editing?.id ?? "new"} tags={tags} today={today} entry={editing} />
      </section>

      <form action="/journal" method="get" className="row" role="search">
        <label className="grow">
          <span className="sr-only">Search entries</span>
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search entries" />
        </label>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <button type="submit" className="iconbtn" aria-label="Search">
          <Icon name="search" size={18} />
        </button>
      </form>
      <nav className="pill-nav" aria-label="Filter by tag">
        <Link href={qs({ q })} className={`chip${!tag ? " up" : ""}`} aria-current={!tag ? "true" : undefined}>
          All
        </Link>
        {tags.map((t) => (
          <Link key={t} href={qs({ q, tag: t })} className={`chip${tag === t ? " up" : ""}`} aria-current={tag === t ? "true" : undefined}>
            {t}
          </Link>
        ))}
      </nav>

      <section className="card flush" aria-label="Entries">
        {entries.length ? (
          entries.map((e) => (
            <article key={e.id} className="entry">
              <div className="row">
                <span className="dt">{fmtShort(e.entryDate)}</span>
                <div className="row" style={{ gap: 4 }}>
                  <Link href={`/journal?edit=${e.id}#write`} className="iconbtn" aria-label={`Edit entry from ${fmtShort(e.entryDate)}`} style={{ width: 32, height: 32 }}>
                    <Icon name="edit" size={14} />
                  </Link>
                  <form action={deleteEntryAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="iconbtn danger" aria-label={`Delete entry from ${fmtShort(e.entryDate)}`} style={{ width: 32, height: 32 }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </form>
                </div>
              </div>
              <p>{e.body}</p>
              {e.tags.length ? (
                <div className="wrap">
                  {e.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="sm t3" style={{ padding: "12px 0" }}>
            {q || tag ? "No entries match." : "No entries yet. A line a night is plenty."}
          </p>
        )}
      </section>
    </main>
  );
}
