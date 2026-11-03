// Прогон всех миграций supabase/*.sql в PGlite с заглушками Supabase и проверка игровых сценариев.
// Запуск: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const migrations = ['schema.sql', ...readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()];
const db = new PGlite();

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create role anon; create role authenticated;
  create publication supabase_realtime;
`);
const load = (f) => readFileSync(`${dir}/${f}`, 'utf8').replace(/create extension[^;]*;/gi, '');
for (const f of migrations) await db.exec(load(f));
// Повторный прогон: миграции должны быть идемпотентными.
for (const f of migrations) await db.exec(load(f));
await db.exec(`
  grant usage on schema public, auth to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

let failures = 0;
const ok = (name) => console.log(`  ok   ${name}`);
const bad = (name, info) => {
  failures += 1;
  console.log(`  FAIL ${name}: ${info}`);
};

async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
async function expectOk(name, uid, sql, params) {
  try {
    const r = await as(uid, sql, params);
    ok(name);
    return r;
  } catch (e) {
    bad(name, e.message);
    return null;
  }
}
async function expectErr(name, uid, sql, params, code) {
  try {
    await as(uid, sql, params);
    bad(name, 'ожидалась ошибка');
  } catch (e) {
    if (code && !e.message.startsWith(code)) bad(name, `другая ошибка: ${e.message}`);
    else ok(`${name} → ${e.message}`);
  }
}
const check = (name, cond, info) => (cond ? ok(name) : bad(name, info));

async function user(email) {
  const r = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  return r.rows[0].id;
}
const admin = await user('superadmin@game.local');
const cap = await user('cap@game.local');
const mem = await user('mem@game.local');
const cur = await user('cur@game.local');

console.log('Подготовка');
const gameId = (await expectOk('start_game', admin, `select public.start_game('Test') as id`)).rows[0].id;
const other = await user('other@game.local');
const t1 = (await as(admin, `insert into teams (game_id, name) values ($1, 'Table 1') returning id`, [gameId])).rows[0].id;
const t2 = (await as(admin, `insert into teams (game_id, name) values ($1, 'Table 2') returning id`, [gameId])).rows[0].id;
await db.query(`update profiles set game_id = $1 where id in ($2, $3, $4)`, [gameId, cap, mem, cur]);
await expectOk('roles and teams', admin, `
  update profiles set team_id = case when id = $5 then $6::uuid else $1::uuid end,
    role = case id when $2 then 'captain' when $4 then 'curator' else 'member' end
  where id in ($2, $3, $4, $5)`, [t1, cap, mem, cur, other, t2]);
await as(mem, `update profiles set role = 'captain' where id = $1`, [mem]);
check('RLS: member cannot change own role', (await db.query(`select role from profiles where id = $1`, [mem])).rows[0].role === 'member');

console.log('Настройки игрока');
await expectOk('set_my_prefs', mem, `select public.set_my_prefs('{"theme":"corp","mode":"dark","lang":"en"}')`);
const prefs = (await db.query(`select prefs from profiles where id = $1`, [mem])).rows[0].prefs;
check('prefs saved', prefs.theme === 'corp' && prefs.lang === 'en' && prefs.mode === 'dark', JSON.stringify(prefs));
await expectErr('invalid prefs', mem, `select public.set_my_prefs('{"lang":"de"}')`, [], 'E_PREFS');

console.log('Доска');
const place = (client, bucket, kam, ssm = null, uid = cap) =>
  as(uid, `select public.set_placement($1, $2, $3, $4, $5)`, [t1, client, bucket, kam, ssm]);
await expectErr('lobby: captain cannot move', cap, `select public.set_placement($1, 'G1', 'active', 1, null)`, [t1], 'E_PHASE_BOARD');
await as(admin, `update games set phase = 'r1p1' where id = $1`, [gameId]);
for (const c of ['G1', 'G2', 'G3', 'G4']) await place(c, 'active', 1);
await expectErr('5th active on KAM 1', cap, `select public.set_placement($1, 'B1', 'active', 1, null)`, [t1], 'E_KAM_ACTIVE_FULL|1|4');
await expectOk('maintenance on KAM 1', cap, `select public.set_placement($1, 'B1', 'maintenance', 1, null)`, [t1]);
await expectErr('2nd maintenance on KAM 1', cap, `select public.set_placement($1, 'B2', 'maintenance', 1, null)`, [t1], 'E_KAM_MAINT_FULL');
await expectErr('member cannot move', mem, `select public.set_placement($1, 'B2', 'active', 2, null)`, [t1], 'E_NO_RIGHTS_BOARD');
await expectOk('SSM on active', cap, `select public.set_placement($1, 'G1', 'active', 1, 1)`, [t1]);
// Без Sales Capacity: все 16 Active и 4 Maintenance помещаются, остальные — в MidMarket.
const codes = (await db.query(`select code from clients order by sort`)).rows.map((r) => r.code);
const free = codes.filter((c) => !['G1', 'G2', 'G3', 'G4', 'B1'].includes(c));
let n = 0;
for (let k = 2; k <= 4; k += 1) {
  for (let i = 0; i < 4; i += 1) await place(free[n++], 'active', k);
  await place(free[n++], 'maintenance', k);
}
while (n < free.length) await place(free[n++], 'midmarket', null);
const placed = (await db.query(`select count(*)::int as n from placements where team_id = $1`, [t1])).rows[0].n;
check('all 26 clients placed without capacity limit', placed === 26, placed);

console.log('Специализации стоят монеты');
await expectErr('spec outside r1p3', cap, `select public.set_kam_spec($1, 1, 'government')`, [t1], 'E_PHASE_SPEC');
await as(admin, `update games set phase = 'r1p3' where id = $1`, [gameId]);
await expectOk('spec government', cap, `select public.set_kam_spec($1, 1, 'government')`, [t1]);
const spent1 = (await db.query(`select public.team_spent($1, '{}'::jsonb) as s`, [t1])).rows[0].s;
check('spec costs 8 coins', Number(spent1) === 8, spent1);
await expectErr('duplicate spec', cap, `select public.set_kam_spec($1, 2, 'government')`, [t1], 'E_SPEC_DUPLICATE');
await expectErr('other_enterprise hidden', cap, `select public.set_kam_spec($1, 2, 'other_enterprise')`, [t1], 'E_SPEC_LOCKED');
await as(admin, `update games set settings = '{"budget": 10}' where id = $1`, [gameId]);
await expectErr('spec over budget', cap, `select public.set_kam_spec($1, 2, 'industrial')`, [t1], 'E_BUDGET|8|10|8');
await as(admin, `update games set settings = '{}' where id = $1`, [gameId]);

console.log('Покупки без подтверждения');
await expectOk('captain buys hint directly', cap, `select public.create_purchase($1, 'HINT1', array['g1'], '', null)`, [t1]);
const h = (await db.query(`select status, targets from purchases where team_id = $1 and item = 'HINT1'`, [t1])).rows[0];
check('purchase approved immediately', h.status === 'approved' && h.targets[0] === 'G1', JSON.stringify(h));
check('member sees bought hint', (await as(mem, `select client_code from client_hints`)).rows.length === 1);
check('other table sees nothing', (await as(other, `select * from client_hints`)).rows.length === 0);
check('curator sees all hints', (await as(cur, `select count(*)::int as n from client_hints`)).rows[0].n === 52);
await expectErr('member cannot buy', mem, `select public.create_purchase($1, 'HINT1', array['G2'], '', null)`, [t1], 'E_NO_RIGHTS_PURCHASE');
await expectErr('duplicate hint', cap, `select public.create_purchase($1, 'HINT1', array['G1'], '', null)`, [t1], 'E_ALREADY_BOUGHT');
await expectErr('hint2 before hint1', cap, `select public.create_purchase($1, 'HINT2', array['B1'], '', null)`, [t1], 'E_HINT2_ORDER');
await expectOk('hint2 after hint1', cap, `select public.create_purchase($1, 'HINT2', array['G1'], '', null)`, [t1]);
const decideGone = (await db.query(`select count(*)::int as n from pg_proc where proname = 'decide_purchase'`)).rows[0].n;
check('decide_purchase removed', decideGone === 0, decideGone);

await expectOk('curator sells consult', cur, `select public.create_purchase($1, 'CONSULT', '{}', '', null)`, [t1]);
await expectOk('spec other_enterprise after consult', cap, `select public.set_kam_spec($1, 2, 'other_enterprise')`, [t1]);
await expectErr('cancel consult while OE spec', cur, `select public.cancel_purchase((select id from purchases where item = 'CONSULT'), 'ошибка')`, [], 'E_CANCEL_CONSULT_SPEC');
await expectErr('captain cannot cancel', cap, `select public.cancel_purchase((select id from purchases where item = 'HINT2'), 'ошибка')`, [], 'E_NO_RIGHTS_CANCEL');

await expectErr('marketing in r1p3', cap, `select public.create_purchase($1, 'M1', array['G1'], 'доступ', null)`, [t1], 'E_PHASE_PURCHASE');
await as(admin, `update games set phase = 'r2p1' where id = $1`, [gameId]);
await expectErr('marketing without justification', cap, `select public.create_purchase($1, 'M1', array['G1'], '', null)`, [t1], 'E_JUSTIFICATION');
await expectErr('too many targets', cap, `select public.create_purchase($1, 'M5', array['G1','G2'], 'x x x', null)`, [t1], 'E_TOO_MANY_TARGETS|1');
await expectOk('M6 expo 10', cap, `select public.create_purchase($1, 'M6', '{}', 'бренд', null)`, [t1]);
await expectOk('M7 conf 8', cap, `select public.create_purchase($1, 'M7', '{}', 'бренд', null)`, [t1]);
await expectErr('marketing cap 20', cap, `select public.create_purchase($1, 'M1', array['G1'], 'доступ', null)`, [t1], 'E_CAT_LIMIT|18|20|6');

console.log('Общий бюджет учитывает специализации');
// Потрачено: 2 спец. × 8 + H1 + H2 + CONSULT + 10 + 8 = 37.
const spent = Number((await db.query(`select public.team_spent($1, '{}'::jsonb) as s`, [t1])).rows[0].s);
check('team_spent = 37', spent === 37, spent);
await as(admin, `update games set settings = '{"budget": 38}' where id = $1`, [gameId]);
await expectErr('budget includes specs', cur, `select public.create_purchase($1, 'H5', array['T1'], 'замена', null)`, [t1], 'E_BUDGET|37|38|3');
await as(admin, `update games set settings = '{}' where id = $1`, [gameId]);

console.log('HQ и встречи');
await as(admin, `update games set phase = 'r2p2' where id = $1`, [gameId]);
const reqId = (await expectOk('HQ request', cap, `select public.create_hq_request($1, 'Playbook', 'нет экспертизы', array['g1'], 1) as id`, [t1])).rows[0].id;
await expectErr('buy unpriced', cap, `select public.create_purchase($1, 'REQ', '{}', 'для G1', $2)`, [t1, reqId], 'E_REQ_NOT_PRICED');
await expectErr('captain cannot price', cap, `select public.price_hq_request($1, 8)`, [reqId], 'E_REQ_PRICE_RIGHTS');
await expectOk('curator prices', cur, `select public.price_hq_request($1, 8)`, [reqId]);
await expectOk('captain buys request', cap, `select public.create_purchase($1, 'REQ', '{}', 'для G1', $2)`, [t1, reqId]);
await expectErr('request bought twice', cap, `select public.create_purchase($1, 'REQ', '{}', 'для G1', $2)`, [t1, reqId], 'E_REQ_BOUGHT');
await expectErr('captain cannot set meeting', cap, `select public.set_meeting_result($1, 'G1', 'qualified', 1, '', '')`, [t1], 'E_MEETING_RIGHTS');
await expectOk('curator sets meeting', cur, `select public.set_meeting_result($1, 'g1', 'strategic', 150000, 'a', 'b')`, [t1]);

console.log('Прочее');
await expectOk('split_evenly keeps curator', admin, `select public.split_evenly()`);
const curRow = (await db.query(`select team_id, role from profiles where id = $1`, [cur])).rows[0];
check('curator untouched', curRow.team_id === t1 && curRow.role === 'curator', JSON.stringify(curRow));
const audit = (await db.query(`select distinct action from audit_log`)).rows.map((r) => r.action);
check('audit covers actions', ['placement_set', 'purchase_approved', 'phase_changed', 'meeting_set', 'kam_spec_set'].every((a) => audit.includes(a)), audit.join(','));
const direct = await as(cap, `insert into purchases (team_id, item, category, cost, status) values ($1, 'M1', 'marketing', 0, 'approved')`, [t1])
  .then(() => 'inserted')
  .catch((e) => e.message);
check('direct insert blocked by RLS', direct !== 'inserted', direct);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
