import { expect, test } from "@playwright/test";
import { expectAccessible, login, openDetails, watchErrors } from "./helpers";

const TOKEN = "e2e-ai-coach-token-0123456789abcdef";
const auth = { authorization: `Bearer ${TOKEN}` };

// Thu 29 Oct 07:42 IST. Runs after the other morning specs (it changes the card).
test.describe("the AI coach", () => {
  test("its API is locked to its own token", async ({ request }) => {
    expect((await request.get("/api/ai/context")).status()).toBe(401);
    expect((await request.get("/api/ai/context", { headers: { authorization: "Bearer wrong-token-wrong-token-wrong-token" } })).status()).toBe(401);
    expect((await request.post("/api/ai/act", { data: {} })).status()).toBe(401);
    const bad = await request.post("/api/ai/act", { headers: auth, data: { date: "2026-10-29", kind: "daily" } });
    expect(bad.status()).toBe(400);
  });

  test("reads the context, acts, and he sees the note and approves a proposal", async ({ page, request }) => {
    const errors = watchErrors(page);
    const ctx = await (await request.get("/api/ai/context", { headers: auth })).json();
    expect(ctx.today).toBe("2026-10-29");
    expect(ctx.suggestedKind).toBe("daily");
    const bench = ctx.states.bench_volume;
    expect(bench.status).toBe("active");

    const res = await request.post("/api/ai/act", {
      headers: auth,
      data: {
        date: "2026-10-29",
        kind: "daily",
        note: "Bench volume drops a little tonight: your last two sessions ran short on sleep.",
        notebook: "29 Oct: bench_volume deload 5%, recheck Mon.",
        model: "e2e",
        changes: [
          { type: "load", track: "bench_volume", weight: bench.weight - 2.5, reason: "Short sleep before the last two sessions" },
          // 150*4 + 500*4 + 80*9 = 3320 kcal: far more than 250 above a week ago, so it waits for him.
          { type: "targets", kcal: 3320, protein: 150, carbs: 500, fat: 80, reason: "Test proposal" },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const out = await res.json();
    expect(out.applied).toHaveLength(1);
    expect(out.rejected).toEqual([]);
    expect(out.proposed).toHaveLength(1);

    await login(page);
    await expect(page.getByLabel("AI coach note")).toContainText("Bench volume drops a little tonight");
    await expect(page.getByLabel("AI coach note")).toContainText("1 to approve");
    await expectAccessible(page);

    await page.getByRole("link", { name: "Review proposals →" }).click();
    await expect(page).toHaveURL(/\/coach#ai$/);
    const waiting = page.getByLabel("Waiting for you");
    await expect(waiting).toContainText("Needs you:");
    await expectAccessible(page);
    await waiting.getByRole("button", { name: /^Reject: Targets/ }).click();
    await expect(page.getByRole("status")).toHaveText("Rejected. The AI coach sees your decision on its next run.");
    await expect(page.getByLabel("Waiting for you")).toContainText("Nothing to approve.");
    await openDetails(page, "AI coach notebook and past notes");
    await expect(page.getByText("29 Oct: bench_volume deload 5%, recheck Mon.")).toBeVisible();
    await expect(page.getByLabel("Changelog")).toContainText("AI coach: Short sleep before the last two sessions");
    expect(errors).toEqual([]);
  });
});
