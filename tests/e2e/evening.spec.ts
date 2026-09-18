import { expect, test } from "@playwright/test";
import { formError, login, openDetails, watchErrors } from "./helpers";


test.describe("evening, Thursday 29 October 18:45", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("home leads with tonight's session and the food totals", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evening, Anvith");
    const order = await page.locator("main > .stack").evaluateAll((els) => els.map((e) => e.textContent?.slice(0, 60) ?? ""));
    expect(order[0]).toContain("Station 04");
    expect(order.join(" ")).toContain("Tonight · Cronometer totals");
  });

  test("logging a workout: one tap, deviations, edits, a swap, an extra lift, finish and reopen", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/train");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Push B");
    await expect(page.getByText("0 of 21 sets logged")).toBeVisible();

    const bench = page.locator('section[data-slot="1"]');
    await expect(bench.getByRole("heading")).toHaveText("Barbell Bench Press");
    await bench.getByRole("button", { name: "Done as planned" }).click();
    await expect(page.getByText("1 of 21 sets logged")).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss rest timer" }).click();

    await bench.getByRole("button", { name: "− rep" }).click();
    await expect(page.getByText("2 of 21 sets logged")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss rest timer" }).click();

    // Edit set 2 with the steppers.
    await bench.getByRole("button", { name: /^Set 2: logged/ }).click();
    const before = Number(await bench.getByLabel("Reps", { exact: true }).inputValue());
    await bench.getByRole("button", { name: "One rep more" }).click();
    await expect(bench.getByLabel("Reps", { exact: true })).toHaveValue(String(before + 1));
    await bench.getByRole("button", { name: "Log set" }).click();
    await expect(bench.getByRole("button", { name: new RegExp(`^Set 2: logged .* for ${before + 1} reps`) })).toBeVisible();
    await page.getByRole("button", { name: "Dismiss rest timer" }).click();

    // Remove set 2.
    await bench.getByRole("button", { name: /^Set 2: logged/ }).click();
    await bench.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("1 of 21 sets logged")).toBeVisible();

    // A bad number is refused in the editor.
    await bench.getByRole("button", { name: /^Set 3: enter weight/ }).click();
    await bench.getByLabel("Weight in kilograms").fill("900");
    await bench.getByRole("button", { name: "Log set" }).click();
    await expect(formError(page)).toHaveText("Weight must be 0–500 kg.");
    await bench.getByRole("button", { name: "Close editor" }).click();

    // Station taken: swap slot 2 to its substitute, which is logged as its own lift.
    const slot2 = page.locator('section[data-slot="2"]');
    await slot2.getByRole("button", { name: /Station taken\?/ }).click();
    await expect(slot2.getByRole("heading")).toHaveText("Incline Dumbbell Press");
    await expect(slot2).toContainText("Swapped in for Incline Smith Press");
    await slot2.getByRole("button", { name: /^Set 1:/ }).click();
    await slot2.getByLabel("Weight in kilograms").fill("15");
    await slot2.getByLabel("Reps", { exact: true }).fill("9");
    await slot2.getByRole("button", { name: "Log set" }).click();
    await expect(page.getByText("2 of 21 sets logged")).toBeVisible();
    await expect(slot2.getByRole("button", { name: /Back to Incline Smith Press/ })).toBeDisabled();

    // Everything survives a reload.
    await page.reload();
    await expect(page.getByText("2 of 21 sets logged")).toBeVisible();
    await expect(page.locator('section[data-slot="2"]').getByRole("heading")).toHaveText("Incline Dumbbell Press");

    // An extra exercise.
    await page.getByLabel("Add an exercise").selectOption({ label: "Face Pull" });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const extra = page.locator('section[data-slot="x1"]');
    await expect(extra.getByRole("heading")).toHaveText("Face Pull");
    await extra.getByRole("button", { name: /^Set 1:/ }).click();
    await extra.getByLabel("Weight in kilograms").fill("10");
    await extra.getByLabel("Reps", { exact: true }).fill("15");
    await extra.getByRole("button", { name: "Log set" }).click();
    await expect(page.getByText("3 of 21 sets logged")).toBeVisible();

    // Finish with a note.
    await page.getByLabel("Session note (optional)").fill("Felt good, elbows fine");
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/train\?saved=session$/);
    await expect(page.getByLabel("Session summary")).toContainText("Session logged");
    await expect(page.getByText("“Felt good, elbows fine”")).toBeVisible();
    await expect(page.getByLabel("Next time")).toContainText("Barbell Bench Press".split(" ").slice(-2).join(" "));

    // Home now shows the session as logged.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Session logged · 3 sets/ })).toBeVisible();

    // Reopen and it's editable again.
    await page.goto("/train");
    await page.getByRole("button", { name: "Edit this session" }).click();
    await expect(page.getByText("3 of 21 sets logged")).toBeVisible();

    // The day appears in history.
    await page.goto("/train/history");
    await page.getByRole("link", { name: /Thu 29 Oct/ }).first().click();
    await expect(page).toHaveURL(/\/train\/history\/2026-10-29$/);
    await expect(page.getByText("3 of 21 sets logged")).toBeVisible();
    await expect(page.getByText(/· still open/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("tonight's totals give plain feedback, including the meal line", async ({ page }) => {
    await page.goto("/tonight");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tonight");
    await page.getByLabel("Calories").fill("2400");
    await page.getByLabel("Protein").fill("96");
    await page.getByLabel("Carbs").fill("350");
    await page.getByLabel("Fat").fill("82");
    await openDetails(page, "Add a meal note or photo (optional)");
    await page.getByLabel("One line about a meal").fill("paneer tikka and 2 roti");
    await page.getByRole("button", { name: "Save totals" }).click();
    const fb = page.getByRole("status").filter({ hasText: "Saved · what it says" });
    await expect(fb).toContainText("Calories 2,400 of 2,750: 350 short");
    await expect(fb).toContainText("24 g short. One scoop of whey is 24 g.");
    await expect(fb).toContainText("Fat 82 of 70 g");
    await expect(fb).toContainText("Paneer");
    await expect(fb).toContainText("Roti");
    await expect(page.getByRole("button", { name: "Update totals" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Logged", { exact: true })).toBeVisible();
    await expect(page.locator(".st-grid").first()).toContainText("2,400");

    // Missing macros are refused.
    await page.goto("/tonight?date=2026-10-28");
    await page.getByLabel("Calories").fill("");
    await page.getByRole("button", { name: /totals/ }).click();
    expect(await page.getByLabel("Calories").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
  });

  test("the coach page: overrides are logged and undoable; replay and manual runs work", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/coach");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coach");
    await expect(page.getByLabel("Changelog")).toContainText(/\[P1\]/);

    const firstOverride = page.getByLabel("Changelog").locator("details").first();
    await openDetails(firstOverride, "Override");
    await firstOverride.getByLabel("Load from today (kg)").fill("20");
    await firstOverride.getByLabel("Why").fill("Testing the override");
    await firstOverride.getByRole("button", { name: "Save override" }).click();
    await expect(page).toHaveURL(/saved=override/);
    const overrides = page.getByLabel("Overrides");
    await expect(overrides).toContainText("→ 20 kg");
    await expect(overrides).toContainText("Testing the override");
    await expect(page.getByLabel("Changelog")).toContainText("[O1]");
    await expect(page.getByLabel("Coach note")).toContainText("You set it: Testing the override");

    await overrides.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Overrides")).toContainText("None. The coach's numbers stand.");

    // Calorie targets by hand must add up.
    await openDetails(page, "Set calorie targets by hand");
    const t = page.locator("form").filter({ has: page.getByRole("button", { name: "Save targets" }) });
    await t.getByLabel("Kcal").fill("3000");
    await t.getByRole("button", { name: "Save targets" }).click();
    await expect(formError(page)).toContainText("Make them match.");

    await page.getByRole("button", { name: "Run the replay test now" }).click();
    await expect(page).toHaveURL(/saved=replay/);
    await expect(page.getByLabel("Replay audit")).toContainText("No drift");

    await page.getByRole("button", { name: "Run coach now" }).click();
    await expect(page).toHaveURL(/saved=coach/);

    await page.getByRole("link", { name: "Rules v1" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rules");
    await expect(page.getByText("Double progression: every set at the top of the range → add one step")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("progress shows real data only", async ({ page }) => {
    await page.goto("/train/progress");
    await expect(page.getByRole("img", { name: /7-day average weight from 7 Sep/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Calories for the last 7 days/ })).toBeVisible();
    await expect(page.getByLabel("Bench", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Regain toward your December 2025 peaks")).toBeVisible();
    await expect(page.getByText(/\+25 g carbs/)).toBeVisible();
    await openDetails(page, "Weekly numbers");
    await expect(page.locator("table").first()).toContainText("kg");
  });

  test("measurements and progress photos stay private to the account", async ({ page, browser }) => {
    await page.goto("/train/measure");
    // A real PNG: a small screenshot of the page itself.
    const PNG = await page.screenshot({ clip: { x: 0, y: 0, width: 60, height: 80 } });
    await page.getByRole("textbox", { name: /^Waist \(cm\)/ }).fill("75.5");
    await page.getByRole("textbox", { name: /^Arm R \(cm\)/ }).fill("32");
    await openDetails(page, "Photos: front, side, back");
    await page.getByLabel("front", { exact: true }).setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(/front · \d+ KB/)).toBeVisible();
    await page.getByRole("button", { name: "Save measurements" }).click();
    await expect(page.getByText("Saved 2 measurements and 1 photo.")).toBeVisible();

    await page.reload();
    const img = page.getByRole("img", { name: /front photo, Thu 29 Oct/ });
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toMatch(/^\/api\/photos\/[0-9a-f-]{36}$/);
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/jpeg");
    expect(res.headers()["cache-control"]).toContain("private");

    // Another browser without the session can't read it.
    const stranger = await browser.newContext();
    const denied = await stranger.request.get(`${test.info().project.use.baseURL}${src}`);
    expect(denied.status()).toBe(401);
    await stranger.close();

    await page.getByRole("button", { name: /Delete front photo/ }).click();
    await expect(page.getByRole("img", { name: /front photo, Thu 29 Oct/ })).toHaveCount(0);
    await expect(page.getByRole("table").first()).toContainText("75.5");
  });

  test("settings: gym increments save and feed the card; data export works", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("needs confirming")).toBeVisible();
    const gym = page.locator("form").filter({ has: page.getByRole("button", { name: "Save gym" }) });
    await gym.locator('input[name="plates"][value="1.25"]').uncheck();
    await gym.getByLabel("Smallest plate checked (it sets every barbell jump)").check();
    await gym.getByRole("button", { name: "Save gym" }).click();
    await expect(page.getByText("Gym saved. Increments and plate diagrams now use it.")).toBeVisible();
    await page.reload();
    await expect(page.locator('input[name="plates"][value="1.25"]')).not.toBeChecked();

    // With 2.5 kg as the smallest plate a bench step is 5 kg.
    await page.goto("/train");
    await page.locator('section[data-slot="1"]').getByRole("button", { name: /^Set 1:/ }).click();
    await page.locator('section[data-slot="1"]').getByRole("button", { name: "More weight" }).click();
    await expect(page.locator('section[data-slot="1"]').getByText("Step 5 kg.")).toBeVisible();

    await page.goto("/settings");
    await page.locator('input[name="plates"][value="1.25"]').check();
    await page.getByRole("button", { name: "Save gym" }).click();
    await expect(page.getByText("Gym saved.", { exact: false })).toBeVisible();

    await page.getByLabel("Rest day in weeks 3–4 (five-day weeks)").selectOption("4");
    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(page).toHaveURL(/saved=settings/);
    await expect(page.getByLabel("Rest day in weeks 3–4 (five-day weeks)")).toHaveValue("4");

    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("lockdin-export-2026-10-29.json");
    const body = await res.json();
    expect(body.account.email).toBe("demo@lockdin.test");
    expect(body.data.weigh_ins.length).toBeGreaterThan(30);
    expect(body.data.set_logs.length).toBeGreaterThan(500);
    expect(JSON.stringify(body)).not.toContain("password_hash");
  });

  test("the morning cron endpoint needs its secret and is safe to repeat", async ({ request }) => {
    expect((await request.get("/api/cron/morning")).status()).toBe(401);
    expect((await request.get("/api/cron/morning", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/morning", { headers: { Authorization: "Bearer e2e-cron-secret-0123456789" } });
    expect(ok.status()).toBe(200);
    const first = await ok.json();
    expect(first.results).toHaveLength(1);
    expect(first.failures).toEqual([]);
    const again = await (await request.get("/api/cron/morning", { headers: { Authorization: "Bearer e2e-cron-secret-0123456789" } })).json();
    expect(again.results[0]).toMatchObject({ runDate: "2026-10-29", created: false });
  });
});
