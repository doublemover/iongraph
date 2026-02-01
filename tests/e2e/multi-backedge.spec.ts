import { expect, test } from "@playwright/test";

test("renders loop headers with multiple backedges", async ({ page }) => {
  await page.goto("/?file=/fixtures/multi-backedge.json");

  await expect(page.locator("text=An error occurred while laying out the graph")).toHaveCount(0);
  await expect(page.locator(".ig-block[data-ig-block-id=\"1\"]")).toHaveCount(1);
  await expect(page.locator(".ig-block[data-ig-block-id=\"2\"]")).toHaveCount(1);
  await expect(page.locator(".ig-block[data-ig-block-id=\"3\"]")).toHaveCount(1);
});
