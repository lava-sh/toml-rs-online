import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(violations).toEqual([]);
}

test("playground has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TOML" })).toBeVisible();
  await expectNoViolations(page);
});

test("theme menu exposes its modes and presets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Theme settings/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("menuitem", { name: /Reset to default themes/ })).toBeVisible();
  await expectNoViolations(page);
});
