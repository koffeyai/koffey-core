import { test, expect } from '@playwright/test';

const e2eEmail = process.env.E2E_USER_EMAIL;
const e2ePassword = process.env.E2E_USER_PASSWORD;

test.describe('Custom Skills UI', () => {
  test.skip(
    !e2eEmail || !e2ePassword,
    'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated custom-skill CRUD checks.',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(e2eEmail!);
    await page.getByLabel('Password').fill(e2ePassword!);
    await page.getByRole('button', { name: /^Sign In$/ }).click();
    await page.waitForURL('**/app**', { timeout: 60000 });
  });

  test('full CRUD: create, verify, toggle, delete custom skill', async ({ page }) => {
    // Navigate to Admin Dashboard view
    await page.goto('/app?view=admin-dashboard');
    await page.waitForLoadState('networkidle');

    // Click AI & LLM tab in the Admin Dashboard
    const aiTab = page.locator('[role="tab"]').filter({ hasText: /AI/ });
    await aiTab.click();

    // Click Custom Skills tab inside the LLM Control Panel
    const skillsTab = page.locator('[role="tab"]').filter({ hasText: 'Custom Skills' });
    await skillsTab.click();

    // Screenshot: empty state
    await page.screenshot({ path: 'e2e/screenshots/01-custom-skills-empty.png', fullPage: true });

    // Verify empty state or create button is visible
    const createBtn = page.locator('button').filter({ hasText: /Create.*Skill/ }).first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });

    // === CREATE ===
    await createBtn.click();

    // Fill the form
    await page.locator('#display_name').fill('Test Objection Handler');

    // Verify auto-slug
    const skillNameInput = page.locator('#skill_name');
    await expect(skillNameInput).toHaveValue('test_objection_handler');

    await page.locator('#description').fill('Use when the user asks about handling sales objections or customer pushback');
    await page.locator('#instructions').fill('## Objection Handling Playbook\n\n### Price Too High\n- Reframe as ROI discussion\n- Show 3-year TCO comparison\n\n### Already Have a Solution\n- Ask about pain points with current vendor\n- Offer free migration assessment');

    // Screenshot: filled form
    await page.screenshot({ path: 'e2e/screenshots/02-custom-skills-form-filled.png', fullPage: true });

    // Submit
    await page.locator('button').filter({ hasText: /^Create Skill$/ }).click();

    // === VERIFY LIST ===
    const skillTitle = page.getByRole('heading', { name: 'Test Objection Handler' });
    await expect(skillTitle).toBeVisible({ timeout: 5000 });

    const slugBadge = page.locator('text=custom_test_objection_handler');
    await expect(slugBadge).toBeVisible();

    // Screenshot: skill in list
    await page.screenshot({ path: 'e2e/screenshots/03-custom-skills-created.png', fullPage: true });

    // === TOGGLE INACTIVE ===
    const toggle = page.locator('button[role="switch"]').first();
    await toggle.click();

    const inactiveBadge = page.locator('text=Inactive');
    await expect(inactiveBadge).toBeVisible({ timeout: 3000 });

    // Screenshot: inactive state
    await page.screenshot({ path: 'e2e/screenshots/04-custom-skills-inactive.png', fullPage: true });

    // === DELETE ===
    // Click the trash button (has destructive text color)
    const trashBtn = page.locator('button').filter({ has: page.locator('.text-destructive') }).first();
    await trashBtn.click();

    // Confirm in alert dialog
    const confirmBtn = page.locator('[role="alertdialog"] button').filter({ hasText: 'Delete' });
    await confirmBtn.click();

    // Verify empty state returns
    const emptyState = page.locator('text=Create your first custom skill');
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    // Screenshot: back to empty
    await page.screenshot({ path: 'e2e/screenshots/05-custom-skills-deleted.png', fullPage: true });
  });
});
