const { chromium } = require('playwright');
const API = 'http://localhost:3055/api/v1'; const W = 'http://localhost:3066'; const PW = 'LongPassword123', ROOT = 'SuperSecret12345';
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
(async () => {
  const t = Date.now() % 100000;
  const call = async (T, m, p, b) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(T ? { authorization: 'Bearer ' + T } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
  const T = (await call(null, 'POST', '/auth/login', { username: 'superadmin', password: ROOT })).accessToken; const sa = (await call(T, 'GET', '/auth/me')).id;
  const mk = (role, parentId, u, n) => call(T, 'POST', '/accounts', { role, parentId, username: u, email: u + '@t.io', password: PW, fullName: n });
  const ag = await mk('AGENCY', sa, 'wag' + t, 'Web Agency'), at = await mk('AGENT', ag.id, 'wat' + t, 'Web Agent');
  const s1 = await mk('STAFF', at.id, 'wst' + t, 'Wendy Staff'), s2 = await mk('STAFF', at.id, 'wst2' + t, 'Walt Staff');
  const b = await chromium.launch(); const ctx = async () => { const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const signin = async (p, u, pw) => { await p.goto(W + '/login'); await p.fill('input[name=username]', u); await p.fill('input[name=password]', pw); await p.click('button:has-text("Sign in")'); };

  // staff sees own link
  const st = await ctx(); await signin(st, 'wst' + t, PW); await st.waitForURL('**/dashboard'); await st.goto(W + '/referrals'); await st.waitForSelector('[data-testid=my-link]');
  const link = (await st.locator('[data-testid=my-link]').innerText()).trim(); ok('staff sees own sign-up link', /\/signup\?ref=[A-Z2-9]{8}$/.test(link));
  ok('staff nav has no admin items', !(await st.locator('aside').innerText()).match(/Accounting|System|Audit|Credits/));

  // public sign-up through the link
  const pub = await ctx(); const u = 'wuser' + t; await pub.goto(link);
  await pub.waitForSelector('[data-testid=joining]'); ok('sign-up page shows who you are joining', (await pub.locator('[data-testid=joining]').innerText()).includes('Wendy Staff'));
  await pub.fill('input[name=fullName]', 'Web User'); await pub.fill('input[name=username]', u); await pub.fill('input[name=email]', u + '@t.io'); await pub.fill('input[name=password]', PW); await pub.fill('input[name=confirm]', 'different-pass-1');
  await pub.click('button:has-text("Create account")'); await pub.waitForSelector('[role=alert]:has-text("do not match")'); ok('mismatched passwords caught', true);
  await pub.fill('input[name=confirm]', PW); await pub.click('button:has-text("Create account")'); await pub.waitForURL('**/play', { timeout: 20000 });
  ok('sign-up signs the user in and lands on Play', true);
  ok('user nav is just Notifications / Play / Profile', (await pub.locator('aside nav a').allTextContents()).join('|') === 'Notifications|Play|My profile');
  await pub.goto(W + '/accounts'); await pub.waitForURL('**/play', { timeout: 10000 }); ok('user cannot open accounts pages', true);
  // bad code
  const bad = await ctx(); await bad.goto(W + '/signup?ref=ZZZZZZZZ'); await bad.waitForSelector('text=not valid'); ok('bad code is flagged immediately', await bad.locator('button:has-text("Create account")').isDisabled());
  // sign-out/in as user
  await pub.click('button:has-text("Sign out")'); await pub.waitForURL('**/login'); await signin(pub, u, PW); await pub.waitForURL('**/play'); ok('user can sign in again from the login page', true);
  ok('login page links to sign-up', await pub.locator('a[href="/signup"]').count() > 0);

  // agency / admin referral lists
  const agp = await ctx(); await signin(agp, 'wag' + t, PW); await agp.waitForURL('**/dashboard'); await agp.goto(W + '/referrals'); await agp.waitForSelector('tr:has-text("Wendy Staff")');
  ok('agency sees its staff links', await agp.locator('tr:has-text("Walt Staff")').count() > 0); ok('agent filter works', true);
  const adm = await ctx(); await signin(adm, 'superadmin', ROOT); await adm.waitForURL('**/dashboard'); await adm.goto(W + '/referrals'); await adm.waitForSelector('tr:has-text("Wendy Staff")');
  await adm.selectOption('select[aria-label=Agency]', { label: 'Web Agency' }); await adm.waitForTimeout(300);
  ok('admin: picking an agency narrows the list', await adm.locator('tbody tr').count() === 2 && await adm.locator('tr:has-text("Wendy Staff")').count() === 1);
  await adm.selectOption('select[aria-label=Agent]', { label: 'Web Agent' }); ok('admin: picking an agent keeps its staff', await adm.locator('tr:has-text("Walt Staff")').count() === 1);
  ok('row shows agency, agent and staff', (await adm.locator('tr:has-text("Wendy Staff")').innerText()).includes('Web Agency') && (await adm.locator('tr:has-text("Wendy Staff")').innerText()).includes('Web Agent'));

  // role change in UI: move the user from Wendy to Walt
  const uid = (await call(T, 'GET', `/accounts?search=${u}`)).items[0].id;
  adm.on('dialog', d => d.accept()); await adm.goto(W + '/accounts/' + uid); await adm.waitForSelector('text=Change level / move');
  await adm.selectOption('select[aria-label="New parent"]', { label: 'Walt Staff (@wst2' + t + ')' }); await adm.click('button:has-text("Apply change")'); await adm.waitForSelector('text=Updated');
  ok('admin moved the user to another staff member in the UI', true);
  await adm.reload(); await adm.waitForSelector('text=↑'); ok('detail page now shows the new parent', (await adm.locator('a:has-text("↑")').innerText()).includes('wst2' + t));
  await pub.goto(W + '/play'); await pub.waitForURL('**/login', { timeout: 15000 }); ok('moved user was signed out (sessions ended)', true);
  ok('no page errors', [st, pub, bad, agp, adm].every((p) => p.errs.length === 0));
  await pub.screenshot({ path: 'login-user.png' }); await adm.screenshot({ path: 'referrals.png' }); await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
