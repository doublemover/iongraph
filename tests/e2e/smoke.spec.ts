import { expect, test } from "@playwright/test";

test("loads a basic graph fixture", async ({ page }) => {
  await page.goto("/?file=/fixtures/basic.json");

  await expect(page.locator(".ig-block")).toHaveCount(1);
  await expect(page.locator("text=An error occurred while laying out the graph")).toHaveCount(0);
});
