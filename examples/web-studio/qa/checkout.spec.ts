import { test, expect } from '@playwright/test';

/**
 * Integration: frontend cart -> /api/checkout (Vercel Function) -> Stripe Checkout (test mode)
 * -> webhook -> order in the Neon preview branch. 4242... is Stripe's success test card.
 */
test('guest can buy a bag of beans with a test card', async ({ page }) => {
  await page.goto('/shop/ethiopia-guji-hambela');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('link', { name: /cart/i }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.waitForURL(/checkout\.stripe\.com/);
  await page.getByLabel('Email').fill('qa+checkout@nordlicht-coffee.example');
  await page.getByPlaceholder('1234 1234 1234 1234').fill('4242 4242 4242 4242');
  await page.getByPlaceholder('MM / YY').fill('12 / 34');
  await page.getByPlaceholder('CVC').fill('123');
  await page.getByRole('button', { name: /pay/i }).click();

  await page.waitForURL(/\/order\/thanks/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/thank/i);
});

test('enquiry API rejects a missing Turnstile token', async ({ request }) => {
  const res = await request.post('/api/enquiries', {
    data: { kind: 'wholesale', name: 'QA', email: 'qa@nordlicht-coffee.example', message: 'Samples please' },
  });
  expect(res.status()).toBe(400);
});
