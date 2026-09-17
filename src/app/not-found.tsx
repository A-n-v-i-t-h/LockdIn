import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app">
      <main id="main" className="login">
        <div className="hazard" aria-hidden="true" style={{ margin: 0 }} />
        <h1 className="h1">Not here</h1>
        <p className="sub">That page doesn&apos;t exist, or it belongs to something that was deleted.</p>
        <Link href="/" className="btn">
          Home
        </Link>
      </main>
    </div>
  );
}
