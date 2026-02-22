import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('refresh endpoint requires auth', async ({ request }) => {
	const res = await request.post('/api/sessions/fake-session-id/refresh');
	expect(res.status()).toBe(401);
});
