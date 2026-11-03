const { chromium } = require('playwright');
const { authenticator } = require('otplib');
const W = 'http://localhost:3066'; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
(async () => {
  const t = Date.now() % 100000, nu = 'uiadm' + t, TP = 'TempPassword-' + t + '-xyz', NP = 'BrandNewPass-' + t + '-q', ROOT = 'SuperSecret12345';
  const b = await chromium.launch();
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const admin = await mk();
  admin.on('dialog', d => d.accept(/YOUR password/i.test(d.message()) ? ROOT : 'security review'));
  await admin.goto(W + '/login'); await admin.fill('input[name=username]', 'superadmin'); await admin.fill('input[name=password]', ROOT); await admin.click('button'); await admin.waitForURL('**/dashboard');
  await admin.goto(W + '/admins'); await admin.waitForSelector('text=Add administrator');
  const f = admin.locator('form');
  await f.locator('input[name=username]').fill(nu); await f.locator('input[name=fullName]').fill('UI Admin'); await f.locator('input[name=email]').fill(nu + '@t.io');
  await f.locator('input[name=temporaryPassword]').fill(TP); await f.locator('input[name=currentPassword]').fill('wrong-password'); await f.locator('button').click();
  await admin.waitForSelector('[role=alert]:has-text("incorrect")'); ok('wrong confirmation password refused in UI', true);
  await f.locator('input[name=currentPassword]').fill(ROOT); await f.locator('button').click(); await admin.waitForSelector('text=Administrator ' + nu + ' created'); await admin.waitForSelector('tr:has-text("' + nu + '")');
  ok('admin created and listed with temp-password badge', await admin.locator('tr:has-text("' + nu + '") >> text=temp password').count() > 0);
  ok('no suspend button on own row', await admin.locator('tr:has-text("superadmin") >> button').count() === 0);

  const n = await mk(); await n.goto(W + '/login'); await n.fill('input[name=username]', nu); await n.fill('input[name=password]', TP); await n.click('button'); await n.waitForURL('**/dashboard');
  await n.waitForURL('**/profile', { timeout: 15000 }); await n.waitForSelector('text=Your password is temporary'); ok('new admin is forced to the profile page', true);
  ok('2FA prompt shown', await n.locator('text=Two-factor authentication is not enabled').count() > 0);
  await n.fill('input[name=currentPassword]', TP); await n.fill('input[name=newPassword]', NP); await n.fill('input[name=confirm]', NP); await n.click('button:has-text("Change password")'); await n.waitForSelector('text=Password changed');
  // 2FA setup via UI
  await n.click('text=Set up authenticator app'); await n.waitForSelector('[data-testid=totp-secret]'); const secret = (await n.locator('[data-testid=totp-secret]').innerText()).trim();
  await n.fill('input[name=code]', '000000'); await n.click('button:has-text("Enable two-factor")'); await n.waitForSelector('[role=alert]'); ok('wrong 2FA code refused', true);
  await n.fill('input[name=code]', authenticator.generate(secret)); await n.click('button:has-text("Enable two-factor")'); await n.waitForSelector('text=Enabled. You will be asked'); ok('2FA enabled via UI', true);
  await n.goto(W + '/accounts'); await n.waitForSelector('table'); ok('new admin can use the panel after onboarding', true);
  await n.click('button:has-text("Sign out")'); await n.waitForURL('**/login');
  await n.fill('input[name=username]', nu); await n.fill('input[name=password]', NP); await n.click('button'); await n.waitForSelector('input[name=totp]'); ok('login now asks for the 2FA code', true);
  await n.fill('input[name=totp]', authenticator.generate(secret)); await n.click('button'); await n.waitForURL('**/dashboard'); ok('login with password + 2FA code works', true);

  // suspend / reactivate via UI
  await admin.reload(); await admin.waitForSelector('tr:has-text("' + nu + '")');
  await admin.locator('tr:has-text("' + nu + '") >> button:has-text("Suspend")').click(); await admin.waitForSelector('text=' + nu + ' suspended');
  await n.goto(W + '/accounts'); await n.waitForURL('**/login', { timeout: 15000 }); ok('suspended admin is signed out immediately', true);
  await admin.waitForSelector('tr:has-text("' + nu + '") >> button:has-text("Reactivate")'); ok('row now offers Reactivate', true);
  await admin.locator('tr:has-text("' + nu + '") >> button:has-text("Reactivate")').click(); await admin.waitForSelector('text=' + nu + ' reactivated'); ok('reactivated via UI', true);
  ok('no page errors', admin.errs.length === 0 && n.errs.length === 0);
  await n.screenshot({ path: 'admins.png' }); await admin.screenshot({ path: 'admins-list.png' }); await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
