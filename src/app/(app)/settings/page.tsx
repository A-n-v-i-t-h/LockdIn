import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadSettings } from "@/lib/fitness/repo";
import { gymIsConfirmed } from "@/lib/fitness/equipment";
import { PROGRAM_VERSION } from "@/lib/fitness/program";
import { CURRENT_RULES } from "@/lib/fitness/rules";
import { logoutAction, logoutEverywhereAction, renameAction } from "@/app/actions/auth";
import { saveScheduleAction } from "@/app/actions/fitness";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { GymForm, PasswordForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await loadSettings(await getDb(), user.id);
  const confirmed = gymIsConfirmed(settings.gym);

  return (
    <main id="main" className="scr">
      <Header chip="Settings" />
      <div className="hd">
        <div className="eyebrow">{user.email}</div>
        <h1 className="h1">Settings</h1>
      </div>

      <div className="sec">Profile</div>
      <form action={renameAction} className="card">
        <label className="field">
          <span>Name on the home screen</span>
          <input className="input" name="name" defaultValue={user.displayName} maxLength={60} required />
        </label>
        <button type="submit" className="btn small">
          Save name
        </button>
      </form>

      <div className="sec" id="gym">
        Gym equipment <span>{confirmed ? "confirmed" : "needs confirming"}</span>
      </div>
      {!confirmed ? (
        <p className="why">
          Progression steps come from here. The plan still lists the bar weight, smallest plate, dumbbell step and cable step as unknown. Check them at the gym and tick each one.
        </p>
      ) : null}
      <GymForm gym={settings.gym} />

      <div className="sec">Schedule</div>
      <form action={saveScheduleAction} className="card">
        <label className="field">
          <span>Rest day in weeks 3–4 (five-day weeks)</span>
          <select className="select" name="buildRestDay" defaultValue={String(settings.schedule.buildRestDay)}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <p className="sm t3">
          The plan runs five days in weeks 3–4 without naming the day off. Friday is the default: bench stays three times a week, and pull volume is the day that goes. From 5 Oct all six days run.
        </p>
        <button type="submit" className="btn small">
          Save schedule
        </button>
      </form>

      <div className="sec">Account</div>
      <PasswordForm />
      <div className="btn-row">
        <form action={logoutAction}>
          <button type="submit" className="btn ghost small" style={{ width: "100%" }}>
            <Icon name="logout" size={14} /> Sign out
          </button>
        </form>
        <form action={logoutEverywhereAction}>
          <button type="submit" className="btn ghost small" style={{ width: "100%" }}>
            Sign out everywhere
          </button>
        </form>
      </div>

      <div className="sec">Data</div>
      <section className="card">
        <p className="sm t2">Everything you&apos;ve logged, including every earlier version of edited entries, as one JSON file.</p>
        <a href="/api/export" className="btn ghost small" download>
          <Icon name="download" size={14} /> Download my data
        </a>
      </section>

      <div className="sec">About</div>
      <section className="card">
        <table className="tbl">
          <tbody>
            <tr>
              <td>Program</td>
              <td>{PROGRAM_VERSION} (Gym plan, 17 Sep 2026)</td>
            </tr>
            <tr>
              <td>Coach rules</td>
              <td>
                <Link href="/coach/rules" className="link">
                  {CURRENT_RULES.version}
                </Link>
              </td>
            </tr>
            <tr>
              <td>Time zone</td>
              <td>India (IST)</td>
            </tr>
            <tr>
              <td>AI writing</td>
              <td>Off. Notes are written from the rules&apos; numbers.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
