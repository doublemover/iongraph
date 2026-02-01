import { expect, test } from "@playwright/test";

test("loads compact v2 ionjson fixtures", async ({ page }) => {
  await page.goto("/?file=/fixtures/basic-v2.json");

  await expect(page.locator(".ig-block")).toHaveCount(1);
  await expect(page.locator("text=An error occurred while laying out the graph")).toHaveCount(0);
});
