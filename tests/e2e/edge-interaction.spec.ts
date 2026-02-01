import { expect, test } from "@playwright/test";

test("edges hover and click to navigate", async ({ page }) => {
  await page.goto("/?file=/fixtures/branch.json");

  const edge = page.locator(".ig-edge").first();
  const dstPtr = await edge.getAttribute("data-ig-edge-dst");
  expect(dstPtr).not.toBeNull();

  await edge.hover();
  await expect(edge).toHaveClass(/ig-edge-hover/);

  await edge.click();
  const dstBlock = page.locator(`.ig-block[data-ig-block-ptr="${dstPtr}"]`);
  await expect(dstBlock).toHaveClass(/ig-selected/);
});
