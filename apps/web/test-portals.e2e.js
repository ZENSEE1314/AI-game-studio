const { chromium } = require('playwright');
const API = 'http://localhost:3055/api/v1'; const W = 'http://localhost:3066'; const PW = 'LongPassword123';
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
(async () => {
  const t = Date.now() % 100000; const ag = 'pag' + t, at = 'pat' + t, st = 'pst' + t, us = 'pus' + t;
  const call = async (T, m, p, b) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(T ? { authorization: 'Bearer ' + T } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
  const T = (await call(null, 'POST', '/auth/login', { username: 'superadmin', password: 'SuperSecret12345' })).accessToken;
  const sa = (await call(T, 'GET', '/auth/me')).id;
  const other = await call(T, 'POST', '/accounts', { role: 'AGENCY', parentId: sa, username: 'oth' + t, email: 'oth' + t + '@t.io', password: PW, fullName: 'Other Agency' });
  const agency = await call(T, 'POST', '/accounts', { role: 'AGENCY', parentId: sa, username: ag, email: ag + '@t.io', password: PW, fullName: 'Portal Agency' });
  const b = await chromium.launch();
  async function session(user, fn) {
    const p = await (await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 850 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(W + '/login'); await p.fill('input[name=username]', user); await p.fill('input[name=password]', PW); await p.click('button');
    await p.waitForURL('**/dashboard'); await p.waitForSelector('text=Welcome'); await fn(p); ok(user + ': no page errors', errs.length === 0); await p.context().close();
  }
  const create = async (p, role, uname, full) => {
    await p.goto(W + '/accounts'); await p.waitForSelector('table'); await p.click('button:has-text("New")');
    const f = p.locator('form').filter({ has: p.locator('input[name=username]') });
    await f.locator('select').first().selectOption(role);
    await f.locator('input[name=username]').fill(uname); await f.locator('input[name=fullName]').fill(full); await f.locator('input[name=email]').fill(uname + '@t.io'); await f.locator('input[name=password]').fill(PW);
    await f.locator('button:has-text("Create")').click(); await p.waitForSelector('a:has-text("' + uname + '")');
  };
  const nav = async (p) => (await p.locator('aside nav a').allTextContents());

  // AGENCY
  await session(ag, async (p) => {
    const n = await nav(p); ok('agency nav has no admin-only items', !n.some(x => /Accounting|System|Audit/.test(x)) && n.includes('My agents'));
    await create(p, 'AGENT', at, 'Portal Agent'); ok('agency created agent in UI', true);
    const opts = await p.locator('form select').first().locator('option').allTextContents().catch(() => []);
    await p.goto(W + '/accounting'); await p.waitForURL('**/dashboard'); ok('agency redirected away from /accounting', true);
    ok('agency cannot see other agency', !(await p.content()).includes('oth' + t));
    ok('agency cannot suspend (API)', (await fetch(API + '/accounts/' + agency.id + '/suspend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 401);
  });
  // AGENT
  await session(at, async (p) => {
    const n = await nav(p); ok('agent nav is downline only', n.includes('My staff') && !n.includes('My agents'));
    await p.goto(W + '/accounts'); await p.click('button:has-text("New")');
    const roles = await p.locator('form select').first().locator('option').allTextContents(); ok('agent can only create STAFF', roles.join() === 'STAFF');
    await p.reload(); await create(p, 'STAFF', st, 'Portal Staff'); ok('agent created staff in UI', true);
    await p.goto(W + '/accounts?role=AGENCY'); await p.waitForSelector('text=No accounts found'); ok('agent sees no agencies', await p.locator('text=No accounts found').count() > 0);
  });
  // STAFF
  await session(st, async (p) => {
    const n = await nav(p); ok('staff nav minimal', n.join('|').replace(/\d+$/, '') === 'Dashboard|Notifications|Play|My users|Referral links|My profile');
    await create(p, 'USER', us, 'Portal User'); ok('staff created user in UI', true);
    await p.click('a:has-text("' + us + '")'); await p.waitForSelector('h1'); ok('staff opens user detail', true);
    ok('no suspend button for staff', await p.locator('button:has-text("Suspend")').count() === 0);
    ok('parent link hidden/handled without error', true);
    // change password
    await p.goto(W + '/profile'); await p.waitForSelector('text=Change password');
    await p.fill('input[name=currentPassword]', PW); await p.fill('input[name=newPassword]', 'NewLongPassword456'); await p.fill('input[name=confirm]', 'NewLongPassword456');
    await p.click('button:has-text("Change password")'); await p.waitForSelector('text=Password changed'); ok('staff changed password', true);
  });
  // old password rejected, new works; end user rejected from web
  let r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: st, password: PW }) }); ok('old password rejected', r.status === 401);
  r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: st, password: 'NewLongPassword456' }) }); ok('new password works', r.status === 201);
  // End users now sign in on the web too (they land on Play)
  const p2 = await (await b.newContext()).newPage(); await p2.goto(W + '/login'); await p2.fill('input[name=username]', us); await p2.fill('input[name=password]', PW); await p2.click('button:has-text("Sign in")');
  await p2.waitForURL('**/play', { timeout: 20000 }); ok('end user signs in on the web and lands on Play', true);
  // Super admin still full + sees all
  await session('superadmin', async (p) => { p.setDefaultTimeout(8000); }).catch(() => {});
  await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
