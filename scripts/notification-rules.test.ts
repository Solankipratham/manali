/**
 * Parses the notification migration with libpg-query (the actual PostgreSQL
 * parser) so a syntax error is caught here instead of in the Supabase SQL
 * Editor.
 *
 * Run:  npm run test:sql
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// esbuild rewrites import.meta.url to the bundle location, so resolve from
// the working directory instead (npm scripts run from the project root).
const root = process.cwd();

const results: { check: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = '') =>
  results.push({ check: name, ok, detail });

async function main() {
  const mod = (await import('pgsql-parser')) as {
    parseQuery?: (sql: string) => unknown;
    default?: { parseQuery?: (sql: string) => unknown };
    parse?: (sql: string) => unknown;
  };
  const parse =
    mod.parseQuery ?? mod.default?.parseQuery ?? (mod as { parse?: (s: string) => unknown }).parse;

  if (typeof parse !== 'function') {
    console.error('pgsql-parser did not expose a parse function. Keys:', Object.keys(mod));
    process.exit(2);
  }

  const files = [
    'supabase/migrations/0001_tripkhata_schema.sql',
    'supabase/migrations/0002_trip_notifications.sql',
  ];

  let stmtCount = 0;
  for (const rel of files) {
    const sql = readFileSync(join(root, rel), 'utf8');
    let stmts: unknown[] = [];
    let err: unknown = null;
    try {
      const out = await parse(sql);
      stmts = Array.isArray(out) ? out : ((out as { stmts?: unknown[] })?.stmts ?? []);
    } catch (e) {
      err = e;
    }
    check(`${rel} parses`, !err, err ? String(err).slice(0, 400) : `${stmts.length} statements`);
    stmtCount += stmts.length;
  }

  // --- semantic assertions on the notification migration ---
  const sql = readFileSync(join(root, 'supabase/migrations/0002_trip_notifications.sql'), 'utf8');
  const lower = sql.toLowerCase();

  check(
    'trip_members has every required column',
    ['id', 'trip_id', 'member_name', 'email', 'user_id', 'email_notifications_enabled', 'created_at'].every(
      (c) => new RegExp(`\\b${c}\\b`).test(sql),
    ),
  );
  check(
    'notification_log has delivery tracking columns',
    ['expense_id', 'recipient_email', 'delivery_status', 'provider_message_id', 'error_message', 'sent_at'].every(
      (c) => new RegExp(`\\b${c}\\b`).test(sql),
    ),
  );
  check(
    'duplicate protection: unique (expense_id, recipient_email)',
    /unique\s*\(\s*expense_id\s*,\s*recipient_email\s*\)/i.test(sql),
  );
  check(
    'duplicate protection: unique (expense_id) on outbox',
    /unique\s*\(\s*expense_id\s*\)/i.test(sql),
  );
  check(
    'trigger fires AFTER INSERT on expenses',
    /after\s+insert\s+on\s+public\.expenses/i.test(sql),
  );
  check('outbox table created', /create table if not exists public\.notification_outbox/i.test(sql));
  check('RLS enabled on all 4 new tables', (lower.match(/enable row level security/g) ?? []).length === 4);
  check(
    'no anon SELECT policy on trip_members (emails stay server-side)',
    !/create policy[^;]*on\s+public\.trip_members[^;]*for\s+select/i.test(sql),
  );
  check(
    'no email addresses hardcoded in SQL',
    !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql.replace(/--[^\n]*/g, '')),
  );
  check('uses pg_net via resilient wrapper', /notify_http_post/.test(sql));
  check('atomic claim uses FOR UPDATE SKIP LOCKED', /for\s+update\s+skip\s+locked/i.test(sql));

  // --- Edge Function assertions ---
  const fn = readFileSync(
    join(root, 'supabase/functions/notify-new-expense/index.ts'),
    'utf8',
  );
  check(
    'Edge Function subject is exact',
    fn.includes('New Transaction Added – Manali TripKhata'),
  );
  const requiredFields = [
    'title',
    'amount',
    'category',
    'description',
    'Paid by',
    'Added by',
    'payment_method',
    'expense_date',
    'tripTotal',
    'reportUrl',
  ];
  check(
    'email includes every required field',
    requiredFields.every((f) => fn.includes(f)),
    requiredFields.filter((f) => !fn.includes(f)).join(',') || 'all present',
  );
  check(
    'recipients come from trip_members, not hardcoded',
    /trip_members\?select=/.test(fn) && !/@gmail\.com|@example\.com/.test(fn),
  );
  check('Resend called via env key only', fn.includes('api.resend.com') && /RESEND_API_KEY/.test(fn));
  check(
    'no publishable/secret Supabase key literal in function',
    !/sb_publishable_|sb_secret_/.test(fn),
  );
  check(
    'per-recipient failures isolated (loop never aborts on one failure)',
    /for \(const r of recipients\)/.test(fn) && /failed\+\+/.test(fn),
  );
  check(
    'internal secret header verified',
    fn.includes('x-notify-secret') && fn.includes('unauthorized'),
  );

  // --- report deep-link ---
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  check('frontend honours ?report=1 deep-link', app.includes("get('report') === '1'"));

  // --- output ---
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`(parsed ${stmtCount} SQL statements across ${files.length} migrations)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
