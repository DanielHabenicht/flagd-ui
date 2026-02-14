import { expect, test, type Page } from '@playwright/test';

type FlagFile = {
  flags: Record<string, unknown>;
};

async function mockFlagsApi(page: Page): Promise<void> {
  const flagsFileNames: string[] = ['demo.flagd.json', 'test.flagd.json'];
  const flagsFileData: Record<string, FlagFile> = {
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
        body: JSON.stringify({ files: flagsFileNames }),
      });
      return;
    }

    if (pathname === '/api/flags' && method === 'POST') {
      const payload = request.postDataJSON() as { name: string; flags?: Record<string, unknown> };
      if (!flagsFileNames.includes(payload.name)) {
        flagsFileNames.push(payload.name);
      }
      flagsFileData[payload.name] = { flags: payload.flags ?? {} };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(flagsFileData[payload.name]),
      });
      return;
    }

    if (pathname.startsWith('/api/flags/') && method === 'GET') {
      const name = decodeURIComponent(pathname.replace('/api/flags/', ''));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(flagsFileData[name] ?? { flags: {} }),
      });
      return;
    }

    if (pathname.startsWith('/api/flags/') && method === 'PUT') {
      const name = decodeURIComponent(pathname.replace('/api/flags/', ''));
      const payload = request.postDataJSON() as { flags?: Record<string, unknown> };
      flagsFileData[name] = { flags: payload.flags ?? {} };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(flagsFileData[name]),
      });
      return;
    }

    if (pathname.startsWith('/api/flags/') && method === 'DELETE') {
      const name = decodeURIComponent(pathname.replace('/api/flags/', ''));
      const idx = flagsFileNames.indexOf(name);
      if (idx >= 0) {
        flagsFileNames.splice(idx, 1);
      }
      delete flagsFileData[name];
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill({ status: 404, body: 'Not found' });
  });
}

test.beforeEach(async ({ page }) => {
  await mockFlagsApi(page);
});

test('loads app shell and welcome page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'flagd' })).toBeVisible();
  await expect(page.getByText('Local Files')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Feature Flag Manager' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'demo.flagd.json' })).toBeVisible();
});

test('navigates to a flags-file and renders flag data', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'demo.flagd.json' }).click();

  await expect(page.getByRole('heading', { name: 'demo.flagd.json' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'checkout-enabled' })).toBeVisible();
  await expect(page.locator('.state-badge', { hasText: 'ENABLED' })).toBeVisible();
});

test('creates a flags-file from the sidebar form', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Create flags-file' }).click();
  await page.getByLabel('File name').fill('new-project.flagd.json');
  await page.getByRole('button', { name: 'Create Local File' }).click();

  await expect(page).toHaveURL(/\/flags-files\/local\/new-project.flagd.json$/);
  await expect(page.getByRole('heading', { name: 'new-project.flagd.json' })).toBeVisible();
  await expect(page.getByText('No flags in this file yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'new-project.flagd.json' })).toBeVisible();
});
