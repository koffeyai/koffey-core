import { expect, type Page, test } from '@playwright/test';

async function expectNoBoundaryFailure(page: Page) {
  await expect(page.getByText('Component Error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Report Bug' })).toHaveCount(0);
}

test.describe('Public app shell', () => {
  test('login, signup, waitlist redirect, and protected app route render without boundary failures', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expectNoBoundaryFailure(page);

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Create your Koffey account/i })).toBeVisible();
    await expectNoBoundaryFailure(page);

    await page.goto('/waitlist');
    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expectNoBoundaryFailure(page);

    await page.goto('/app');
    await page.waitForURL(/\/auth|\/login|\/signup/);
    await expectNoBoundaryFailure(page);
  });
});
