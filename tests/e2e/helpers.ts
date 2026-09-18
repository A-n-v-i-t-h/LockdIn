import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const DEMO = { email: "demo@lockdin.test", password: "stencil-plate-rack-42" };

/** The app's form error. (Next.js also renders an empty route announcer with role=alert.) */
export function formError(page: Page) {
  return page.locator("p.form-error[role=alert]");
}

export async function login(page: Page, password = DEMO.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Collects page errors and console errors so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}${m.location().url ? ` (${m.location().url})` : ""}`);
  });
  return errors;
}

/** Opens the <details> whose summary has this text; leaves it open if it already is. */
export async function openDetails(scope: Page | Locator, summary: string) {
  const summaryEl = scope.locator("summary", { hasText: summary }).first();
  const details = summaryEl.locator("xpath=..");
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await summaryEl.click();
  await expect(details).toHaveAttribute("open", "");
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

/** WCAG 2.1 A/AA checks; serious and critical findings fail the test. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => {
    const nodes = v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1] ?? ""}`);
    return `${page.url()} ${v.id} (${v.impact}): ${nodes.join(" | ")}`;
  });
  expect(report, "accessibility violations").toEqual([]);
}
