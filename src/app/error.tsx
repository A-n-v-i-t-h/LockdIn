"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="app">
      <main id="main" className="login">
        <div className="hazard" aria-hidden="true" style={{ margin: 0 }} />
        <h1 className="h1">Something broke</h1>
        <p className="sub">Nothing you saved before this is lost. Try again; if it keeps happening, the reference below helps find it.</p>
        {error.digest ? <p className="sm t3">Reference: {error.digest}</p> : null}
        <button type="button" className="btn" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn ghost">
          Home
        </Link>
      </main>
    </div>
  );
}
