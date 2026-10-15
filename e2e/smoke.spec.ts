import { expect, test, type Page } from '@playwright/test';

const roles = [
  { name: 'Vikram Malhotra', role: 'Project Manager', project: 'Apex Heights' },
  { name: 'Rahul Sharma', role: 'Site Engineer', project: 'Apex Heights' },
  { name: 'Ananya Iyer', role: 'Auditor', project: 'Apex Heights' },
];

async function signIn(page: Page, accountName: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(accountName) }).click();
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/(projects|dashboard)/);
}

async function openProject(page: Page, projectName: string) {
  await page.goto('/projects');
  await page.getByRole('link', { name: new RegExp(projectName) }).first().click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  return new URL(page.url()).pathname.split('/')[2];
}

test.describe('role login and read access', () => {
  for (const account of roles) {
    test(`signs in as ${account.role}`, async ({ page }) => {
      await signIn(page, account.name);
      await expect(page.getByRole('main')).toBeVisible();
    });
  }

  test('auditor can view consumption but cannot create or edit', async ({ page }) => {
    await signIn(page, 'Ananya Iyer');
    const projectId = await openProject(page, 'Apex Heights');
    await page.goto(`/projects/${projectId}/consumption`);
    await expect(page.getByRole('heading', { name: 'Water consumption' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add consumption' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  });
});

test('project manager adds a supply delivery', async ({ page }) => {
  await signIn(page, 'Vikram Malhotra');
  const projectId = await openProject(page, 'Apex Heights');
  await page.goto(`/projects/${projectId}/supplies`);
  await page.getByRole('button', { name: 'Log supply' }).click();
  await page.getByLabel('Delivered volume').fill('12.5');
  await page.getByLabel('Supplier').fill(`Playwright tanker ${Date.now()}`);
  await page.getByRole('button', { name: 'Save delivery' }).click();
  await expect(page.getByText('Supply delivery recorded.')).toBeVisible();
});

for (const method of [
  { label: 'Flow meter', fields: [['Flow rate', '5'], ['Time', '60']] },
  { label: 'Pipe', fields: [['Pipe diameter', '2'], ['Run time', '60']] },
  { label: 'Direct entry', fields: [['Volume', '1000']] },
]) {
  test(`project manager records consumption using ${method.label}`, async ({ page }) => {
    await signIn(page, 'Vikram Malhotra');
    const projectId = await openProject(page, 'Apex Heights');
    await page.goto(`/projects/${projectId}/consumption`);
    await page.getByRole('button', { name: 'Add consumption' }).click();
    await page.getByRole('button', { name: new RegExp(method.label) }).click();
    for (const [label, value] of method.fields) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Consumption saved.')).toBeVisible();
  });
}

test('dashboard remains within common mobile and desktop viewports in light and dark themes', async ({ page }) => {
  await signIn(page, 'Vikram Malhotra');
  await page.goto('/dashboard');

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByText('Project Water Telemetry', { exact: true })).toBeVisible();
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalOverflow, `${colorScheme} mode at ${width}px overflows horizontally`).toBe(false);
    }
  }
});
