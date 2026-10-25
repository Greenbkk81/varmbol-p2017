import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const resolve = createRequire(import.meta.url).resolve;

const output = mkdtempSync(path.join(tmpdir(), 'varmbol-cup-'));
execFileSync(process.execPath, [resolve('typescript/bin/tsc'),
  'src/lib/cup-plan.ts', 'src/lib/match-engine.ts', '--outDir', output,
  '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--strict',
], { cwd: fileURLToPath(new URL('..', import.meta.url)) });
after(() => rmSync(output, { recursive: true, force: true }));
const { buildCupSetup, CUP_MATCHES, INITIAL_CUP_SETUP, upgradeCupDuration } = (await import(pathToFileURL(path.join(output, 'cup-plan.js')))).default;
const { DEFAULT_ROSTER } = (await import(pathToFileURL(path.join(output, 'default-roster.js')))).default;
const { createInitialMatchState, suggestSubstitutions, executeMultiSubstitution, undoLastAction, getCurrentPeriodElapsedMs, computePlayerMetrics } = (await import(pathToFileURL(path.join(output, 'match-engine.js')))).default;
const create = (setup) => createInitialMatchState(setup.roster, setup.config, setup.pitchIds, setup.goalkeeperId);

test('first match follows the handwritten plan in every position', () => {
  const match = create(INITIAL_CUP_SETUP);
  assert.deepEqual(match.players.filter(p => p.onPitch).sort((a, b) => a.pitchSlotIndex - b.pitchSlotIndex).map(p => p.name),
    ['Oscar', 'Oliver', 'Edvin', 'Scott', 'Holger', 'Gabriel', 'Abdullahi']);
  assert.deepEqual(match.players.filter(p => !p.onPitch).map(p => p.name).sort(), ['Charlie', 'Ebbe', 'Kasper']);
});

test('all four fixtures have the correct time, opponent, venue and goalkeeper', () => {
  assert.deepEqual(CUP_MATCHES.map(m => [m.kickoff, m.opponent, m.location, m.goalkeeperId]), [
    ['09.30', 'Söderköping', 'Borta', 'p-oscar'],
    ['10.30', 'Västerhaninge', 'Hemma', 'p-scott'],
    ['12.00', 'Ekängen', 'Borta', 'p-holger'],
    ['14.00', 'Svärtinge', 'Hemma', 'p-edvin'],
  ]);
  for (const fixture of CUP_MATCHES) {
    const match = create(buildCupSetup(fixture, DEFAULT_ROSTER));
    assert.equal(match.players.length, 10);
    assert.equal(match.players.filter(p => p.onPitch).length, 7);
    assert.deepEqual(match.players.filter(p => p.isGoalkeeper).map(p => p.id), [fixture.goalkeeperId]);
    assert.deepEqual(match.players.filter(p => p.onPitch).map(p => p.pitchSlotIndex).sort(), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(match.config.periods * match.config.periodMinutes, 25);
  }
});

test('repeated outfield substitutions keep each planned goalkeeper for the full 25-minute match', () => {
  for (const fixture of CUP_MATCHES) {
    let match = create(buildCupSetup(fixture, DEFAULT_ROSTER));
    match = { ...match, status: 'running', lastTickTimestamp: 1000 };
    for (let minute = 5; minute <= 25; minute += 5) {
      const now = 1000 + minute * 60000;
      const suggestion = suggestSubstitutions(match, now, 3);
      assert.equal(suggestion.outIds.includes(fixture.goalkeeperId), false);
      assert.equal(suggestion.inIds.length, 3);
      match = executeMultiSubstitution(match, suggestion.outIds, suggestion.inIds, now);
      assert.deepEqual(match.players.filter(p => p.isGoalkeeper).map(p => p.id), [fixture.goalkeeperId]);
      assert.equal(match.players.filter(p => p.onPitch).length, 7);
    }
  }
});

test('a saved roster keeps custom players and manually added Charlie without duplicates', () => {
  const old = DEFAULT_ROSTER.filter(p => !['p-charlie', 'p-ebbe'].includes(p.id)).map(p => ({ ...p }));
  old.push({ id: 'custom-charlie', name: 'Charlie', number: '22', activeInSquad: true });
  old.push({ id: 'custom-player', name: 'Test', activeInSquad: true });
  const before = JSON.stringify(old);
  const setup = buildCupSetup(CUP_MATCHES[0], old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(setup.roster.filter(p => p.name === 'Charlie').length, 1);
  assert.equal(setup.roster.find(p => p.id === 'custom-charlie').activeInSquad, true);
  assert.equal(setup.roster.find(p => p.id === 'custom-player').activeInSquad, false);
  assert.equal(setup.roster.filter(p => p.activeInSquad).length, 10);
});

test('starter order is respected independently of roster order for other formations', () => {
  const ids = ['p-oscar', 'p-scott', 'p-gabriel', 'p-oliver', 'p-holger'];
  const match = createInitialMatchState(DEFAULT_ROSTER, { ...INITIAL_CUP_SETUP.config, format: '5v5', formation: '2-2' }, ids, 'p-oscar');
  assert.deepEqual(match.players.filter(p => p.onPitch).sort((a, b) => a.pitchSlotIndex - b.pitchSlotIndex).map(p => p.id), ids);
});

test('undoing a substitution while clock is running preserves elapsed match and player time', () => {
  let match = create(INITIAL_CUP_SETUP);
  match = { ...match, status: 'running', lastTickTimestamp: 1000 };
  const subTime = 1000 + 5 * 60_000; // 5:00 into Period 1
  const suggestion = suggestSubstitutions(match, subTime, 3);
  const afterSub = executeMultiSubstitution(match, suggestion.outIds, suggestion.inIds, subTime);
  const undoTime = subTime + 3000; // 5:03 into Period 1
  const undone = undoLastAction(afterSub, undoTime);
  assert.equal(getCurrentPeriodElapsedMs(undone, undoTime), 5 * 60_000);
  const metrics = computePlayerMetrics(undone, undoTime);
  const oliver = metrics.find(m => m.player.id === 'p-oliver');
  assert.equal(oliver.outfieldMs, 5 * 60_000);
});

test('pre-kickoff swap at 0:00 edits starting lineup cleanly without logging a substitution', () => {
  let match = create(INITIAL_CUP_SETUP);
  match = executeMultiSubstitution(match, ['p-oliver'], ['p-charlie'], 1000);
  const oliver = match.players.find(p => p.id === 'p-oliver');
  const charlie = match.players.find(p => p.id === 'p-charlie');
  assert.equal(oliver.onPitch, false);
  assert.equal(oliver.stintsCount, 0);
  assert.equal(charlie.onPitch, true);
  assert.equal(charlie.pitchSlotIndex, 1);
  assert.equal(charlie.stintsCount, 1);
  assert.equal(match.logs.length, 0);
});

test('resting bench players are skipped by suggestSubstitutions', () => {
  let match = create(INITIAL_CUP_SETUP);
  match = {
    ...match,
    status: 'running',
    lastTickTimestamp: 1000,
    players: match.players.map(p => p.id === 'p-charlie' ? { ...p, resting: true } : p),
  };
  const suggestion = suggestSubstitutions(match, 1000 + 5 * 60_000, 3);
  assert.equal(suggestion.inIds.includes('p-charlie'), false);
  assert.equal(suggestion.inIds.length, 2);
});


test('saved cup duration updates without resetting running clock or player statistics', () => {
  const original = create(INITIAL_CUP_SETUP);
  const saved = { ...original, config: { ...original.config, periods: 2, periodMinutes: 15 }, status: 'running', currentPeriod: 2, periodElapsedMs: 120000, lastTickTimestamp: 1000,
    goals: [{ id: 'goal', period: 2, matchTimeMs: 16 * 60000 }],
    undoStack: [{ ...original, label: 'Byte', currentPeriod: 2 }] };
  const upgraded = upgradeCupDuration(saved);
  assert.equal(upgraded.config.periodMinutes, 25);
  assert.equal(upgraded.config.periods, 1);
  assert.equal(upgraded.currentPeriod, 1);
  assert.equal(upgraded.periodElapsedMs, 17 * 60000);
  assert.equal(upgraded.lastTickTimestamp, saved.lastTickTimestamp);
  assert.equal(upgraded.goals[0].matchTimeMs, 16 * 60000);
  assert.equal(upgraded.goals[0].period, 1);
  assert.deepEqual(computePlayerMetrics(upgraded, 2000).map(p => [p.totalPlayMs, p.benchMs, p.currentStintMs]),
    computePlayerMetrics(saved, 2000).map(p => [p.totalPlayMs, p.benchMs, p.currentStintMs]));
  assert.equal(upgraded.undoStack[0].currentPeriod, 1);
  assert.equal(upgraded.undoStack[0].periodElapsedMs, 15 * 60000);
  assert.equal(upgraded.undoStack[0].players[0].currentStintStartMatchMs, 0);
  assert.equal(upgradeCupDuration(upgraded), upgraded);
  assert.equal(upgradeCupDuration({ ...saved, status: 'finished' }).config.periodMinutes, 15);
  assert.equal(upgradeCupDuration({ ...saved, config: { ...saved.config, eventTitle: 'Annan match' } }).config.periodMinutes, 15);
});

test('first period and halftime saves retain elapsed time and become a single period', () => {
  for (const minutes of [15, 25]) {
    const original = create(INITIAL_CUP_SETUP);
    const saved = { ...original, config: { ...original.config, periods: 2, periodMinutes: minutes }, periodElapsedMs: 300000 };
    assert.equal(upgradeCupDuration(saved).periodElapsedMs, 300000);
    const halftime = upgradeCupDuration({ ...saved, status: 'period_break', currentPeriod: 2, periodElapsedMs: 0 });
    assert.equal(halftime.status, 'paused');
    assert.equal(halftime.currentPeriod, 1);
    assert.equal(halftime.periodElapsedMs, minutes * 60000);
    assert.equal(halftime.config.periods, 1);
  }
});
