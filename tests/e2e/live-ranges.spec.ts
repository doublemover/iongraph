import { expect, test } from "@playwright/test";

test("live ranges mode highlights vreg intervals", async ({ page }) => {
  await page.goto("/?file=/fixtures/live-ranges.json");

  await page.locator('[data-ig-display="live-ranges-mode"]').check();
  await page.locator('.ig-vreg[data-ig-vreg="v1"]').first().click();

  await expect(page.locator('.ig-ins[data-ig-ins-id="1"]')).toHaveClass(/ig-live-range/);
  await expect(page.locator('.ig-ins[data-ig-ins-id="2"]')).toHaveClass(/ig-live-range/);
  await expect(page.locator('.ig-ins[data-ig-ins-id="3"]')).not.toHaveClass(/ig-live-range/);
});
