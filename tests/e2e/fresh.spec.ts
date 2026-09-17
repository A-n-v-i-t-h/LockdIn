import { expect, test } from "@playwright/test";
import { DEMO, formError, login, watchErrors } from "./helpers";

// Thursday 17 September 2026, 20:00: ramp-in week 2, with only what LOG.md holds.
test.describe("the real starting point", () => {
  test("signed-out visitors are sent to the login page, and back after signing in", async ({ page }) => {
    await page.goto("/train/progress");
    await expect(page).toHaveURL(/\/login\?next=%2Ftrain%2Fprogress$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("LockdIn");
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Password").fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/train\/progress$/);
  });

  test("a wrong password is refused and the email stays filled in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Password").fill("not-my-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formError(page)).toHaveText("That email and password don't match.");
    await expect(page.getByLabel("Email")).toHaveValue(DEMO.email);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("repeated failures lock the email for a while", async ({ page }) => {
    await page.goto("/login");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Email").fill("someone-else@example.com");
      await page.getByLabel("Password").fill(`guess-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(formError(page)).toHaveText("That email and password don't match.");
    }
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formError(page)).toHaveText(/Too many attempts\. Try again in \d+ min\./);
  });

  test("an open redirect through ?next is not possible", async ({ page }) => {
    await page.goto("/login?next=//evil.example.com/");
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Password").fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("APIs refuse anonymous callers and the app sends security headers", async ({ request }) => {
    expect((await request.get("/api/export")).status()).toBe(401);
    expect((await request.get("/api/photos/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("same-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");
  });

  test("it installs as an app", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "LockdIn", display: "standalone", start_url: "/", theme_color: "#131313" });
    for (const icon of manifest.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
    }
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect(await sw.text()).toContain("never cached");
    expect((await request.get("/offline.html")).status()).toBe(200);
    expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
  });

  test.describe("signed in", () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test("home in ramp-in week 2, in the evening", async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evening, Anvith");
      await expect(page.getByText("Wk 02 · Thu 17 Sep")).toBeVisible();
      await expect(page.getByText("Ramp-in (trainer block)", { exact: false })).toBeVisible();
      const order = await page.locator("main > .stack").evaluateAll((els) => els.map((e) => e.textContent?.slice(0, 40) ?? ""));
      expect(order[0]).toContain("Station 04");
      expect(order.join(" ")).toContain("Tonight · Cronometer totals");
      await expect(page.getByText("Tonight · ~70 min · optional")).toBeVisible();
      await expect(page.locator(".st-banner")).toContainText("Ramp-in");
      await expect(page.getByRole("link", { name: "Log weigh-in" })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("the ramp-in card: two light sets each, loads left to the trainer", async ({ page }) => {
      await page.goto("/train");
      await expect(page.getByText(/Ramp-in with your trainer/)).toBeVisible();
      await expect(page.getByText("Trainer block: train today only if it's one of your 3–4 days.")).toBeVisible();
      const bench = page.locator('section[data-slot="1"]');
      await expect(bench).toContainText("Your pick · 2 × 8–10");
      await expect(page.getByText("0 of 12 sets logged")).toBeVisible();
      await expect(bench.getByRole("button", { name: "Done as planned" })).toHaveCount(0);
      await bench.getByRole("button", { name: /^Set 1:/ }).click();
      await bench.getByLabel("Weight in kilograms").fill("30");
      await bench.getByLabel("Reps", { exact: true }).fill("8");
      await bench.getByRole("button", { name: "Log set" }).click();
      await expect(page.getByText("1 of 12 sets logged")).toBeVisible();
    });

    test("empty states say what is missing instead of guessing", async ({ page }) => {
      await page.goto("/train/progress");
      await expect(page.getByText("A weekly change needs two weeks of weigh-ins.")).toBeVisible();
      await expect(page.getByText("Bests start counting after the ramp-in, from sets of 6 to 12 reps.")).toBeVisible();
      await page.goto("/coach");
      await expect(page.getByText("No changes yet. The first ones arrive with the week-3 baselines.")).toBeVisible();
      await expect(page.getByLabel("Coach note")).toContainText("No weigh-in this morning");
      await page.goto("/plan/goals");
      await expect(page.getByText("No bench sets in the 6–12 range yet")).toBeVisible();
      await page.goto("/train/measure");
      const tape = page.getByRole("table").first();
      await expect(tape).toContainText("Mon 7 Sep");
      await expect(tape).toContainText("30.5");
      await expect(tape).toContainText("91.4");
      await page.goto("/calendar");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("September");
    });

    test("yesterday's missing totals can be back-filled", async ({ page }) => {
      await page.goto("/tonight");
      await page.getByRole("link", { name: /Wed 16 Sep · missing/ }).click();
      await expect(page).toHaveURL(/date=2026-09-16/);
      await page.getByLabel("Calories").fill("2650");
      await page.getByLabel("Protein").fill("121");
      await page.getByLabel("Carbs").fill("383");
      await page.getByLabel("Fat").fill("71");
      await page.getByRole("button", { name: "Save totals" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText("On target");
      await page.goto("/tonight");
      await expect(page.getByRole("link", { name: "Wed 16 Sep", exact: true })).toBeVisible();
    });

    test("a session from before the app was in use can still be logged", async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto("/train/history");
      const past = page.getByRole("region", { name: "Log a past day" });
      await expect(past.getByLabel("Day", { exact: true })).toHaveValue("2026-09-16");
      await past.getByLabel("Day", { exact: true }).fill("2026-08-01");
      await expect(past.getByText("Pick a day in the last 30 days.")).toBeVisible();
      await expect(past.getByRole("link")).toHaveCount(0);

      // Monday 14 September has no coach run: the page shows that day's plan.
      await past.getByLabel("Day", { exact: true }).fill("2026-09-14");
      await past.getByRole("link", { name: "Session" }).click();
      await expect(page).toHaveURL(/\/train\/history\/2026-09-14$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Push A");
      await expect(page.getByText("0 of 14 sets logged")).toBeVisible();
      const bench = page.locator('section[data-slot="1"]');
      await bench.getByRole("button", { name: /^Set 1:/ }).click();
      await bench.getByLabel("Weight in kilograms").fill("32.5");
      await bench.getByLabel("Reps", { exact: true }).fill("6");
      await bench.getByRole("button", { name: "Log set" }).click();
      await expect(page.getByText("1 of 14 sets logged")).toBeVisible();

      await page.goto("/train/history");
      await expect(page.getByRole("link", { name: /Mon 14 Sep\s*Push A · 1 set · 1 lift · ramp-in · open/ })).toBeVisible();
      // Ramp-in sets are kept but never judged: no change and no best.
      await page.goto("/coach");
      await expect(page.getByText("No changes yet. The first ones arrive with the week-3 baselines.")).toBeVisible();
      expect(errors).toEqual([]);
    });

    test.describe.serial("account", () => {
      test("change password, then only the new one works", async ({ page, browser }) => {
        // A second signed-in device.
        const other = await browser.newContext();
        const otherPage = await other.newPage();
        await login(otherPage);

        await page.goto("/settings");
        const form = page.getByRole("form", { name: "Change password" });
        await form.getByLabel("Current password").fill("wrong-one");
        await form.getByLabel("New password").fill("a-much-longer-pass-7");
        await form.getByLabel("Again").fill("a-much-longer-pass-7");
        await form.getByRole("button", { name: "Change password" }).click();
        await expect(formError(page)).toHaveText("Current password is wrong.");

        await form.getByLabel("Current password").fill(DEMO.password);
        await form.getByLabel("Again").fill("something-else-99");
        await form.getByRole("button", { name: "Change password" }).click();
        await expect(formError(page)).toHaveText("The new passwords don't match.");

        await form.getByLabel("Again").fill("a-much-longer-pass-7");
        await form.getByRole("button", { name: "Change password" }).click();
        await expect(page).toHaveURL(/\/settings\?saved=password$/);
        await expect(page.getByText("Password changed. Other devices are signed out.")).toBeVisible();

        // The other device is signed out.
        await otherPage.goto("/");
        await expect(otherPage).toHaveURL(/\/login/);
        await other.close();

        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(page).toHaveURL(/\/login$/);
        await page.getByLabel("Email").fill(DEMO.email);
        await page.getByLabel("Password").fill(DEMO.password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await expect(formError(page)).toBeVisible();
        await page.getByLabel("Password").fill("a-much-longer-pass-7");
        await page.getByRole("button", { name: "Sign in" }).click();
        await expect(page).toHaveURL(/\/$/);

        // Put the old password back for any later run against this server.
        await page.goto("/settings");
        const again = page.getByRole("form", { name: "Change password" });
        await again.getByLabel("Current password").fill("a-much-longer-pass-7");
        await again.getByLabel("New password").fill(DEMO.password);
        await again.getByLabel("Again").fill(DEMO.password);
        await again.getByRole("button", { name: "Change password" }).click();
        await expect(page).toHaveURL(/saved=password/);
      });

      test("sign out everywhere ends every session", async ({ page }) => {
        await page.goto("/settings");
        await page.getByRole("button", { name: "Sign out everywhere" }).click();
        await expect(page).toHaveURL(/\/login$/);
        await page.goto("/");
        await expect(page).toHaveURL(/\/login$/);
      });
    });
  });
});
