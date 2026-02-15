import { expect, test } from '@playwright/test';

test('captures docs screenshots for key workflows', async ({ page }) => {
  const mappedFlagsFile = {
    flags: {
      'disk-mapped-flag': {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'on',
      },
    },
  };

  await page.addInitScript((payload) => {
    const mappedContent = JSON.stringify(payload.content, null, 2);

    (window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<unknown[]> }).showOpenFilePicker =
      async () => {
        const handle = {
          getFile: async () =>
            new File([mappedContent], payload.fileName, {
              type: 'application/json',
            }),
          createWritable: async () => ({
            write: async () => undefined,
            close: async () => undefined,
          }),
        };

        return [handle];
      };
  }, {
    fileName: 'docs-mapped-local.flagd.json',
    content: mappedFlagsFile,
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const createdFileName = `docs-local-${Date.now()}`;
  await page.getByRole('button', { name: 'Create flags-file' }).click();
  const createFileDialog = page.getByRole('dialog', { name: 'Add Flag File' });
  await createFileDialog.getByLabel('File name').fill(createdFileName);
  await createFileDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: createdFileName })).toBeVisible();

  await page.getByRole('button', { name: 'Create flags-file' }).click();
  const mapLocalDialog = page.getByRole('dialog', { name: 'Add Flag File' });
  await mapLocalDialog.getByRole('tab', { name: 'From Disk' }).click();
  await mapLocalDialog.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('link', { name: 'docs-mapped-local' })).toBeVisible();

  await page.getByRole('link', { name: 'demo' }).click();
  await expect(page.getByRole('heading', { name: 'demo' })).toBeVisible();

  await page.getByRole('cell', { name: 'show-welcome-banner' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Flag' })).toBeVisible();

  await page.getByLabel('Flag Key').fill('show-welcome-banner-v2');

  await page.screenshot({ path: './docs/assets/images/ui-editing-flag.png' });

  await page.getByLabel('Toggle playground drawer').click();
  await expect(page.locator('.playground-drawer.open')).toBeVisible();

  await page.screenshot({ path: './docs/assets/images/ui-playground-open.png' });

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Flags-File Metadata' })).toBeVisible();

  await page.screenshot({ path: './docs/assets/images/ui-flags-file-settings.png' });
});
