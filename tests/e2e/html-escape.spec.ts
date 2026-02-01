import { expect, test } from "@playwright/test";

test("renders opcode text safely with uses intact", async ({ page }) => {
  await page.goto("/?file=/fixtures/html-escape.json");

  const opcodeCell = page.locator(".ig-ins-mir").first().locator("td").nth(1);
  await expect(opcodeCell).toContainText("<block in <foo>>");
  await expect(opcodeCell.locator(".ig-use[data-ig-use=\"2\"]")).toHaveCount(1);
  await expect(opcodeCell.locator("block")).toHaveCount(0);
});
