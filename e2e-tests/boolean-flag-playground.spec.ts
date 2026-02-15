import { expect, test } from '@playwright/test';

test('creates file and boolean flag, evaluates in playground, then switches value', async ({ page, request }) => {
  test.setTimeout(60_000);

  const uniqueId = Date.now();
  const fileName = `playground-${uniqueId}.flagd.json`;
  const flagKey = `feature-${uniqueId}`;

  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Create flags-file' }).click();
    await page.getByLabel('File name').fill(fileName);
    await page.getByRole('dialog', { name: 'Add Flag File' }).getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(new RegExp(`/flags-files/local/${fileName}$`));
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible();

    await page.getByRole('button', { name: 'Create your first flag' }).click();
    await expect(page.getByRole('heading', { name: 'Create Flag' })).toBeVisible();

    const createPanel = page.locator('aside.side-panel').first();
    await createPanel.getByLabel('Flag Key').fill(flagKey);
    await createPanel.getByRole('button', { name: 'Create Flag' }).click();

    await expect(page.getByRole('cell', { name: flagKey })).toBeVisible();

    const drawerToggle = page.getByLabel('Toggle playground drawer');
    await drawerToggle.click();

    const playgroundDrawer = page.locator('.playground-drawer.open');
    await expect(playgroundDrawer).toBeVisible();

    await playgroundDrawer.getByLabel('Flag').click();
    await page.getByRole('option', { name: flagKey }).click();

    await playgroundDrawer.getByRole('button', { name: 'Evaluate' }).click();
    await expect(playgroundDrawer.getByText(/Value:\s*true/)).toBeVisible();
    await expect(playgroundDrawer.getByText(/Variant:\s*on/)).toBeVisible();

    await page.getByRole('cell', { name: flagKey }).click();
    const editPanel = page.locator('aside.side-panel').first();

    await expect(editPanel.getByRole('heading', { name: 'Edit Flag' })).toBeVisible();
    const globalSwitch = editPanel.getByRole('switch').first();
    await expect(globalSwitch).toBeChecked();
    await globalSwitch.click();
    await expect(globalSwitch).not.toBeChecked();
    await editPanel.getByRole('button', { name: 'Save Changes' }).click();

    await playgroundDrawer.getByRole('button', { name: 'Evaluate' }).click();
    await expect(playgroundDrawer.getByText(/Value:\s*false/)).toBeVisible();
    await expect(playgroundDrawer.getByText(/Variant:\s*off/)).toBeVisible();
  } finally {
    await request.delete(`/api/flags/${encodeURIComponent(fileName)}`).catch(() => undefined);
  }
});
