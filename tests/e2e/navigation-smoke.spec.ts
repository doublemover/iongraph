import { expect, test } from "@playwright/test";

test("clicking a block selects it", async ({ page }) => {
  await page.goto("/?file=/fixtures/basic.json");

  const block = page.locator(".ig-block").first();
  await block.locator(".ig-block-header").click();

  await expect(block).toHaveClass(/ig-selected/);
});
