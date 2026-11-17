/**
 * Verifies TripKhata's core ledger rules against the real storage layer:
 *   1. every expense gets an INSERT audit entry
 *   2. paid-by and entered-by stay separate
 *   3. a non-owner cannot edit or delete someone else's entry
 *   4. an owner's edit/delete is recorded in the audit history
 *   5. totals recompute from the ledger only (nothing auto-created/split)
 *
 * Run:  npm run test:rules
 */
import { getStorage } from '../src/lib/storage';
import { buildSummary } from '../src/lib/calculations';
import { MEMBERS } from '../src/lib/constants';

// --- minimal browser shims (local mode never touches the network) ---
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as unknown as { window: unknown }).window = {
  addEventListener() {},
  removeEventListener() {},
};

const results: { check: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = '') =>
  results.push({ check: name, ok, detail });

async function expectThrow(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const storage = getStorage();
  await storage.init();

  const [rohit, pratham, , neeraj] = MEMBERS.map((m) => m.id);
  const now = new Date().toISOString();

  // 1. create — paid by Rohit, entered by Pratham (must stay distinct)
  const hotel = await storage.addExpense(
    {
      title: 'Hotel Booking',
      amount: 8000,
      category: 'Stay',
      description: '2 rooms, 1 night',
      paid_by_member_id: rohit,
      payment_method: 'UPI',
      expense_date: now,
    },
    pratham,
  );
  check('paid-by and entered-by stored separately', hotel.paid_by_member_id === rohit && hotel.entered_by_member_id === pratham, `${hotel.paid_by_member_id.slice(0, 8)} / ${hotel.entered_by_member_id.slice(0, 8)}`);

  let audit = await storage.loadAudit();
  check('INSERT written to audit history', audit.length === 1 && audit[0].action === 'INSERT');

  // 2. someone else must NOT be able to edit it
  const editBlocked = await expectThrow('foreign edit blocked', () =>
    storage.updateExpense(hotel.id, { amount: 9999 }, neeraj),
  );
  check("non-owner edit is rejected", editBlocked);

  // 3. owner edit works and is audited
  const edited = await storage.updateExpense(hotel.id, { amount: 9000 }, pratham);
  check('owner edit applied', edited.amount === 9000);
  audit = await storage.loadAudit();
  check('UPDATE written to audit history', audit.some((a) => a.action === 'UPDATE'));

  // 4. someone else must NOT be able to delete it
  const deleteBlocked = await expectThrow('foreign delete blocked', () =>
    storage.deleteExpense(hotel.id, neeraj),
  );
  check('non-owner delete is rejected', deleteBlocked);

  // 5. totals: add a second expense paid by Aman... i.e. by Neeraj, entered by Neeraj
  await storage.addExpense(
    {
      title: 'Petrol',
      amount: 3000,
      category: 'Fuel',
      description: 'Chandigarh → Manali',
      paid_by_member_id: neeraj,
      payment_method: 'Cash',
      expense_date: now,
    },
    neeraj,
  );

  const expenses = await storage.loadExpenses();
  const members = await storage.loadMembers();
  const summary = buildSummary(expenses, members);

  check('total = sum of records only', summary.total === 12000, String(summary.total));
  check('expense count correct', summary.count === 2, String(summary.count));
  const prathamTotals = summary.memberTotals.find((m) => m.member.id === pratham);
  const neerajTotals = summary.memberTotals.find((m) => m.member.id === neeraj);
  const rohitTotals = summary.memberTotals.find((m) => m.member.id === rohit);
  check(
    'member paid total uses Paid-By only',
    rohitTotals?.totalPaid === 9000 && rohitTotals?.totalEntered === 0,
    `paid ${rohitTotals?.totalPaid} entered ${rohitTotals?.totalEntered}`,
  );
  check(
    'member entered total uses Entered-By only',
    prathamTotals?.totalEntered === 9000 && prathamTotals?.totalPaid === 0,
    `paid ${prathamTotals?.totalPaid} entered ${prathamTotals?.totalEntered}`,
  );
  check('other member totals intact', neerajTotals?.totalPaid === 3000 && neerajTotals?.totalEntered === 3000);
  check('nothing auto-created (2 records only)', expenses.length === 2);

  // 6. owner delete works, audited, totals recompute
  await storage.deleteExpense(hotel.id, pratham);
  const afterDelete = await storage.loadExpenses();
  const summaryAfter = buildSummary(afterDelete, members);
  audit = await storage.loadAudit();
  check('delete removes the record', afterDelete.length === 1);
  check('DELETE written to audit history', audit.filter((a) => a.action === 'DELETE').length === 1);
  check('totals recompute after delete', summaryAfter.total === 3000, String(summaryAfter.total));

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('TEST RUNNER ERROR:', err);
  process.exit(1);
});
