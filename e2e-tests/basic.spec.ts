import { expect, test, type Page } from "@playwright/test";

async function gotoWithRetry(
  page: Page,
  url: string,
  attempts = 3,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  throw lastError;
}

async function createFlagsFile(page: Page, fileName: string): Promise<void> {
  await page.getByRole("button", { name: "Create flags-file" }).click();
  const createFileDialog = page.getByRole("dialog", { name: "Add Flag File" });

  await createFileDialog.getByRole("tab", { name: "Empty File" }).click();
  const fileNameInput = createFileDialog.getByLabel("File name");
  await fileNameInput.fill(fileName);
  await expect(fileNameInput).toHaveValue(fileName);

  const createButton = createFileDialog.getByRole("button", { name: "Create" });
  await expect(createButton).toBeEnabled();
  await createButton.click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
});

test("loads app shell and welcome page", async ({ page }) => {
  await gotoWithRetry(page, "/");

  await expect(page.getByRole("heading", { name: "flagd-ui" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feature Flag Manager" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create flags-file" }),
  ).toBeVisible();
});

test("navigates to a flags-file and renders flag data", async ({ page }) => {
  await gotoWithRetry(page, "/");

  const fileName = `basic-${Date.now()}`;

  await createFlagsFile(page, fileName);

  await expect(page.getByRole("heading", { name: fileName })).toBeVisible();

  await page.getByRole("button", { name: "Create your first flag" }).click();
  const createPanel = page.locator("aside.side-panel").first();
  await createPanel.getByLabel("Flag Key").fill("checkout-enabled");

  await expect(
    page.getByRole("cell", { name: "checkout-enabled" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "checkout-enabled" }),
  ).toBeVisible();
  await expect(page.getByTitle("ENABLED")).toBeVisible();
});

test("creates a flags-file from the sidebar form", async ({ page }) => {
  await gotoWithRetry(page, "/");

  await createFlagsFile(page, "new-project.flagd.json");

  await expect(page).toHaveURL(/\/local\/browser\/new-project.flagd.json$/);
  await expect(
    page.getByRole("heading", { name: "new-project.flagd.json" }),
  ).toBeVisible();
  await expect(page.getByText("No flags in this file yet.")).toBeVisible();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "new-project.flagd.json" }),
  ).toBeVisible();
});
