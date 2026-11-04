const { chromium, devices } = require('playwright');
const W = 'http://localhost:3066'; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + x)); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(W + '/login'); await p.fill('input[name=username]', 'superadmin'); await p.fill('input[name=password]', 'SuperSecret12345'); await p.click('button:has-text("Sign in")'); await p.waitForURL('**/dashboard');
  await p.waitForSelector('button[aria-label="Open menu"]');
  const overflow = async () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const inView = async (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.right > 1 && r.left < window.innerWidth - 1; }, sel);
  ok('menu is hidden by default on a phone', !(await inView('#sidebar')));
  await p.screenshot({ path: 'm-dashboard.png' });
  await p.click('button[aria-label="Open menu"]'); await p.waitForTimeout(350);
  ok('hamburger opens the menu', await inView('#sidebar')); await p.screenshot({ path: 'm-menu.png' });
  await p.click('#sidebar >> text=Account Management'); await p.waitForURL('**/accounts'); await p.waitForTimeout(400);
  ok('menu closes after choosing a page', !(await inView('#sidebar')));
  await p.click('button[aria-label="Open menu"]'); await p.waitForTimeout(300); await p.click('[aria-hidden]', { position: { x: 380, y: 400 } }); await p.waitForTimeout(350);
  ok('tapping outside closes the menu', !(await inView('#sidebar')));
  await p.click('button[aria-label="Open menu"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(350); ok('Escape closes the menu', !(await inView('#sidebar')));
  const pages = ['/dashboard', '/accounts', '/accounts?role=STAFF', '/referrals', '/game', '/credits', '/admins', '/accounting', '/accounting/setup', '/accounting/reports', '/accounting/reconciliation', '/notifications', '/profile', '/system', '/audit'];
  for (const u of pages) {
    await p.goto(W + u); await p.waitForSelector('main'); await p.waitForTimeout(900);
    const o = await overflow(); ok(`no sideways scrolling: ${u}`, o <= 1, `(page is ${o}px too wide)`);
  }
  // open forms
  await p.goto(W + '/accounts'); await p.waitForSelector('table'); await p.click('button:has-text("New")'); await p.waitForSelector('form input[name=username]');
  ok('create-account form fits and stacks on a phone', (await overflow()) <= 1);
  const w = await p.evaluate(() => { const i = document.querySelector('form input[name=username]').getBoundingClientRect(); return Math.round(i.width); }); ok('inputs are wide enough to type in (>240px)', w > 240, `(${w}px)`);
  await p.screenshot({ path: 'm-form.png' });
  await p.goto(W + '/accounting'); await p.click('button:has-text("New entry")'); await p.waitForSelector('select'); ok('journal entry form fits', (await overflow()) <= 1); await p.screenshot({ path: 'm-journal.png' });
  const fs = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('input,select')).fontSize)); ok('inputs use 16px text (no iOS zoom)', fs >= 16, `(${fs}px)`);
  // user view
  ok('no page errors', errs.length === 0, errs.join('|')); await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
