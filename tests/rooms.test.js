const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const S = loadTS('src/ts/room_state.ts');
const { hostPatch, buzzPatch, canBuzz, buzzReason, actionReason, availableActions, materialize, stateLine, formatSeconds, formatClock, teamClass, sentenceCase, timedPhase, clockRunning } = S;

const ANN = { uid: 'a1', team: 'A', name: 'Ann' };
const BEN = { uid: 'b1', team: 'B', name: 'Ben' };
const CAL = { uid: 'c1', team: 'C', name: 'Cal' };

function base(settings = {}, extra = {}) {
  return {
    hostUid: 'host', status: 'lobby', currentIndex: 0, currentBuzz: null, timers: null, lockoutTeams: [],
    scores: { A: 0, B: 0 }, bonusTeam: 'A', settings: { nsbRules: true, teamCount: 2, halfMinutes: 8, ...settings }, ...extra
  };
}

// Apply a host action the way the store does, with server time faked as `now`.
function act(room, action, options = {}, now = 1000) {
  return { ...room, ...materialize(hostPatch(room, 'host', action, options, now), now) };
}

function buzz(room, player, now = 1500) {
  return { ...room, ...buzzPatch(room, player, now) };
}

function reading(room = base()) {
  return act(room, 'tossup_start');
}

test('start opens reading with no timer; a buzz during reading is recorded as an interrupt', () => {
  const room = reading();
  assert.equal(room.status, 'tossup_reading');
  assert.equal(room.timers, null);
  assert.equal(room.currentIndex, 1);
  assert.equal(canBuzz(room, ANN, 1100), true);
  const locked = buzz(room, BEN, 1100);
  assert.equal(locked.status, 'tossup_locked');
  assert.equal(locked.currentBuzz.interrupt, true);
  assert.equal(locked.currentBuzz.team, 'B');
});

test('done reading starts the 5 s answer timer; a buzz after it runs out is refused', () => {
  const room = act(reading(), 'done_reading', {}, 2000);
  assert.equal(room.status, 'tossup_open');
  assert.equal(room.timers.phaseDuration, 5);
  assert.equal(room.timers.phaseStartedAt, 2000);
  assert.equal(canBuzz(room, ANN, 6999), true);
  assert.equal(buzzReason(room, ANN, 7000), 'Time is up.');
  assert.equal(buzz(room, ANN, 6500).currentBuzz.interrupt, false);
});

test('interrupt answered incorrectly with two teams: opponent gets 4, re-read, interrupter locked out', () => {
  let room = reading();
  room = buzz(room, BEN, 1100);
  room = act(room, 'tossup_grade_incorrect', {}, 1200);
  assert.deepEqual(room.scores, { A: 4, B: 0 });
  assert.equal(room.status, 'tossup_reading');
  assert.equal(room.timers, null);
  assert.equal(room.currentBuzz, null);
  assert.deepEqual(room.lockoutTeams, ['B']);
  assert.match(buzzReason(room, BEN, 1300), /locked out/);
  assert.equal(canBuzz(room, ANN, 1300), true);
  assert.equal(room.stats.player.b1.interrupt, 1);
});

test('interrupt answered incorrectly with three teams costs the interrupter 4 points', () => {
  let room = base({ teamCount: 3 }, { scores: { A: 0, B: 0, C: 0 } });
  room = reading(room);
  room = buzz(room, BEN, 1100);
  room = act(room, 'tossup_grade_incorrect', {}, 1200);
  assert.deepEqual(room.scores, { A: 0, B: -4, C: 0 });
  assert.equal(room.status, 'tossup_reading');
  assert.deepEqual(room.lockoutTeams, ['B']);
});

test('ordinary incorrect answer: no penalty, team locked out, others get a fresh 5 s', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2500);
  room = act(room, 'tossup_grade_incorrect', {}, 3000);
  assert.deepEqual(room.scores, { A: 0, B: 0 });
  assert.equal(room.status, 'tossup_open');
  assert.equal(room.timers.phaseStartedAt, 3000);
  assert.equal(room.timers.phaseDuration, 5);
  assert.deepEqual(room.lockoutTeams, ['A']);
  assert.match(buzzReason(room, ANN, 3100), /locked out/);
  assert.equal(canBuzz(room, BEN, 3100), true);
  assert.equal(buzzReason(room, BEN, 8001), 'Time is up.');
});

test('when every team has been locked out the toss-up goes dead', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2500);
  room = act(room, 'tossup_grade_incorrect', {}, 3000);
  room = buzz(room, BEN, 3500);
  room = act(room, 'tossup_grade_incorrect', {}, 4000);
  assert.equal(room.status, 'tossup_dead');
  assert.equal(room.timers, null);
});

test('start, next and dead are refused while a buzz is ungraded; grading is still allowed', () => {
  const locked = buzz(act(reading(), 'done_reading', {}, 2000), ANN, 2500);
  for (const action of ['tossup_start', 'next_tossup', 'tossup_dead', 'done_reading']) {
    assert.match(actionReason(locked, action), /Ann|Grade/, action);
    assert.throws(() => hostPatch(locked, 'host', action), /./, action);
  }
  assert.equal(actionReason(locked, 'tossup_grade_correct'), '');
  assert.equal(actionReason(locked, 'tossup_grade_incorrect'), '');
});

test('availableActions reflects the phase', () => {
  const lobby = availableActions(base());
  assert.equal(lobby.tossup_start.ok, true);
  assert.equal(lobby.next_tossup.ok, true);
  assert.equal(lobby.done_reading.ok, false);
  assert.equal(lobby.tossup_grade_correct.ok, false);
  assert.equal(lobby.tossup_grade_correct.reason, 'There is no toss-up buzz to grade.');
  assert.equal(lobby.game_pause.ok, false);
  assert.equal(lobby.game_start.ok, true);
  assert.equal(lobby.end_game.ok, true);

  const locked = availableActions(buzz(reading(), ANN, 1100));
  assert.equal(locked.tossup_start.ok, false);
  assert.equal(locked.tossup_grade_correct.ok, true);
  assert.equal(locked.tossup_grade_incorrect.ok, true);
  assert.equal(locked.adjust_score.ok, true);
  assert.equal(locked.end_game.ok, true);
});

test('adjust_score corrects a team score in any live state and rejects bad input', () => {
  let room = buzz(reading(), ANN, 1100);
  room = act(room, 'adjust_score', { team: 'B', delta: -4 });
  assert.equal(room.scores.B, -4);
  assert.equal(room.status, 'tossup_locked');
  assert.match(actionReason(room, 'adjust_score', { team: 'B', delta: 0 }), /whole number/);
  assert.match(actionReason(room, 'adjust_score', { team: 'Z', delta: 1 }), /Choose a team/);
  assert.match(actionReason(room, 'adjust_score', { team: 'A', delta: 1000 }), /whole number/);
  assert.throws(() => hostPatch(room, 'host', 'adjust_score', { team: 'A', delta: 1.5 }), /whole number/);
});

test('end game pauses the clock, keeps the remaining time, and blocks play but not corrections', () => {
  let room = act(base(), 'game_start', {}, 1000);
  room = act(room, 'end_game', { elapsedMs: 30000 }, 31000);
  assert.equal(room.status, 'ended');
  assert.equal(room.gameClock.status, 'paused');
  assert.equal(room.gameClock.remainingMs, 450000);
  assert.match(actionReason(room, 'tossup_start'), /game has ended/);
  assert.match(actionReason(room, 'game_start'), /game has ended/);
  assert.equal(actionReason(room, 'adjust_score', { team: 'A', delta: 1 }), '');
  assert.equal(room.log.at(-1).details.startsWith('Game over.'), true);
});

test('correct toss-up goes to bonus; bonus timer is 20 s; a bonus buzz goes to the bonus team only', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2500);
  room = act(room, 'tossup_grade_correct', {}, 2600);
  assert.equal(room.scores.A, 4);
  assert.equal(room.status, 'bonus_ready');
  assert.equal(room.bonusTeam, 'A');
  assert.match(actionReason(room, 'bonus_start', {}), /^$/);
  room = act(room, 'bonus_start', { team: 'A' }, 3000);
  assert.equal(room.status, 'bonus_open');
  assert.equal(room.timers.phaseDuration, 20);
  assert.match(buzzReason(room, BEN, 3100), /belongs to Team A/);
  room = buzz(room, ANN, 3500);
  assert.equal(room.status, 'bonus_locked');
  room = act(room, 'bonus_correct', {}, 3600);
  assert.equal(room.scores.A, 14);
  assert.equal(room.status, 'between');
  assert.equal(room.log.at(-1).details, 'Team A bonus correct, +10');
  room = act(room, 'tossup_start', {}, 3700);
  assert.equal(room.status, 'tossup_reading');
  assert.equal(room.currentIndex, 2);
});

test('incorrect bonus adds nothing and returns to between; bonus can be graded before its timer', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2300);
  room = act(room, 'tossup_grade_correct', {}, 2400);
  room = act(room, 'bonus_wrong', {}, 2500);
  assert.equal(room.scores.A, 4);
  assert.equal(room.status, 'between');
  assert.equal(room.log.at(-1).details, 'Team A bonus incorrect');
});

test('bonus expiry is written once per phase and ignored for stale keys', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2050);
  room = act(room, 'tossup_grade_correct', {}, 2100);
  room = act(room, 'bonus_start', { team: 'A' }, 3000);
  assert.deepEqual(hostPatch(room, 'host', 'expire', { phaseKey: 'stale' }, 9000), {});
  const expired = hostPatch(room, 'host', 'expire', { phaseKey: room.timers.phaseKey }, 9000);
  assert.equal(expired.status, 'bonus_locked');
});

test('toss-up expiry closes the question only for the current phase', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  const key = room.timers.phaseKey;
  assert.deepEqual(hostPatch(room, 'host', 'expire', { phaseKey: 'nope' }, 7000), {});
  const expired = hostPatch(room, 'host', 'expire', { phaseKey: key }, 7000);
  assert.equal(expired.status, 'tossup_dead');
  room = buzz(room, ANN, 2500);
  assert.deepEqual(hostPatch(room, 'host', 'expire', { phaseKey: key }, 7000), {});
});

test('dead needs a live toss-up', () => {
  assert.match(actionReason(base(), 'tossup_dead'), /no live toss-up/);
  const dead = act(reading(), 'tossup_dead', {}, 1100);
  assert.equal(dead.status, 'tossup_dead');
  assert.equal(dead.timers, null);
});

test('game clock: start twice is refused, pause keeps elapsed time, reset restores the half', () => {
  let room = act(base(), 'game_start', {}, 1000);
  assert.match(actionReason(room, 'game_start'), /already running/);
  room = act(room, 'game_pause', {}, 4000);
  assert.equal(room.gameClock.status, 'paused');
  assert.equal(room.gameClock.remainingMs, 477000);
  room = act(room, 'game_start', {}, 5000);
  assert.equal(room.gameClock.remainingMs, 477000);
  room = act(room, 'game_reset', {}, 6000);
  assert.equal(room.gameClock.remainingMs, 480000);
  assert.equal(room.gameClock.status, 'stopped');
});

test('game clock uses the half length set on create', () => {
  const room = act(base({ halfMinutes: 3 }), 'game_reset', {}, 1000);
  assert.equal(room.gameClock.remainingMs, 180000);
});

test('stats tally at grading time, and the old record_buzz action is gone', () => {
  let room = act(reading(), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2500);
  room = act(room, 'tossup_grade_correct', {}, 2600);
  assert.equal(room.stats.player.a1.buzzes, 1);
  assert.equal(room.stats.player.a1.correct, 1);
  assert.equal(room.stats.team.A.points, 4);
  assert.throws(() => hostPatch(room, 'host', 'record_buzz'), /Unknown room action/);
});

test('a second buzz is refused with the reason, and a non-host cannot act', () => {
  const room = buzz(reading(), ANN, 1100);
  assert.equal(buzzReason(room, ANN, 1200), 'You already buzzed.');
  assert.match(buzzReason(room, BEN, 1200), /buzzed first/);
  assert.throws(() => buzzPatch(room, BEN, 1200), /buzzed first/);
  assert.throws(() => hostPatch(base(), 'intruder', 'tossup_start'), /Only the room host/);
});

test('three-team rooms: a third team can still buzz after a normal incorrect', () => {
  let room = base({ teamCount: 3 }, { scores: { A: 0, B: 0, C: 0 } });
  room = act(reading(room), 'done_reading', {}, 2000);
  room = buzz(room, ANN, 2500);
  room = act(room, 'tossup_grade_incorrect', {}, 3000);
  assert.equal(canBuzz(room, CAL, 3100), true);
  assert.equal(room.status, 'tossup_open');
});

test('log is capped at 60 entries and hostPatch does not mutate its input', () => {
  let room = base();
  for (let i = 0; i < 70; i += 1) room = act(room, 'game_reset', {}, 1000 + i);
  assert.equal(room.log.length, 60);
  assert.equal(room.logSeq, 70);
  const snapshot = JSON.stringify(room);
  hostPatch(room, 'host', 'game_reset', {}, 9999);
  assert.equal(JSON.stringify(room), snapshot);
});

test('an adjust_score entry is logged with a signed delta', () => {
  const room = act(base(), 'adjust_score', { team: 'A', delta: -1 });
  assert.equal(room.log.at(-1).details, 'Score correction: Team A -1');
});

test('display helpers: state line, clock text, team classes and category case', () => {
  const room = reading();
  assert.equal(stateLine(room), 'Tossup 1, reading');
  assert.equal(stateLine(act(room, 'done_reading', {}, 2000)), 'Tossup 1, buzzers open');
  assert.equal(stateLine(base()), 'Ready to start');
  assert.equal(stateLine(act(room, 'tossup_dead', {}, 1100)), 'Tossup 1, dead');
  assert.equal(stateLine(base({}, { status: 'ended' })), 'Game over');
  assert.equal(formatSeconds(4001), '5');
  assert.equal(formatSeconds(0), '0');
  assert.equal(formatClock(479999), '08:00');
  assert.equal(formatClock(61000), '01:01');
  assert.equal(teamClass('B'), 'team-b');
  assert.equal(sentenceCase('PHYSICS'), 'Physics');
  assert.equal(timedPhase(act(room, 'done_reading', {}, 2000)), true);
  assert.equal(timedPhase(room), false);
  assert.equal(clockRunning(act(base(), 'game_start', {}, 1000)), true);
});

test('question mode and point values: toss-up only skips bonuses, bonus only starts on a bonus', () => {
  let room = base({ questionMode: 'tossup', tossupPoints: 5 });
  room = buzz(reading(room), ANN, 1100);
  room = act(room, 'tossup_grade_correct', {}, 1200);
  assert.equal(room.status, 'between');
  assert.equal(room.scores.A, 5);
  let bonusOnly = act(base({ questionMode: 'bonus', bonusPoints: 7 }), 'tossup_start');
  assert.equal(bonusOnly.status, 'bonus_ready');
  bonusOnly = act(bonusOnly, 'bonus_correct');
  assert.equal(bonusOnly.scores.A, 7);
  assert.equal(bonusOnly.status, 'between');
});

test('with the timer lock off, the toss-up does not expire and late buzzes are allowed', () => {
  const room = act(reading(base({ lockOnTimerEnd: false })), 'done_reading', {}, 2000);
  assert.deepEqual(hostPatch(room, 'host', 'expire', { phaseKey: room.timers.phaseKey }, 9000), {});
  assert.equal(canBuzz(room, ANN, 60000), true);
});

test('one-team rooms: an incorrect interrupt costs points and kills the toss-up', () => {
  let room = base({ teamCount: 1 }, { scores: { A: 0 } });
  room = buzz(reading(room), ANN, 1100);
  room = act(room, 'tossup_grade_incorrect', {}, 1200);
  assert.equal(room.scores.A, -4);
  assert.equal(room.status, 'tossup_dead');
});

test('basic mode: first buzz while unlocked, lock, clear, and per-player points', () => {
  let room = base({ mode: 'basic', teamCount: 1 }, { status: 'basic', locked: true, scores: { A: 0 } });
  assert.equal(buzzReason(room, ANN), 'Buzzers are locked.');
  room = act(room, 'basic_lock');
  assert.equal(room.locked, false);
  room = buzz(room, ANN);
  assert.equal(room.currentBuzz.uid, 'a1');
  assert.match(buzzReason(room, ANN), /already buzzed/);
  room = act(room, 'basic_clear');
  assert.equal(room.currentBuzz, null);
  room = act(room, 'adjust_player', { uid: 'a1', name: 'Ann', team: 'A', delta: 3 });
  room = act(room, 'adjust_player', { uid: 'a1', name: 'Ann', team: 'A', delta: -1 });
  assert.equal(S.playerPoints(room, 'a1'), 2);
  assert.equal(room.scores.A, 2);
});

test('timer and game clock: set, round-mode locking, and reset keeps the set length', () => {
  let room = base({ mode: 'basic', timerUnlockOnStart: true, timerLockOnEnd: true }, { status: 'basic', locked: true });
  room = act(room, 'timer_set', { seconds: 45 });
  assert.equal(room.basicTimer.remainingMs, 45000);
  room = act(room, 'timer_start', {}, 2000);
  assert.equal(room.locked, false);
  room = act(room, 'timer_expire', { runKey: room.basicTimer.runKey }, 60000);
  assert.equal(room.locked, true);
  assert.equal(room.basicTimer.status, 'done');
  room = act(room, 'game_set', { seconds: 90 });
  room = act(room, 'game_start', {}, 3000);
  room = act(room, 'game_pause', { elapsedMs: 10000 }, 4000);
  assert.equal(room.gameClock.remainingMs, 80000);
  room = act(room, 'game_reset');
  assert.equal(room.gameClock.remainingMs, 90000);
});
