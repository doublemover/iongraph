import { expect, test } from "@playwright/test";

test("display toggles hide columns and use ids", async ({ page }) => {
  await page.goto("/?file=/fixtures/html-escape.json");

  await expect(page.locator(".ig-ins-num")).toHaveCount(2);
  await expect(page.locator(".ig-ins-type")).toHaveCount(2);
  await expect(page.locator(".ig-use-id")).toHaveCount(1);

  await page.locator('[data-ig-display="show-instruction-ids"]').uncheck();
  await expect(page.locator(".ig-ins-num")).toHaveCount(0);

  await page.locator('[data-ig-display="show-types"]').uncheck();
  await expect(page.locator(".ig-ins-type")).toHaveCount(0);

  await page.locator('[data-ig-display="show-use-ids"]').uncheck();
  await expect(page.locator(".ig-use-id")).toHaveCount(0);

  await page.selectOption('[data-ig-display="compact-mode"]', "compact");
  await expect(page.locator(".ig-graph")).toHaveClass(/ig-compact/);
});
