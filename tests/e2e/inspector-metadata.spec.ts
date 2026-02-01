import { expect, test } from "@playwright/test";

test("inspector renders metadata with raw JSON fallback", async ({ page }) => {
  await page.goto("/?file=/fixtures/metadata.json");

  await page.locator('.ig-ins[data-ig-ins-id="2"]').click();
  await expect(page.locator(".ig-inspector-raw")).toContainText("resumePoint");
});
