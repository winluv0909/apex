import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();

// Run the real server action code against a simulated Supabase session.
// Unexpected writes fail immediately, including direct calls to hidden actions.
function harness(role, { profileError = false, signedIn = true } = {}) {
  const reads = [];
  let signedOut = false;
  const client = {
    auth: {
      getClaims: async () => ({ data: signedIn ? { claims: { sub: 'test-user' } } : null }),
      signInWithPassword: async () => ({ data: { user: { id: 'test-user' } } }),
      signOut: async () => { signedOut = true; return {}; },
    },
    from(table) {
      if (table !== 'profiles') reads.push(table);
      const query = {
        select() { return this; }, eq() { return this; },
        order() { return this; }, range() { return this; },
        gte() { return this; }, lte() { return this; }, in() { return this; },
        single: async () => ({
          data: role == null ? null : { role, full_name: 'Report Tester' },
          error: profileError ? { message: 'Profile lookup failed' } : null,
        }),
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
        insert() { throw new Error('UNEXPECTED WRITE'); },
        update() { throw new Error('UNEXPECTED WRITE'); },
        delete() { throw new Error('UNEXPECTED WRITE'); },
      };
      return query;
    },
    rpc() { throw new Error('UNEXPECTED WRITE RPC'); },
  };
  const cache = new Map();
  function load(filename) {
    const full = path.resolve(root, filename);
    if (cache.has(full)) return cache.get(full);
    const output = ts.transpileModule(readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loadedModule = { exports: {} };
    cache.set(full, loadedModule.exports);
    const requireMock = (name) => {
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      if (name === '@/lib/permissions') return load('lib/permissions.ts');
      if (name === 'next/navigation') return { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } };
      if (name === 'next/cache') return { revalidatePath() {} };
      throw new Error(`Unexpected import: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: full })(requireMock, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return { load, reads, signedOut: () => signedOut };
}

for (const role of ['owner', 'viewer']) {
  test(`${role} can sign in`, async () => {
    const h = harness(role);
    const form = new FormData();
    form.set('email', 'test@example.com'); form.set('password', 'example');
    await assert.rejects(h.load('app/login/actions.ts').signIn(form), /REDIRECT:\/dashboard$/);
    assert.equal(h.signedOut(), false);
  });
  for (const request of [
    { period: 'daily', date: '2026-01-01' },
    { period: 'monthly', year: 2026, month: 1 },
    { period: 'annual', year: 2026 },
  ]) {
    test(`${role} can generate a ${request.period} report`, async () => {
      const h = harness(role);
      const report = await h.load('app/dashboard/report-actions.ts').generateFinancialReport(request);
      assert.equal(report.period, request.period);
      assert.equal(report.preparedBy, 'Report Tester');
      assert.ok(h.reads.includes('salaries'));
      assert.ok(h.reads.includes('expenses'));
    });
  }
}

for (const role of ['admin', 'staff', 'unknown', null]) {
  test(`${role} cannot sign in or generate reports`, async () => {
    const h = harness(role);
    const form = new FormData(); form.set('email', 'test@example.com'); form.set('password', 'example');
    await assert.rejects(h.load('app/login/actions.ts').signIn(form), /REDIRECT:\/login\?error=Access/);
    assert.equal(h.signedOut(), true);
    await assert.rejects(h.load('app/dashboard/report-actions.ts').generateDailyReport('2026-01-01'), /Only authorized/);
    assert.deepEqual(h.reads, []);
  });
}

for (const options of [{ signedIn: false }, { profileError: true }]) {
  test(`report denies invalid session/profile ${JSON.stringify(options)}`, async () => {
    const h = harness('viewer', options);
    await assert.rejects(h.load('app/dashboard/report-actions.ts').generateDailyReport('2026-01-01'));
    assert.deepEqual(h.reads, []);
  });
}

test('viewer direct calls to every data-changing action are denied before writes', async () => {
  const h = harness('viewer');
  const form = new FormData(); form.set('sale_id', '11111111-1111-4111-8111-111111111111');
  const sales = h.load('app/sales/actions.ts');
  assert.match((await sales.saveSale({ error: '' }, form)).error, /permission/);
  await assert.rejects(sales.addSale(form), /REDIRECT:.*error=save/);
  await assert.rejects(h.load('app/expenses/actions.ts').addExpense(form), /permission/);
  const details = h.load('app/sales/[id]/actions.ts');
  await assert.rejects(details.addSale(form), /permission/);
  await assert.rejects(details.addPayment(form), /permission/);
  const entries = h.load('app/dashboard/records/entry-actions.ts');
  for (const tab of ['benefits', 'salaries', 'incentives', 'cash-advance']) {
    const result = await entries.saveEntry(tab, { error: '', success: false }, form);
    assert.match(result.error, /cannot add entries/);
    assert.equal(result.success, false);
  }
  assert.match((await entries.saveRepayment({ error: '', success: false }, form)).error, /cannot add entries/);
  assert.deepEqual(h.reads, []);
});
