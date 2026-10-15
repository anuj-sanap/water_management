# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> project manager records consumption using Pipe
- Location: e2e\smoke.spec.ts:57:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/(projects|dashboard)/
Received string:  "http://localhost:3000/login"
Timeout: 20000ms

Call log:
  - Expect "toHaveURL" with timeout 20000ms
    33 × locator resolved to <html lang="en" class="geist_a71539c9-module__T19VSG__variable geist_mono_8d43a2aa-module__8Li5zG__variable h-full antialiased">…</html>
       - unexpected value "http://localhost:3000/login"

```

```yaml
- text: HydroTrack Platform
- heading "Construction Site Water Accounting & Auditing" [level=1]
- paragraph: Eliminate unmetered waste, detect pipeline anomalies, and maintain tamper-proof compliance across civil engineering phases.
- heading "Calculation Engine" [level=3]
- paragraph: Accurate flow meters, pipe diameter velocity models, and batch tank volumes.
- heading "Balance & Anomalies" [level=3]
- paragraph: Detect daily deficit drawdowns and high-consumption raft pour spikes automatically.
- heading "48-Hour Log Window" [level=3]
- paragraph: Site engineers log entries with strict 48-hour edit window for data integrity.
- heading "Auditor Read-Only Mode" [level=3]
- paragraph: Independent audit trail and water balance exports with zero tamper risk.
- text: "SYSTEM: v1.0.0 ACTIVE DATABASE: POSTGRES-COMPATIBLE SQLITE"
- heading "Sign In" [level=2]
- paragraph: Enter your workplace credentials to access site water telemetry and balances.
- text: Email Address
- textbox "Email Address":
  - /placeholder: e.g. pm.vikram@watermgmt.io
  - text: pm.vikram@watermgmt.io
- text: Password
- textbox "Password":
  - /placeholder: ••••••••••••
  - text: Password@123
- button "Show password"
- button "Signing in..." [disabled]
- text: Demo Accounts (1-Click Fill) Dev Only
- paragraph: "Click any demo profile to instantly populate credentials and test role-based views:"
- button "Vikram Malhotra Project Manager Full administrative access across all projects, users & thresholds Use"
- button "Rahul Sharma Site Engineer 1 Apex Heights (Gurgaon) — supply/consumption logging within 48h Use"
- button "Priya Patel Site Engineer 2 Green Valley (Bengaluru) — supply/consumption logging within 48h Use"
- button "Ananya Iyer Auditor Read-only audit across all projects, balances & audit logs Use"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | 
  3  | const roles = [
  4  |   { name: 'Vikram Malhotra', role: 'Project Manager', project: 'Apex Heights' },
  5  |   { name: 'Rahul Sharma', role: 'Site Engineer', project: 'Apex Heights' },
  6  |   { name: 'Ananya Iyer', role: 'Auditor', project: 'Apex Heights' },
  7  | ];
  8  | 
  9  | async function signIn(page: Page, accountName: string) {
  10 |   await page.goto('/login');
  11 |   await page.getByRole('button', { name: new RegExp(accountName) }).click();
  12 |   await page.getByRole('button', { name: 'Sign In' }).click();
> 13 |   await expect(page).toHaveURL(/\/(projects|dashboard)/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  14 | }
  15 | 
  16 | async function openProject(page: Page, projectName: string) {
  17 |   await page.goto('/projects');
  18 |   await page.getByRole('link', { name: new RegExp(projectName) }).first().click();
  19 |   await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  20 |   return new URL(page.url()).pathname.split('/')[2];
  21 | }
  22 | 
  23 | test.describe('role login and read access', () => {
  24 |   for (const account of roles) {
  25 |     test(`signs in as ${account.role}`, async ({ page }) => {
  26 |       await signIn(page, account.name);
  27 |       await expect(page.getByRole('main')).toBeVisible();
  28 |     });
  29 |   }
  30 | 
  31 |   test('auditor can view consumption but cannot create or edit', async ({ page }) => {
  32 |     await signIn(page, 'Ananya Iyer');
  33 |     const projectId = await openProject(page, 'Apex Heights');
  34 |     await page.goto(`/projects/${projectId}/consumption`);
  35 |     await expect(page.getByRole('heading', { name: 'Water consumption' })).toBeVisible();
  36 |     await expect(page.getByRole('button', { name: 'Add consumption' })).toHaveCount(0);
  37 |     await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  38 |   });
  39 | });
  40 | 
  41 | test('project manager adds a supply delivery', async ({ page }) => {
  42 |   await signIn(page, 'Vikram Malhotra');
  43 |   const projectId = await openProject(page, 'Apex Heights');
  44 |   await page.goto(`/projects/${projectId}/supplies`);
  45 |   await page.getByRole('button', { name: 'Log supply' }).click();
  46 |   await page.getByLabel('Delivered volume').fill('12.5');
  47 |   await page.getByLabel('Supplier').fill(`Playwright tanker ${Date.now()}`);
  48 |   await page.getByRole('button', { name: 'Save delivery' }).click();
  49 |   await expect(page.getByText('Supply delivery recorded.')).toBeVisible();
  50 | });
  51 | 
  52 | for (const method of [
  53 |   { label: 'Flow meter', fields: [['Flow rate', '5'], ['Time', '60']] },
  54 |   { label: 'Pipe', fields: [['Pipe diameter', '2'], ['Run time', '60']] },
  55 |   { label: 'Direct entry', fields: [['Volume', '1000']] },
  56 | ]) {
  57 |   test(`project manager records consumption using ${method.label}`, async ({ page }) => {
  58 |     await signIn(page, 'Vikram Malhotra');
  59 |     const projectId = await openProject(page, 'Apex Heights');
  60 |     await page.goto(`/projects/${projectId}/consumption`);
  61 |     await page.getByRole('button', { name: 'Add consumption' }).click();
  62 |     await page.getByRole('button', { name: new RegExp(method.label) }).click();
  63 |     for (const [label, value] of method.fields) {
  64 |       await page.getByLabel(label, { exact: true }).fill(value);
  65 |     }
  66 |     await page.getByRole('button', { name: /^Save$/ }).click();
  67 |     await expect(page.getByText('Consumption saved.')).toBeVisible();
  68 |   });
  69 | }
  70 | 
  71 | test('dashboard remains within common mobile and desktop viewports in light and dark themes', async ({ page }) => {
  72 |   await signIn(page, 'Vikram Malhotra');
  73 |   await page.goto('/dashboard');
  74 | 
  75 |   for (const colorScheme of ['light', 'dark'] as const) {
  76 |     await page.emulateMedia({ colorScheme });
  77 |     for (const width of [375, 768, 1440]) {
  78 |       await page.setViewportSize({ width, height: 900 });
  79 |       await expect(page.getByText('Project Water Telemetry', { exact: true })).toBeVisible();
  80 |       const hasHorizontalOverflow = await page.evaluate(
  81 |         () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  82 |       );
  83 |       expect(hasHorizontalOverflow, `${colorScheme} mode at ${width}px overflows horizontally`).toBe(false);
  84 |     }
  85 |   }
  86 | });
  87 | 
```