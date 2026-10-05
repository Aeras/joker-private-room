import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET } from '@/domain/controller';
import type { CanonicalGameState } from '@/domain/gameState';
import { reconciliationFixture } from './fixtures/reconciliationGame';

const TOKEN = '00000000-0000-4000-8000-000000000205';
const CLAIM = '00000000-0000-4000-8000-000000000206';
let handler: (request: Request) => Promise<Response>;
let state: CanonicalGameState;
let consumed = false;
let claimed = false;
let failPersist = false;
let finalized = 0;
let releases = 0;
const commands: string[] = [];
const versions: number[] = [];
const actionIds = new Set<string>();
const directory = mkdtempSync(join(tmpdir(), 'jk002-bundle-'));

function reset() {
  state = reconciliationFixture(); consumed = false; claimed = false; failPersist = false;
  finalized = 0; releases = 0; commands.length = 0; versions.length = 0; actionIds.clear();
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'consume_game_reconciler_invocation_internal') {
    const valid = args['p_token'] === TOKEN && !consumed;
    if (valid) consumed = true;
    return { data: valid, error: null };
  }
  if (name === 'claim_due_games_for_reconciliation_internal') {
    if (claimed || state.lifecycle === 'complete') return { data: [], error: null };
    claimed = true;
    return { data: [{ gameId: state.gameId, stateVersion: state.stateVersion, claimToken: CLAIM, claimUntil: new Date(Date.now() + 60000).toISOString() }], error: null };
  }
  if (name === 'release_game_reconciliation_claim_internal') {
    claimed = false; releases++; return { data: true, error: null };
  }
  expect(args['p_claim_token']).toBe(CLAIM);
  if (name === 'load_game_state_for_reconciliation_internal') return { data: { ok: true, gameId: state.gameId, stateVersion: state.stateVersion, canonicalState: structuredClone(state) }, error: null };
  if (failPersist) throw new Error('Injected worker crash before commit');
  if (args['p_expected_state_version'] !== state.stateVersion) return { data: { ok: false, code: 'STALE_STATE', currentStateVersion: state.stateVersion }, error: null };
  const next = args['p_new_state'] as CanonicalGameState;
  expect(next.stateVersion).toBe(state.stateVersion + 1);
  expect(actionIds.has(String(args['p_action_id']))).toBe(false);
  actionIds.add(String(args['p_action_id']));
  if (name === 'finalize_game_for_reconciliation_internal') finalized++;
  commands.push(String(args['p_command_type'] ?? 'finalize_game'));
  state = structuredClone(next); versions.push(state.stateVersion);
  return { data: { ok: true, gameId: state.gameId, stateVersion: state.stateVersion, lifecycle: state.lifecycle, replayed: false }, error: null };
}
async function invoke(token = TOKEN) {
  const response = await handler(new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invocationToken: token }) }));
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  execFileSync('node', ['scripts/build-reconciler.mjs', directory], { stdio: 'pipe' });
  const original = readFileSync(join(directory, 'index.js'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  expect(manifest.bundleSha256).toBe(createHash('sha256').update(original).digest('hex'));
  const map = JSON.parse(readFileSync(join(directory, 'index.js.map'), 'utf8'));
  for (const required of ['src/server/reconciliationCore.ts', 'src/bots/strategy.ts', 'src/domain/gameLifecycle.ts', 'src/domain/projection.ts']) {
    const i = map.sources.findIndex((path: string) => path.replaceAll('\\', '/').endsWith(required));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(map.sourcesContent[i].replace(/\r\n/g, '\n')).toBe(readFileSync(required, 'utf8').replace(/\r\n/g, '\n'));
  }
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('__jk002CreateClient', () => ({ rpc }));
  vi.stubGlobal('Deno', { env: { get: () => 'test-only' }, serve: (callback: typeof handler) => { handler = callback; } });
  const executable = original.replace(/import\s*['"]jsr:@supabase\/functions-js\/edge-runtime.d.ts['"];?/, '').replace(/import\s*\{\s*createClient\s*\}\s*from\s*['"]jsr:@supabase\/supabase-js@2['"];?/, 'const createClient = globalThis.__jk002CreateClient;');
  new Function(executable)();
}, 30000);
afterAll(() => { vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });

describe('JK-002 executable deployment artifact', () => {
  it('rejects missing/invalid and replayed invocation tokens before work', async () => {
    reset();
    expect((await invoke('invalid')).status).toBe(401);
    expect(claimed).toBe(false);
    expect((await invoke()).status).toBe(200);
    expect((await invoke()).status).toBe(401);
    expect(releases).toBe(1);
  });

  it('takes over an overdue human and exposes each automatic action as a separate worker tick', async () => {
    reset();
    for (const seat of state.seats) { seat.owner = { type: 'human', playerId: `human-${seat.seatIndex}` }; seat.controller = 'human'; }
    const actor = state.progression.currentActorSeat!;
    state.timing.currentHumanDeadline = new Date(Date.now() - 1000).toISOString();

    const takeover = await invoke();
    expect(takeover.body.results[0]).toMatchObject({ ok: true, steps: 1, stopReason: 'STEP_BOUND' });
    expect(state.seats[actor].controller).toBe('temporary_bot');
    expect(commands).toEqual(['system_timeout_takeover']);

    consumed = false;
    const botPlay = await invoke();
    expect(botPlay.body.results[0]).toMatchObject({ ok: true, steps: 1, stopReason: 'STEP_BOUND' });
    expect(commands).toEqual(['system_timeout_takeover', 'bot_declare']);
    expect(Date.parse(state.timing.currentHumanDeadline!)).toBeGreaterThan(Date.now());

    const version = state.stateVersion;
    consumed = false;
    expect((await invoke()).body.results[0]).toMatchObject({ steps: 0, stopReason: 'HUMAN_INPUT' });
    expect(state.stateVersion).toBe(version);
    expect(JSON.stringify(takeover.body)).not.toMatch(/canonicalState|hands|serverEntropySeed|deck/);
  });

  for (const rulesetId of ['popular', 'classic', 'minus', 'panagiotis'] as const) {
    it('finishes all 24 deals across presentation-safe browser-free ticks and finalizes exactly once: ' + rulesetId, async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
      try {
        reset(); state = reconciliationFixture(rulesetId, rulesetId === 'panagiotis');
        let ticks = 0; let bounded = 0; let presentationFallbacks = 0;
        while (state.lifecycle !== 'complete' && ticks++ < 2000) {
          consumed = false;
          const result = await invoke();
          expect(result.status).toBe(200);
          expect(result.body.results[0].ok).toBe(true);
          expect(result.body.results[0].steps).toBeLessThanOrEqual(PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET);
          if (result.body.results[0].stopReason === 'STEP_BOUND') bounded++;
          if (result.body.results[0].stopReason === 'PRESENTATION_BARRIER') {
            const readyAt = state.timing.presentationReadyAt;
            expect(readyAt).toBeTruthy();
            presentationFallbacks++;
            vi.setSystemTime(new Date(Date.parse(readyAt!) + 1));
          }
        }
        expect(state.lifecycle).toBe('complete');
        expect(state.score.completedDeals).toHaveLength(24);
        expect(state.score.roundPremia).toHaveLength(4);
        expect(state.score.finalPlacements.every(p => p !== null)).toBe(true);
        expect(finalized).toBe(1); expect(bounded).toBeGreaterThan(0);
        if (rulesetId === 'panagiotis') expect(presentationFallbacks).toBeGreaterThan(0);
        expect(commands).toContain('settle_deal'); expect(commands).toContain('settle_round');
        expect(versions.every((v, i) => i === 0 || v === versions[i - 1]! + 1)).toBe(true);
        consumed = false; expect((await invoke()).body.claimed).toBe(0); expect(finalized).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    }, 30000);
  }

  it('releases claims after a crash and retries without changing the internal action identity', async () => {
    reset();
    const initialVersion = state.stateVersion;
    failPersist = true;
    const failed = await invoke();
    expect(failed.body.results[0]).toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE' });
    expect(state.stateVersion).toBe(initialVersion); expect(releases).toBe(1); expect(claimed).toBe(false);
    failPersist = false; consumed = false;
    expect((await invoke()).body.results[0].ok).toBe(true);
    expect(state.stateVersion).toBeGreaterThan(initialVersion);
  });
});