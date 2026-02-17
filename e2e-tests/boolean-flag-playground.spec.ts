import { expect, test, type Locator } from '@playwright/test';

async function getEvaluationResult(playgroundDrawer: Locator): Promise<{ value: string; variant: string }> {
  const valueLine = await playgroundDrawer.locator('p:has(strong:has-text("Value:"))').first().textContent();
  const variantLine = await playgroundDrawer.locator('p:has(strong:has-text("Variant:"))').first().textContent();

  const value = (valueLine ?? '').replace(/\s+/g, ' ').replace('Value:', '').trim().toLowerCase();
  const variant = (variantLine ?? '').replace(/\s+/g, ' ').replace('Variant:', '').trim();

  if (!value || !variant) {
    throw new Error(`Could not parse evaluation result. value="${value}", variant="${variant}"`);
  }

  return { value, variant };
}

test('creates file and boolean flag, evaluates in playground, then switches value', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);

  const uniqueId = Date.now();
  const fileName = `playground-${testInfo.project.name}-${uniqueId}`;
  const flagKey = `feature-${uniqueId}`;

  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Create flags-file' }).click();
    const createFileDialog = page.getByRole('dialog', { name: 'Add Flag File' });
    const fileNameInput = createFileDialog.getByLabel('File name');
    await fileNameInput.fill(fileName);
    await expect(fileNameInput).toHaveValue(fileName);
    const createFileButton = createFileDialog.getByRole('button', { name: 'Create' });
    await expect(createFileButton).toBeEnabled();
    await createFileButton.click();

    await expect(page).toHaveURL(new RegExp(`/local/browser/${fileName}$`));
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
    const firstResult = await getEvaluationResult(playgroundDrawer);

    await page.getByRole('cell', { name: flagKey }).click();
    const editPanel = page.locator('aside.side-panel').first();

    await expect(editPanel.getByRole('heading', { name: 'Edit Flag' })).toBeVisible();
    const globalSwitch = editPanel.locator('.default-value-section').getByRole('switch').first();
    const wasChecked = (await globalSwitch.getAttribute('aria-checked')) === 'true';
    await globalSwitch.click();
    await expect(globalSwitch).toHaveAttribute('aria-checked', wasChecked ? 'false' : 'true');
    await editPanel.getByRole('button', { name: 'Save Changes' }).click();

    await playgroundDrawer.getByRole('button', { name: 'Evaluate' }).click();
    const secondResult = await getEvaluationResult(playgroundDrawer);

    expect(secondResult.value).not.toBe(firstResult.value);
  } finally {
    await request.delete(`/api/flags/${encodeURIComponent(fileName)}`).catch(() => undefined);
  }
});
