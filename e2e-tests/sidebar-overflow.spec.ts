import { expect, test } from '@playwright/test';

test('sidebar does not show overflow when content fits', async ({ page }) => {
  await page.route('**/api/flags**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === '/api/flags' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: ['demo.flagd.json'] }),
      });
      return;
    }

    if (pathname === '/api/flags/demo.flagd.json' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: {} }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.goto('/');

  const sidebarContainer = page.locator('.sidebar .mat-drawer-inner-container').first();
  await expect(sidebarContainer).toBeVisible();
  const createButton = page.getByRole('button', { name: /create flag file|new flag file/i });
  await expect(createButton).toBeVisible();

  const dimensions = await sidebarContainer.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));

  expect(dimensions.scrollHeight - dimensions.clientHeight).toBeLessThanOrEqual(1);

  const [sidebarBox, buttonBox] = await Promise.all([
    sidebarContainer.boundingBox(),
    createButton.boundingBox(),
  ]);

  expect(sidebarBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();

  if (sidebarBox && buttonBox) {
    const gapToBottom = sidebarBox.y + sidebarBox.height - (buttonBox.y + buttonBox.height);
    expect(gapToBottom).toBeLessThan(80);
  }
});
