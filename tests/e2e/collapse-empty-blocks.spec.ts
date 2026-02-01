import { expect, test } from "@playwright/test";

test("collapses trivial empty blocks when enabled", async ({ page }) => {
  await page.goto("/?file=/fixtures/empty-block-chain.json&collapseEmptyBlocks=true");

  await expect(page.locator(".ig-block[data-ig-block-id=\"1\"]")).toHaveCount(0);
  const header = page.locator(".ig-block[data-ig-block-id=\"2\"] .ig-block-header");
  await expect(header).toContainText("collapsed: B1");
});
