import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, formError, login, watchErrors } from "./helpers";

test.describe("morning, Thursday 29 October (week 8)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("home leads with the weigh-in, then tonight's session and the coach note", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Morning, Anvith");
    await expect(page.getByText("Wk 08 · Thu 29 Oct")).toBeVisible();
    await expect(page.getByText(/-day streak/)).toBeVisible();

    const order = await page.locator("main > .stack").evaluateAll((els) => els.map((e) => e.textContent?.slice(0, 40) ?? ""));
    expect(order[0]).toContain("Morning check-in");
    expect(order[1]).toContain("Station 04");

    const hero = page.getByLabel("Today's session");
    await expect(hero).toContainText("Push B");
    await expect(hero).toContainText("Volume bench");
    await expect(hero.getByRole("img", { name: /bar with/ })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Start session" })).toBeVisible();

    await expect(page.getByText("Best-set attempt")).toBeVisible();
    await expect(page.getByLabel("Coach note")).toContainText("Work order 1029");
    await expect(page.getByLabel("Coach note")).toContainText("Push B tonight");
    await expect(page.getByText("Pay electricity bill")).toBeVisible();
    // Never the single-day weight: the headline number is the 7-day average.
    await expect(page.locator(".st-grid").first()).toContainText(/\d\d\.\d/);
    await expect(page.locator(".st-grid").first()).toContainText("/ wk");
    expect(errors).toEqual([]);
  });

  test("the morning check-in with the keypad re-runs the coach", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Log weigh-in" }).click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByText(/Last reading \d\d\.\d kg/)).toBeVisible();

    const pad = page.getByLabel("Number pad");
    for (const k of ["6", "0", "Decimal point", "4", "5"]) await pad.getByRole("button", { name: k, exact: true }).click();
    await expect(page.getByTestId("weight-readout")).toHaveText("60.45");
    await pad.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("weight-readout")).toHaveText("60.4");

    await page.getByLabel("In bed").fill("23:30");
    await page.getByLabel("Woke").fill("07:00");
    await expect(page.getByText("7 h 30 m")).toBeVisible();
    await page.getByRole("button", { name: "Save check-in" }).click();

    await expect(page).toHaveURL(/\/\?saved=checkin$/);
    await expect(page.getByText("Check-in saved. The coach has updated today's card.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Log weigh-in" })).toHaveCount(0);
    await expect(page.locator(".lamp").first()).toContainText("7 h 30 m");
    await expect(page.getByLabel("Coach note")).toContainText("rev 2");

    // Editing the same morning keeps history and shows the saved values.
    await page.goto("/checkin");
    await expect(page.getByTestId("weight-readout")).toHaveText("60.4");
    await expect(page.getByRole("button", { name: "Update check-in" })).toBeVisible();
  });

  test("the readiness gate opens after a full night and a fed day", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".st-banner")).toContainText("Cleared");
    await page.goto("/train");
    await expect(page.getByLabel("Readiness")).toContainText("Best-set attempt is on");
    await expect(page.getByText("Best-set attempt: last set, every clean rep")).toBeVisible();
  });

  test("a bad check-in is rejected with a message", async ({ page }) => {
    await page.goto("/checkin");
    const pad = page.getByLabel("Number pad");
    for (let i = 0; i < 6; i++) await pad.getByRole("button", { name: "Delete" }).click();
    for (const k of ["9", "9", "9"]) await pad.getByRole("button", { name: k, exact: true }).click();
    await page.getByRole("button", { name: /check-in/i }).click();
    await expect(formError(page)).toHaveText("Weight should be between 25 and 250 kg.");
    await expect(page.getByTestId("weight-readout")).toHaveText("999");
  });

  test("every screen renders cleanly, fits the phone and passes accessibility checks", async ({ page }) => {
    const errors = watchErrors(page);
    const paths = [
      "/",
      "/checkin",
      "/tonight",
      "/train",
      "/train/progress",
      "/train/history",
      "/train/history/2026-10-27",
      "/train/measure",
      "/coach",
      "/coach/rules",
      "/plan",
      "/plan?view=upcoming",
      "/plan/goals",
      "/calendar",
      "/journal",
      "/settings",
    ];
    for (const p of paths) {
      await page.goto(p);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    }
    expect(errors).toEqual([]);
  });

  test("small phones (320 px) don't scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const p of ["/", "/train", "/train/progress", "/train/history", "/coach", "/plan", "/calendar", "/journal", "/settings", "/checkin", "/tonight"]) {
      await page.goto(p);
      await expectNoHorizontalScroll(page);
    }
  });

  test("the tab bar reaches every module and marks the current one", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [name, url, heading] of [
      ["Train", /\/train$/, "Push B"],
      ["Plan", /\/plan$/, "Plan"],
      ["Calendar", /\/calendar$/, "October"],
      ["Journal", /\/journal$/, "Journal"],
      ["Home", /\/$/, "Morning, Anvith"],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    }
  });
});
