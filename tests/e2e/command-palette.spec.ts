import { expect, test } from "@playwright/test";

test("command palette searches and jumps to blocks", async ({ page }) => {
  await page.goto("/?file=/fixtures/basic.json");

  await page.keyboard.press("/");
  await page.keyboard.type("Block 0");

  await expect(page.locator(".ig-command-result")).toHaveCount(1);
  await page.keyboard.press("Enter");

  await expect(page.locator(".ig-command-palette")).toBeHidden();
  await expect(page.locator(".ig-block[data-ig-block-id=\"0\"]")).toHaveClass(/ig-selected/);
});
