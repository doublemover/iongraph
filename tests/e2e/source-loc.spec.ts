import { expect, test } from "@playwright/test";

test("inspector shows source locations for blocks and instructions", async ({ page }) => {
  await page.goto("/?file=/fixtures/metadata.json");

  await page.locator(".ig-block-header").click();
  await expect(page.locator(".ig-inspector-body")).toContainText("foo.js");
  await expect(page.locator(".ig-inspector-body")).toContainText("12:3");

  await page.locator('.ig-ins[data-ig-ins-id="1"]').click();
  await expect(page.locator(".ig-inspector-body")).toContainText("12:5");
});
