import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Այս ստուգումը միայն տեղական փորձնական բազայի համար է');
const output = process.env.QA_OUTPUT || '.local-artifacts/qa-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const open = async path => {
    const response = await page.goto(base + path, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, path);
    await page.locator('.candle-loader').waitFor({ state: 'detached', timeout: 10000 });
  };
  await open('/psalms');
  const field = page.locator('input[name=q]');
  await field.fill('!!!');
  await page.getByRole('button', { name: 'Որոնել այս բաժնում', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(page.url(), base + '/psalms');
  await field.fill('1');
  await field.press('Enter');
  await page.getByRole('link', { name: 'Բացել՝ Սաղմոս 1', exact: true }).waitFor();
  assert.equal(page.url(), base + '/psalms');
  console.log('✓ Սաղմոսի որոնումը և անվավեր մուտքի հուշումը');

  const submit = async text => { await field.fill(text); await page.getByRole('button', { name: 'Որոնել այս բաժնում', exact: true }).click(); };
  const searchRoute = '**/api/search-page?**';
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  await context.route(searchRoute, async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'առաջին') { firstStarted(); await new Promise(resolve => setTimeout(resolve, 700)); }
    await route.fulfill({ json: { materials: [], nextCursor: null } }).catch(() => undefined);
  });
  await submit('առաջին'); await started; await submit('երկրորդ');
  await page.getByText('«երկրորդ» այս բաժնում չկա', { exact: true }).waitFor();
  await page.waitForTimeout(900);
  assert.equal(await page.getByText('«առաջին» այս բաժնում չկա', { exact: true }).count(), 0);
  await context.unroute(searchRoute);
  console.log('✓ Ուշացած որոնումը չի փոխարինում վերջինին');

  await context.route(searchRoute, route => route.fulfill({ status: 503, body: 'unavailable' }));
  await submit('սաղմոս');
  await page.getByRole('alert').filter({ hasText: 'Որոնումը չհաջողվեց' }).waitFor();
  assert.equal(await page.getByText('«սաղմոս» այս բաժնում չկա', { exact: true }).count(), 0);
  await context.unroute(searchRoute);
  await context.route(searchRoute, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' }));
  await page.getByRole('button', { name: 'Կրկին փորձել', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Որոնումը չհաջողվեց' }).waitFor();
  assert.equal(await page.getByText('Փնտրում եմ այս բաժնում…', { exact: true }).count(), 0);
  await context.unroute(searchRoute);
  console.log('✓ 503 և վնասված JSON՝ հասկանալի սխալ, առանց կախվելու');

  let secondPage = false;
  let categoryDownloads = 0;
  page.on('request', request => { if (/\/api\/categories\/.*\/posts/.test(request.url())) categoryDownloads++; });
  await context.route(searchRoute, route => {
    const next = new URL(route.request().url()).searchParams.get('cursor');
    if (next) secondPage = true;
    return route.fulfill({ json: next ? { materials: [{ id: 'material_tg_n1002993860753_90299', title: 'Սաղմոս 99', preview: { mediaTitle: null } }], nextCursor: null } : { materials: [], nextCursor: 'next-test-page' } });
  });
  await submit('99');
  await page.getByRole('link', { name: 'Բացել՝ Սաղմոս 99', exact: true }).waitFor();
  assert.ok(secondPage);
  assert.equal(categoryDownloads, 0);
  await context.unroute(searchRoute);
  console.log('✓ Որոնման հաջորդ էջի համընկնումը հասանելի է');

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/psalms', '/psalms/1', '/settings', '/search', '/places']) {
      await open(path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${path}`);
    }
  }
  console.log('✓ Էջերը չեն լայնանում 320, 390 և 1440 px-ում');
  await open('/settings');
  await page.getByText('Մուգ', { exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.ok((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex'));

  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const help = await fresh.newPage();
  let helpDownloads = 0;
  help.on('request', request => { if (request.url().includes('/help-media/')) helpDownloads++; });
  await fresh.route('**/help-media/qa-help.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(0) }));
  await help.goto(base + '/psalms/1', { waitUntil: 'networkidle' });
  await help.waitForTimeout(1500);
  assert.equal(await help.getByRole('dialog').count(), 0);
  assert.equal(helpDownloads, 0);
  await help.goto(base + '/ognutyun', { waitUntil: 'networkidle' });
  const trigger = help.getByRole('button', { name: /Փորձնական օգնություն/ });
  await trigger.click();
  await help.getByRole('dialog').waitFor();
  for (let step = 0; step < 12; step++) {
    await help.keyboard.press('Tab');
    assert.ok(await help.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]'))));
  }
  await help.keyboard.press('Escape');
  assert.equal(await help.getByRole('dialog').count(), 0);
  await trigger.evaluate(element => { if (document.activeElement !== element) throw new Error('Focus was not restored'); });
  assert.ok(helpDownloads > 0);
  console.log('✓ Օգնությունը բացվում է միայն ընտրությամբ, focus-ը կառավարվում է');

  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 600 } });
  const plain = await nojs.newPage();
  await plain.goto(base + '/', { waitUntil: 'networkidle' });
  await plain.mouse.wheel(0, 700); await plain.waitForTimeout(250);
  assert.ok(await plain.evaluate(() => scrollY > 0));
  assert.ok(await plain.evaluate(() => [...document.querySelectorAll('.reveal-img')].every(image => getComputedStyle(image).opacity === '1')));
  console.log('✓ Առանց JavaScript-ի էջը սահում է, նկարները տեսանելի են');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
