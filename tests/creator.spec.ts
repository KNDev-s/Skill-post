import { test, expect } from '@playwright/test';

test('cria, navega, regenera, edita, aprova e publica', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Modo demonstração', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar conteúdo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('pelo menos 5');
  await page.getByRole('button', { name: 'Usar exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Gerando$/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Pronto$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar agora', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ver slide 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver slide 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Regenerar slide 2' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Pronto$/ })).toBeVisible();
  await expect(page.locator('.preview-art-wrapper h3')).toContainText('Um novo olhar');
  await page.getByRole('button', { name: 'Aprovar conteúdo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Aprovado$/ })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Legenda do post' })
    .fill('Legenda revisada para o teste.');
  await expect(page.getByRole('button', { name: 'Publicar agora', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Pronto$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar conteúdo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Aprovado$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar agora', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Post publicado!' })).toBeVisible();
  await expect(
    page.getByText('Simulação concluída. Nenhum post foi enviado ao Instagram.'),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('valida data e agenda com o fuso do navegador', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Tema do carrossel' })
    .fill('Aplicações web para pequenos negócios');
  await page.getByRole('button', { name: '3 slides', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver slide 3', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver slide 4', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Aprovar conteúdo', exact: true }).click();
  await page.getByRole('radio', { name: 'Agendar', exact: true }).check();
  await page.getByRole('button', { name: 'Agendar publicação' }).click();
  await expect(page.getByRole('alert')).toContainText('futuro');
  await page.getByLabel('Data e horário').fill('2099-09-22T18:00');
  await page.getByRole('button', { name: 'Agendar publicação' }).click();
  await expect(page.getByRole('heading', { name: 'Tudo agendado!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerar tudo' })).toBeDisabled();
});

test('layout inicial e preview preenchido sem transbordamento', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'O que vamos criar?' })).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-initial.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Usar exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar conteúdo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Pronto$/ })).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-ready.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
