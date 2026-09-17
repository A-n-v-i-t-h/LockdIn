import { expect, test } from "@playwright/test";
import { formError, login, openDetails, watchErrors } from "./helpers";

test.describe("plain modules", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("tasks: add with date, time and priority; complete; edit; delete", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/plan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan");
    await page.getByPlaceholder("Add a task").fill("Call the landlord");
    await openDetails(page, "Date, time, priority");
    await page.getByLabel("Due", { exact: true }).fill("2026-10-29");
    await page.getByLabel("Time", { exact: true }).fill("16:00");
    await page.getByLabel("Priority").selectOption("high");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added.")).toBeVisible();
    await expect(page.getByPlaceholder("Add a task")).toHaveValue("");

    const list = page.getByLabel("Today tasks");
    await expect(list.getByText("Call the landlord")).toBeVisible();
    await expect(list.getByText("Today · 4:00 PM").first()).toBeVisible();

    // An empty title is refused and nothing is lost.
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(list.getByText("Call the landlord")).toHaveCount(1);

    await list.getByRole("button", { name: "Mark “Call the landlord” done" }).click();
    await expect(list.getByText("Call the landlord")).toHaveCount(0);
    await page.getByRole("link", { name: /^Done/ }).click();
    await expect(page.getByLabel("Done tasks").getByText("Call the landlord")).toBeVisible();

    await page.getByRole("link", { name: "Edit “Call the landlord”" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Task");
    await page.getByLabel("Title").fill("Call the landlord about rent");
    await page.getByLabel("Due date").fill("2026-11-02");
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(page).toHaveURL(/\/plan$/);

    await page.goto("/plan?view=done");
    await page.getByRole("button", { name: "Mark “Call the landlord about rent” not done" }).click();
    await page.goto("/plan?view=upcoming");
    await expect(page.getByText("Call the landlord about rent")).toBeVisible();
    await expect(page.getByText("Mon 2 Nov")).toBeVisible();

    await page.getByRole("link", { name: "Edit “Call the landlord about rent”" }).click();
    await page.getByRole("button", { name: "Delete task" }).click();
    await expect(page).toHaveURL(/\/plan$/);
    await page.goto("/plan?view=upcoming");
    await expect(page.getByText("Call the landlord about rent")).toHaveCount(0);

    // A time without a date is refused with a message.
    await page.goto("/plan");
    await page.getByPlaceholder("Add a task").fill("Timed but undated");
    await openDetails(page, "Date, time, priority");
    await page.getByLabel("Due", { exact: true }).fill("");
    await page.getByLabel("Time", { exact: true }).fill("09:00");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(formError(page)).toHaveText("A time needs a date.");
    await expect(page.getByPlaceholder("Add a task")).toHaveValue("Timed but undated");
    expect(errors).toEqual([]);
  });

  test("habits: add, tick today and back-fill, streak from history, archive", async ({ page }) => {
    await page.goto("/plan");
    await openDetails(page, "New habit");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add habit" }) });
    await form.getByLabel("Habit").fill("Stretch 10 min");
    await form.getByRole("button", { name: "Add habit" }).click();
    await expect(page.getByText("Habit added.")).toBeVisible();

    const today = page.getByRole("button", { name: "Stretch 10 min, Thu 29 Oct: not done" });
    await today.click();
    await expect(page.getByRole("button", { name: "Stretch 10 min, Thu 29 Oct: done" })).toHaveAttribute("aria-pressed", "true");
    const habit = page.locator(".habit").filter({ hasText: "Stretch 10 min" });
    await expect(habit.getByText("1 day")).toBeVisible();

    // Back-fill yesterday: the streak counts real dated history.
    await page.getByRole("button", { name: "Stretch 10 min, Wed 28 Oct: not done" }).click();
    await expect(habit.getByText("2 days")).toBeVisible();
    await page.getByRole("button", { name: "Stretch 10 min, Wed 28 Oct: done" }).click();
    await expect(habit.getByText("1 day")).toBeVisible();

    await openDetails(habit, "Edit");
    await habit.getByRole("button", { name: "Archive habit" }).click();
    await expect(page.locator(".habit").filter({ hasText: "Stretch 10 min" })).toHaveCount(0);
  });

  test("goals: milestones move a manual goal; auto goals read the log; archive and restore", async ({ page }) => {
    await page.goto("/plan/goals");
    await expect(page.getByRole("heading", { name: "Bench 100 kg" })).toBeVisible();
    await expect(page.getByText(/Estimated max \d+\.\d of 100 kg/)).toBeVisible();
    await expect(page.getByText(/Average \d\d\.\d\d kg, started at 57.7/)).toBeVisible();

    await openDetails(page, "New goal");
    const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Add goal" }) });
    await create.getByLabel("Goal", { exact: true }).fill("Cook 10 new meals");
    await create.getByLabel("Deadline").fill("2026-12-15");
    await create.getByLabel("Milestones, one per line").fill("Dal\nPaneer bhurji\nChicken curry");
    await create.getByRole("button", { name: "Add goal" }).click();
    await expect(page.getByText("Goal added.")).toBeVisible();

    const card = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Cook 10 new meals" }) });
    await expect(card.getByText("0 of 3 milestones")).toBeVisible();
    await card.getByRole("button", { name: "Dal: not done" }).click();
    await expect(card.getByText("1 of 3 milestones")).toBeVisible();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    await card.getByLabel("New milestone for Cook 10 new meals").fill("Rajma");
    await card.getByRole("button", { name: "Add milestone to Cook 10 new meals" }).click();
    await expect(card.getByText("1 of 4 milestones")).toBeVisible();
    await card.getByRole("button", { name: "Delete milestone Rajma" }).click();
    await expect(card.getByText("1 of 3 milestones")).toBeVisible();

    await openDetails(card, "Edit or archive");
    await card.getByRole("button", { name: "Mark achieved" }).click();
    await expect(card.getByText("Achieved.")).toBeVisible();
    await openDetails(card, "Edit or archive");
    await card.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("heading", { name: "Cook 10 new meals" })).toHaveCount(0);
    await page.getByRole("link", { name: "Archived goals" }).click();
    const archived = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Cook 10 new meals" }) });
    await openDetails(archived, "Edit or archive");
    await archived.getByRole("button", { name: "Restore" }).click();
    await expect(page).toHaveURL(/\/plan\/goals$/);
    await expect(page.getByRole("link", { name: "Archived goals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cook 10 new meals" })).toBeVisible();

    await openDetails(page, "New goal");
    await create.getByLabel("Goal", { exact: true }).fill("Reach 62 kg");
    await create.getByRole("button", { name: "My logs" }).click();
    await create.getByLabel("Tracks").selectOption("bodyweight_avg");
    await create.getByLabel("Target").fill("62");
    await create.getByRole("button", { name: "Add goal" }).click();
    const auto = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Reach 62 kg" }) });
    await expect(auto.getByText("Updates from your weigh-ins.")).toBeVisible();
    await expect(auto.getByText("Auto")).toBeVisible();
  });

  test("calendar: commitments, task and goal deadlines, never gym sessions", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("October");
    const today = page.getByLabel("Items on Thu 29 Oct");
    await expect(today.getByText("Client call")).toBeVisible();
    await expect(today.getByText("Pay electricity bill")).toBeVisible();
    await expect(today).not.toContainText("Push B");

    await page.getByRole("link", { name: /^Fri 30 Oct/ }).click();
    await expect(page).toHaveURL(/d=2026-10-30/);
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to calendar" }) });
    await form.getByLabel("What").fill("Physio");
    await expect(form.getByLabel("Date")).toHaveValue("2026-10-30");
    await form.getByLabel("Start").fill("11:00");
    await form.getByLabel("End").fill("10:30");
    await form.getByRole("button", { name: "Add to calendar" }).click();
    await expect(formError(page)).toHaveText("The end has to be after the start.");
    await form.getByLabel("End").fill("11:45");
    await form.getByLabel("Where").fill("Clinic");
    await form.getByRole("button", { name: "Add to calendar" }).click();
    await expect(page).toHaveURL(/m=2026-10&d=2026-10-30/);
    const day = page.getByLabel("Items on Fri 30 Oct");
    await expect(day.getByText("Physio")).toBeVisible();
    await expect(day.getByText("Commitment · Clinic")).toBeVisible();
    await expect(day.getByText("to 11:45 AM")).toBeVisible();
    await expect(page.getByRole("link", { name: "Fri 30 Oct, 1 item" })).toBeVisible();

    await day.getByRole("link", { name: "Edit Physio" }).click();
    // The add form has the same fields: wait for the edit form before typing.
    await expect(page).toHaveURL(/edit=/);
    await expect(page.getByRole("button", { name: "Save commitment" })).toBeVisible();
    await page.getByLabel("What").fill("Physio session");
    await page.getByRole("button", { name: "Save commitment" }).click();
    await expect(page.getByLabel("Items on Fri 30 Oct").getByText("Physio session")).toBeVisible();
    await page.getByLabel("Items on Fri 30 Oct").getByRole("button", { name: "Delete Physio session" }).click();
    await expect(page.getByLabel("Items on Fri 30 Oct").getByText("Physio session")).toHaveCount(0);

    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("November");
    await page.getByRole("link", { name: /^Mon 30 Nov/ }).click();
    await expect(page.getByLabel("Items on Mon 30 Nov").getByText("Launch LockdIn AI")).toBeVisible();
    await expect(page.getByLabel("Items on Mon 30 Nov").getByText("Goal deadline")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("journal: write with tags, search, filter, edit, delete", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByText("How was today, Anvith?")).toBeVisible();
    await page.getByRole("textbox", { name: "Entry", exact: true }).fill("Bench felt heavy but the bar moved fast.");
    await page.getByRole("button", { name: "Training", exact: true }).click();
    await page.getByRole("button", { name: "Mood", exact: true }).click();
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByText("Saved to your journal.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Entry", exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Training", exact: true })).toHaveAttribute("aria-pressed", "false");

    const entries = page.getByRole("region", { name: "Entries" });
    const mine = entries.locator("article").filter({ hasText: "Bench felt heavy" });
    await expect(mine).toContainText("Mood");

    await page.getByRole("searchbox", { name: "Search entries" }).fill("moved fast");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(entries.locator("article")).toHaveCount(1);

    await page.goto("/journal?q=100%25");
    await expect(page.getByText("No entries match.")).toBeVisible();

    await page.goto("/journal");
    await page.getByRole("navigation", { name: "Filter by tag" }).getByRole("link", { name: "Win" }).click();
    await expect(entries.locator("article")).toHaveCount(1);
    await expect(entries).toContainText("Pull-ups with weight added");

    await page.goto("/journal");
    await mine.getByRole("link", { name: /Edit entry/ }).click();
    await expect(page.getByText(/Editing ·/)).toBeVisible();
    await page.getByRole("textbox", { name: "Entry", exact: true }).fill("Bench felt heavy, bar still moved fast.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    const edited = page.getByRole("region", { name: "Entries" }).locator("article").filter({ hasText: "bar still moved fast" });
    await expect(edited).toHaveCount(1);
    await edited.getByRole("button", { name: /Delete entry/ }).click();
    await expect(page.getByRole("region", { name: "Entries" }).locator("article").filter({ hasText: "bar still moved fast" })).toHaveCount(0);
  });
});
