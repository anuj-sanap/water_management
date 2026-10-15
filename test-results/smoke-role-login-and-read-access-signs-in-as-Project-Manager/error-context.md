# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> role login and read access >> signs in as Project Manager
- Location: e2e\smoke.spec.ts:25:9

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.goto: Test timeout of 120000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/login", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: HydroTrack Platform
        - heading "Construction Site Water Accounting & Auditing" [level=1] [ref=e10]
        - paragraph [ref=e11]: Eliminate unmetered waste, detect pipeline anomalies, and maintain tamper-proof compliance across civil engineering phases.
      - generic [ref=e12]:
        - generic [ref=e13]:
          - heading "Calculation Engine" [level=3] [ref=e18]
          - paragraph [ref=e19]: Accurate flow meters, pipe diameter velocity models, and batch tank volumes.
        - generic [ref=e20]:
          - heading "Balance & Anomalies" [level=3] [ref=e24]
          - paragraph [ref=e25]: Detect daily deficit drawdowns and high-consumption raft pour spikes automatically.
        - generic [ref=e26]:
          - heading "48-Hour Log Window" [level=3] [ref=e31]
          - paragraph [ref=e32]: Site engineers log entries with strict 48-hour edit window for data integrity.
        - generic [ref=e33]:
          - heading "Auditor Read-Only Mode" [level=3] [ref=e39]
          - paragraph [ref=e40]: Independent audit trail and water balance exports with zero tamper risk.
      - generic [ref=e41]:
        - generic [ref=e42]: "SYSTEM: v1.0.0 ACTIVE"
        - generic [ref=e43]: "DATABASE: POSTGRES-COMPATIBLE SQLITE"
    - generic [ref=e46]:
      - generic [ref=e47]:
        - heading "Sign In" [level=2] [ref=e48]
        - paragraph [ref=e49]: Enter your workplace credentials to access site water telemetry and balances.
      - generic [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]: Email Address
          - textbox "Email Address" [ref=e54]:
            - /placeholder: e.g. pm.vikram@watermgmt.io
        - generic [ref=e55]:
          - generic [ref=e56]: Password
          - generic [ref=e57]:
            - textbox "Password" [ref=e58]:
              - /placeholder: ••••••••••••
            - button "Show password" [ref=e59]
        - button "Sign In" [ref=e63] [cursor=pointer]
      - generic [ref=e69]:
        - generic [ref=e70]:
          - generic [ref=e71]: Demo Accounts (1-Click Fill)
          - generic [ref=e76]: Dev Only
        - paragraph [ref=e77]: "Click any demo profile to instantly populate credentials and test role-based views:"
        - generic [ref=e78]:
          - button "Vikram Malhotra Project Manager Full administrative access across all projects, users & thresholds Use" [ref=e79]:
            - generic [ref=e84]:
              - generic [ref=e85]:
                - generic [ref=e86]: Vikram Malhotra
                - generic [ref=e87]: Project Manager
              - generic [ref=e88]: Full administrative access across all projects, users & thresholds
            - generic [ref=e89]: Use
          - button "Rahul Sharma Site Engineer 1 Apex Heights (Gurgaon) — supply/consumption logging within 48h Use" [ref=e90]:
            - generic [ref=e98]:
              - generic [ref=e99]:
                - generic [ref=e100]: Rahul Sharma
                - generic [ref=e101]: Site Engineer 1
              - generic [ref=e102]: Apex Heights (Gurgaon) — supply/consumption logging within 48h
            - generic [ref=e103]: Use
          - button "Priya Patel Site Engineer 2 Green Valley (Bengaluru) — supply/consumption logging within 48h Use" [ref=e104]:
            - generic [ref=e112]:
              - generic [ref=e113]:
                - generic [ref=e114]: Priya Patel
                - generic [ref=e115]: Site Engineer 2
              - generic [ref=e116]: Green Valley (Bengaluru) — supply/consumption logging within 48h
            - generic [ref=e117]: Use
          - button "Ananya Iyer Auditor Read-only audit across all projects, balances & audit logs Use" [ref=e118]:
            - generic [ref=e125]:
              - generic [ref=e126]:
                - generic [ref=e127]: Ananya Iyer
                - generic [ref=e128]: Auditor
              - generic [ref=e129]: Read-only audit across all projects, balances & audit logs
            - generic [ref=e130]: Use
  - region "Notifications alt+T"
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
> 10 |   await page.goto('/login');
     |              ^ Error: page.goto: Test timeout of 120000ms exceeded.
  11 |   await page.getByRole('button', { name: new RegExp(accountName) }).click();
  12 |   await page.getByRole('button', { name: 'Sign In' }).click();
  13 |   await expect(page).toHaveURL(/\/(projects|dashboard)/);
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