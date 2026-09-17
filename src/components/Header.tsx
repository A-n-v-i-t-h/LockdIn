import Link from "next/link";
import { Icon } from "./Icon";

export function Header({ chip }: { chip?: string }) {
  return (
    <>
      <header className="st-head">
        <Link href="/" className="st-logo" aria-label="LockdIn home">
          <Icon name="lock" size={18} stroke={2.4} />
          LOCKDIN
        </Link>
        <div className="head-right">
          {chip ? <span className="chip">{chip}</span> : null}
          <Link href="/settings" className="iconbtn" aria-label="Settings">
            <Icon name="gear" size={20} />
          </Link>
        </div>
      </header>
      <div className="hazard" aria-hidden="true" />
    </>
  );
}
