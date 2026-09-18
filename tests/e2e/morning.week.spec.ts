import { expect, test } from "@playwright/test";
import { login, openDetails, watchErrors } from "./helpers";

// Thu 29 Oct 07:42 IST, week 8. Mon–Wed are logged; Thursday is Push B.
test.describe("moving and skipping a day", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("a holiday: move today's session to Sunday, then undo; skip a day, then undo", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/train");
    await page.getByRole("link", { name: /Move or skip a session/ }).click();
    await expect(page).toHaveURL(/\/train\/week$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This week");

    const day = (d: string) => page.locator(`[data-date="${d}"]`);
    await expect(day("2026-10-26")).toContainText("Logged. It stays as it is.");
    await expect(day("2026-10-26").locator("summary")).toHaveCount(0);

    // Move Thursday's Push B onto Sunday.
    await openDetails(day("2026-10-29"), "Move or skip Push B");
    await day("2026-10-29").getByLabel("Move Push B to").selectOption({ label: "Sun 1 Nov · rest day" });
    await day("2026-10-29").getByLabel("Why (optional)").fill("Diwali shopping");
    await day("2026-10-29").getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("status")).toHaveText("Moved. The card and the coach now follow the new week.");
    await expect(day("2026-10-29")).toContainText("Rest · session moved to Sun 1 Nov");
    await expect(day("2026-11-01")).toContainText("Push B · moved from Thu 29 Oct");
    await expect(page.getByLabel("Changes this week")).toContainText("Diwali shopping");

    // Today's card and home follow it.
    await page.goto("/train");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rest day");
    await expect(page.getByText("Today's session moved to Sun 1 Nov. Rest today.")).toBeVisible();

    await page.goto("/train/week");
    await page.getByRole("button", { name: "Undo: Moved Thu 29 Oct → Sun 1 Nov" }).click();
    await expect(page.getByRole("status")).toHaveText("Change undone. The day is back to the plan.");
    await expect(day("2026-10-29")).toContainText("Push B");
    await page.goto("/train");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Push B");

    // Swap Friday and Saturday, skip Saturday's (now Pull B) session.
    await page.goto("/train/week");
    await openDetails(day("2026-10-30"), "Move or skip Pull B");
    await day("2026-10-30").getByLabel("Move Pull B to").selectOption({ label: "Sat 31 Oct · swap with Legs P" });
    await day("2026-10-30").getByRole("button", { name: "Move" }).click();
    await expect(day("2026-10-30")).toContainText("Legs P · moved from Sat 31 Oct");
    await expect(day("2026-10-31")).toContainText("Pull B · moved from Fri 30 Oct");
    await openDetails(day("2026-10-31"), "Move or skip Pull B");
    await day("2026-10-31").getByRole("button", { name: "Skip Pull B" }).click();
    await expect(page.getByRole("status")).toHaveText("Skipped. Those lifts repeat unchanged next time.");
    await expect(day("2026-10-31")).toContainText("Rest · session skipped");

    // Undo both, newest first; the week is back to the plan.
    await page.getByRole("button", { name: "Undo: Skipped Sat 31 Oct" }).click();
    await page.getByRole("button", { name: "Undo: Moved Fri 30 Oct → Sat 31 Oct" }).click();
    await expect(day("2026-10-30")).toContainText("Pull B");
    await expect(day("2026-10-31")).toContainText("Legs P");
    await expect(page.getByLabel("Changes this week")).toContainText("No changes. The week runs as planned.");

    // Weeks outside the window can't be reached.
    await page.goto("/train/week?w=2026-12-07");
    await expect(page.getByRole("link", { name: /→/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
