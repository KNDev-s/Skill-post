import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { slideHtml, type ArtAssets } from '../worker/render';
let assets: ArtAssets;
test.beforeAll(async () => {
  const data = async (path: string, mime: string) =>
    `data:${mime};base64,${(await readFile(`public/brand/${path}`)).toString('base64')}`;
  assets = {
    logo: await data('logo-dark.png', 'image/png'),
    inter: await data('inter-latin-400-normal.woff2', 'font/woff2'),
    heading: await data('space-grotesk-latin-700-normal.woff2', 'font/woff2'),
  };
});
test('arte final 1080 × 1350 usa fontes e logo locais sem cortar texto', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1350 });
  await page.setContent(
    slideHtml(
      {
        id: 'test',
        title: 'Tecnologia que simplifica seu negócio.',
        body: 'Menos tarefas repetitivas. Mais tempo para atender bem e fazer sua empresa crescer.',
        layout: 'cover',
      },
      0,
      5,
      assets,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('footer img')).toBeVisible();
  await page.screenshot({ path: 'test-results/brand-final-slide.png' });
  expect(await page.evaluate(() => document.body.scrollHeight)).toBe(1350);
});
test('texto adversarial não injeta HTML nem invade o rodapé', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1350 });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  for (const title of [
    '<img src="https://evil.example/steal" onerror="alert(1)">',
    'W'.repeat(90),
  ]) {
    await page.setContent(
      slideHtml({ id: 'test', title, body: 'W'.repeat(260), layout: 'content' }, 1, 3, assets),
    );
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator('h1 img').count()).toBe(0);
    expect(
      await page.evaluate(
        () =>
          document.querySelector('p')!.getBoundingClientRect().bottom <=
          document.querySelector('footer')!.getBoundingClientRect().top,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.body.scrollHeight)).toBe(1350);
  }
  expect(requests).toEqual([]);
});
