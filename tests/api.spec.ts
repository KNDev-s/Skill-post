import { test, expect } from '@playwright/test';
import type { Post } from '../src/types/post';

const fixture: Post = {
  id: 'server-post',
  revision: 1,
  status: 'ready',
  brief: { topic: 'Automação para empresas', slideCount: 3, tone: 'educativo', objective: 'leads' },
  slides: [
    { id: 'one', title: 'Um título do servidor', body: 'Texto da API', layout: 'cover' },
    { id: 'two', title: 'Segundo slide', body: 'Texto da API', layout: 'content' },
    { id: 'three', title: 'Vamos conversar?', body: 'Texto da API', layout: 'closing' },
  ],
  caption: 'Legenda do backend',
  createdAt: '2026-09-18T12:00:00.000Z',
  updatedAt: '2026-09-18T12:00:00.000Z',
};

test('consome geração e publicação assíncronas e envia a revisão aprovada', async ({ page }) => {
  let post = structuredClone(fixture);
  let publishCount = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/posts' && request.method() === 'POST') {
      expect(request.postDataJSON().slideCount).toBe(3);
      post = { ...fixture, status: 'generating', slides: [] };
      await route.fulfill({ status: 202, json: { data: post } });
      return;
    }
    if (path.endsWith('/approve')) {
      expect(request.postDataJSON()).toEqual({ revision: 2 });
      post = { ...post, status: 'approved', revision: 3 };
    } else if (path.endsWith('/publish')) {
      expect(request.postDataJSON()).toEqual({ revision: 3 });
      expect(request.headers()['idempotency-key']).toBeTruthy();
      publishCount++;
      post = { ...post, status: 'publishing', revision: 4 };
    } else if (request.method() === 'GET') {
      if (post.status === 'generating') post = { ...fixture, revision: 2 };
      else if (post.status === 'publishing')
        post = { ...post, status: 'published', publishedAt: new Date().toISOString(), revision: 5 };
    }
    await route.fulfill({ json: { data: post } });
  });
  await page.goto('/');
  await expect(page.getByText('Modo integrado', { exact: true })).toBeVisible();
  await expect(page.getByText('Modo demonstração', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar exemplo' }).click();
  await page.getByRole('button', { name: '3 slides', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.locator('.preview-art-wrapper h3')).toHaveText('Um título do servidor');
  await page.getByRole('button', { name: 'Aprovar conteúdo', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar agora', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Post publicado!' })).toBeVisible();
  expect(publishCount).toBe(1);
});

test('falha do backend preserva erro e não gera mock', async ({ page }) => {
  await page.route('**/api/v1/posts', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Geração temporariamente indisponível.' } },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Geração temporariamente indisponível.');
  await expect(page.getByRole('button', { name: 'Aprovar conteúdo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gerar conteúdo', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Ver slide 1', exact: true })).toHaveCount(0);
});

test('polling com falha permite consultar o mesmo post novamente', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        json: { data: { ...fixture, status: 'generating', slides: [] } },
      });
    } else if (++reads === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Status indisponível.' } },
      });
    } else await route.fulfill({ json: { data: fixture } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Status indisponível.');
  await page.getByRole('button', { name: 'Atualizar status', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Pronto$/ })).toBeVisible();
  expect(reads).toBe(2);
});
