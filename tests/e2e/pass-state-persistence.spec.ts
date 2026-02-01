import { expect, test } from "@playwright/test";

test("restores selection when returning to a pass", async ({ page }) => {
  await page.goto("/?file=/fixtures/pass-vanish.json");

  const blockSeven = page.locator(".ig-block[data-ig-block-id=\"7\"]");
  await blockSeven.locator(".ig-block-header").click();
  await expect(blockSeven).toHaveClass(/ig-selected/);

  await page.locator("text=PassB").click();
  await page.locator("text=PassA").click();

  await expect(blockSeven).toHaveClass(/ig-selected/);
});
