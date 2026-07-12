import { expect, test } from "@playwright/test";

async function createFlagsFile(
  page: import("@playwright/test").Page,
  fileName: string,
): Promise<void> {
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

test("captures docs screenshots for key workflows", async ({ page }) => {
  const mappedFlagsFile = {
    flags: {
      "disk-mapped-flag": {
        state: "ENABLED",
        variants: { on: true, off: false },
        defaultVariant: "on",
      },
    },
  };

  await page.addInitScript(
    (payload) => {
      const mappedContent = JSON.stringify(payload.content, null, 2);

      (
        window as Window & {
          showOpenFilePicker?: (options?: unknown) => Promise<unknown[]>;
        }
      ).showOpenFilePicker = async () => {
        const handle = {
          getFile: async () =>
            new File([mappedContent], payload.fileName, {
              type: "application/json",
            }),
          createWritable: async () => ({
            write: async () => undefined,
            close: async () => undefined,
          }),
        };

        return [handle];
      };
    },
    {
      fileName: "customer-journey-overrides.flagd.json",
      content: mappedFlagsFile,
    },
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  const createdFileName = "release-showcase-flags";
  await createFlagsFile(page, createdFileName);
  await expect(
    page.getByRole("heading", { name: createdFileName }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create flags-file" }).click();
  const mapLocalDialog = page.getByRole("dialog", { name: "Add Flag File" });
  await mapLocalDialog.getByRole("tab", { name: "From Disk" }).click();
  await mapLocalDialog.getByRole("button", { name: "Open" }).click();
  await expect(
    page.locator(".sidebar").getByRole("link", {
      name: /customer-journey-overrides(\.flagd\.json)?/i,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: createdFileName }).click();
  await expect(
    page.getByRole("heading", { name: createdFileName }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create your first flag" }).click();
  const createPanel = page.locator("aside.side-panel").first();
  await createPanel.getByLabel("Flag Key").fill("docs-example-flag");
  await expect(
    page.getByRole("cell", { name: "docs-example-flag" }),
  ).toBeVisible();

  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("heading", { name: "Edit Flag" })).toBeVisible();

  await page.screenshot({ path: "./docs/assets/images/ui-editing-flag.png" });

  const drawerToggle = page.getByLabel("Toggle playground drawer");
  await expect(drawerToggle).toBeVisible({ timeout: 15000 });
  await drawerToggle.click();
  await expect(page.locator(".playground-drawer.open")).toBeVisible();
  await page.evaluate(() => {
    const drawer = document.querySelector<HTMLElement>(
      ".playground-drawer.open",
    );
    if (!drawer) {
      return;
    }

    const minDrawerHeight = Math.floor(window.innerHeight / 2);
    drawer.style.height = `${minDrawerHeight}px`;
  });

  await page.getByRole("button", { name: "Evaluate" }).click();
  await expect(page.getByText(/Value:\s*/)).toBeVisible();

  await page.screenshot({
    path: "./docs/assets/images/ui-playground-open.png",
  });

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Flags-File Metadata" }),
  ).toBeVisible();

  await page.screenshot({
    path: "./docs/assets/images/ui-flags-file-settings.png",
  });
});
