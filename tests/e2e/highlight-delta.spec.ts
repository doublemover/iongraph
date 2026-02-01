import { expect, test } from "@playwright/test";

test("highlighting does not scan the full DOM", async ({ page }) => {
  await page.goto("/?file=/fixtures/highlight-many.json");

  await page.evaluate(() => {
    (window as any).__qsCount = 0;
    const original = Element.prototype.querySelectorAll;
    (window as any).__qsOriginal = original;
    Element.prototype.querySelectorAll = function (...args: any[]) {
      (window as any).__qsCount += 1;
      return original.apply(this, args as any);
    };
  });

  const firstRow = page.locator(".ig-ins-mir").first();
  await firstRow.locator(".ig-ins-num").click();
  await expect(firstRow).toHaveClass(/ig-highlight/);

  const qsCount = await page.evaluate(() => (window as any).__qsCount as number);
  expect(qsCount).toBeLessThanOrEqual(2);
});
