const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTS } = require('./helpers');
const { hostPatch, buzzPatch, canBuzz } = loadTS('src/ts/room_state.ts');
const player = { uid: 'p1', team: 'A', name: '<img src=x onerror=alert(1)>' };
const base = () => ({ hostUid: 'host', status: 'lobby', scores: { A: 0, B: 0 }, settings: { nsbRules: true }, bonusTeam: 'A', currentBuzz: null });
const apply = (room, action, options = {}, now = 1000) => ({ ...room, ...hostPatch(room, 'host', action, options, now) });
const buzz = (room, who = player, now = 1001) => ({ ...room, ...buzzPatch(room, who, now) });
test('first buzz locks room; a competing or repeated buzz cannot overwrite it', () => {
 const room = buzz(apply(base(), 'tossup_start'));
 assert.equal(room.currentBuzz.uid, 'p1');
 assert.throws(() => buzz(room, { ...player, uid: 'p2', team: 'B' }), /locked/);
 assert.equal(room.timers, null);
});
test('tossup grading is single-use, ordinary wrong answer has no penalty, locked team cannot rebuzz', () => {
 let room = apply(buzz(apply(base(), 'tossup_start')), 'tossup_grade_incorrect');
 assert.equal(room.scores.A, 0);
 assert.equal(canBuzz(room, player, 1002), false);
 assert.throws(() => apply(room, 'tossup_grade_correct'), /no tossup buzz/);
 room = apply(buzz(room, { ...player, uid: 'p2', team: 'B' }), 'tossup_grade_interrupt');
 assert.equal(room.scores.B, -4);
 assert.equal(room.status, 'tossup_dead');
});
test('correct tossup awards winning team bonus; bonus can be graded without a buzz', () => {
 let room = apply(buzz(apply(base(), 'tossup_start'), { ...player, team: 'B' }), 'tossup_grade_correct');
 assert.equal(room.scores.B, 4);
 assert.equal(room.bonusTeam, 'B');
 room = apply(room, 'bonus_start');
 assert.equal(canBuzz(room, player, 1001), false);
 room = apply(room, 'bonus_correct');
 assert.equal(room.scores.B, 14);
 assert.equal(room.status, 'lobby');
 assert.throws(() => apply(room, 'bonus_correct'), /no bonus/);
});
test('deadline rejects late buzz even before host receives expiry; dead tossup closes', () => {
 const room = apply(base(), 'tossup_start');
 assert.throws(() => buzz(room, player, 6000), /locked/);
 assert.equal(apply(room, 'expire', {}, 6000).status, 'tossup_dead');
 assert.equal(apply(room, 'tossup_dead').status, 'tossup_dead');
});
test('clock start is idempotent and pause retains elapsed time', () => {
 let room = apply(base(), 'game_start');
 room = apply(room, 'game_start', {}, 2000);
 assert.equal(room.gameClock.updatedAt, 1000);
 room = apply(room, 'game_pause', {}, 4000);
 assert.equal(room.gameClock.remainingMs, 177000);
});
test('non-host cannot score, malformed team cannot buzz, transition calculation does not mutate input', () => {
 assert.throws(() => hostPatch(base(), 'intruder', 'tossup_start'), /Only the room host/);
 assert.throws(() => buzz(apply(base(), 'tossup_start'), { ...player, team: 'Z' }), /locked/);
 const room = buzz(apply(base(), 'tossup_start'));
 room.stats = { player: { p1: { points: 0 } } };
 const original = JSON.stringify(room);
 apply(room, 'tossup_grade_correct');
 assert.equal(JSON.stringify(room), original);
});
test('host records a buzz once, grading does not count it again', () => {
 let room = buzz(apply(base(), 'tossup_start'));
 room = apply(room, 'record_buzz');
 room = apply(room, 'record_buzz');
 assert.equal(room.stats.player.p1.buzzes, 1);
 room = apply(room, 'tossup_grade_correct');
 assert.equal(room.stats.player.p1.buzzes, 1);
 assert.equal(room.stats.player.p1.correct, 1);
});
