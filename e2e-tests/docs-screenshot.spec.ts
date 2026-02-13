import { expect, test, type Page } from '@playwright/test';

type FlagFile = {
  flags: Record<string, unknown>;
};

async function mockFlagsApi(page: Page): Promise<void> {
  const projectNames: string[] = ['demo.flagd.json', 'test.flagd.json'];
  const projectData: Record<string, FlagFile> = {
    'demo.flagd.json': {
      flags: {
        'checkout-enabled': {
          state: 'ENABLED',
          variants: { on: true, off: false },
          defaultVariant: 'on',
        },
      },
    },
    'test.flagd.json': {
      flags: {},
    },
  };

  await page.route('**/api/flags**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === '/api/flags' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: projectNames }),
      });
      return;
    }

    if (pathname.startsWith('/api/flags/') && method === 'GET') {
      const name = decodeURIComponent(pathname.replace('/api/flags/', ''));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(projectData[name] ?? { flags: {} }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'Not found' });
  });
}

test('captures docs screenshot while editing a flag', async ({ page }) => {
  await mockFlagsApi(page);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');

  await page.getByRole('link', { name: 'demo.flagd.json' }).click();
  await expect(page.getByRole('heading', { name: 'demo.flagd.json' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Flag' })).toBeVisible();

  await page.getByLabel('Flag Key').fill('checkout-enabled-v2');

  await page.screenshot({ path: './docs/assets/images/ui-editing-flag.png', fullPage: true });
});
