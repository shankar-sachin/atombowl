export type Room = { [key: string]: any };
export type Player = { uid: string; name: string; team: string };

export function canBuzz(room: Room, player: Player, now = Date.now()): boolean {
  return !!player?.uid && Object.prototype.hasOwnProperty.call(room.scores || {}, player.team)
    && ['tossup_open', 'bonus_open'].includes(room.status) && !room.currentBuzz
    && (!room.timers?.phaseEndAt || now < room.timers.phaseEndAt)
    && (room.status !== 'bonus_open' || room.bonusTeam === player.team)
    && (room.status !== 'tossup_open' || !(room.lockoutTeams || [room.lockoutTeam]).includes(player.team));
}

export function buzzPatch(room: Room, player: Player, now = Date.now()): Room {
  if (!canBuzz(room, player, now)) throw new Error('Buzzers are locked for your team.');
  return {
    currentBuzz: { uid: player.uid, name: player.name, team: player.team, at: now },
    status: room.status === 'bonus_open' ? 'bonus_locked' : 'tossup_locked',
    timers: null
  };
}

export function buzzKey(room: Room): string {
  return room.currentBuzz ? `${room.currentIndex || 0}:${room.currentBuzz.uid}:${room.currentBuzz.at}` : "";
}

function gradedStats(room: Room, kind: string, points: number): Room {
  const stats = JSON.parse(JSON.stringify(room.stats || { team: {}, player: {} }));
  stats.team ||= {};
  stats.player ||= {};
  const buzz = room.currentBuzz;
  if (!buzz) return stats;
  for (const [bucket, key] of [[stats.team, buzz.team], [stats.player, buzz.uid]]) {
    const value = bucket[key] ||= { correct: 0, incorrect: 0, interrupt: 0, buzzes: 0, points: 0 };
    if (kind) value[kind] = (value[kind] || 0) + 1;
    if (stats.lastBuzz !== buzzKey(room)) value.buzzes = (value.buzzes || 0) + 1;
    value.points = (value.points || 0) + points;
  }
  stats.lastBuzz = buzzKey(room);
  Object.assign(stats.player[buzz.uid], { name: buzz.name, team: buzz.team });
  return stats;
}

export function hostPatch(room: Room, uid: string, action: string, options: Room = {}, now = Date.now()): Room {
  if (room.hostUid !== uid) throw new Error('Only the room host can do that.');
  if (room.status === 'ended') throw new Error('This room has ended.');
  const scores = { ...(room.scores || {}) };
  const tossupSeconds = room.settings?.nsbRules ? 5 : (room.settings?.tuTime || 5);
  const bonusSeconds = room.settings?.nsbRules ? 20 : (room.settings?.bonusTime || 20);
  const timer = (type: string, seconds: number) => ({ phaseEndAt: now + seconds * 1000, phaseDuration: seconds, phaseType: type });
  let patch: Room;
  if (action === 'record_buzz') {
    if (!room.currentBuzz || room.stats?.lastBuzz === buzzKey(room)) return {};
    patch = { stats: gradedStats(room, '', 0) };
  } else if (action === 'tossup_start' || action === 'next_tossup') {
    patch = { status: 'tossup_open', currentBuzz: null, lockoutTeam: null, lockoutTeams: [],
      currentIndex: (room.currentIndex || 0) + 1, currentCategory: options.category || room.currentCategory || 'General',
      timers: timer('tossup', tossupSeconds) };
  } else if (action === 'bonus_start') {
    if (room.status !== 'bonus_ready') throw new Error('Grade a correct tossup before opening the bonus.');
    const team = options.team || room.bonusTeam;
    if (!Object.prototype.hasOwnProperty.call(scores, team)) throw new Error('Choose a valid bonus team.');
    patch = { status: 'bonus_open', currentBuzz: null, bonusTeam: team, lockoutTeam: null, lockoutTeams: [], timers: timer('bonus', bonusSeconds) };
  } else if (action.startsWith('tossup_grade_')) {
    if (room.status !== 'tossup_locked' || !room.currentBuzz) throw new Error('There is no tossup buzz to grade.');
    const kind = action.slice('tossup_grade_'.length);
    if (!['correct', 'incorrect', 'interrupt'].includes(kind)) throw new Error('Unknown grade.');
    const team = room.currentBuzz.team;
    const points = kind === 'correct' ? 4 : kind === 'interrupt' ? -4 : 0;
    scores[team] = (scores[team] || 0) + points;
    const locked = [...new Set([...(room.lockoutTeams || (room.lockoutTeam ? [room.lockoutTeam] : [])), team])];
    const finished = locked.length >= Object.keys(scores).length;
    patch = { scores, stats: gradedStats(room, kind, points), currentBuzz: null,
      status: kind === 'correct' ? 'bonus_ready' : finished ? 'tossup_dead' : 'tossup_open',
      bonusTeam: kind === 'correct' ? team : room.bonusTeam,
      lockoutTeam: kind === 'correct' ? null : team, lockoutTeams: kind === 'correct' ? [] : locked,
      timers: kind === 'correct' || finished ? null : timer('tossup', tossupSeconds) };
  } else if (action === 'bonus_correct' || action === 'bonus_wrong') {
    if (!['bonus_open', 'bonus_locked'].includes(room.status)) throw new Error('There is no bonus to grade.');
    const points = action === 'bonus_correct' ? 10 : 0;
    scores[room.bonusTeam] = (scores[room.bonusTeam] || 0) + points;
    patch = { scores, stats: gradedStats(room, points ? 'correct' : 'incorrect', points),
      status: 'lobby', currentBuzz: null, timers: null, lockoutTeam: null, lockoutTeams: [] };
  } else if (action === 'tossup_dead') {
    if (!room.status.startsWith('tossup_')) throw new Error('No active tossup.');
    patch = { status: 'tossup_dead', currentBuzz: null, timers: null };
  } else if (action === 'expire') {
    if (!room.status.endsWith('_open') || !room.timers?.phaseEndAt || now < room.timers.phaseEndAt) return {};
    patch = { status: room.status === 'bonus_open' ? 'bonus_locked' : 'tossup_dead', timers: null };
  } else if (action === 'bonus_team') {
    if (room.status !== 'bonus_ready' || !Object.prototype.hasOwnProperty.call(scores, options.team)) throw new Error('Bonus team can only change before the bonus opens.');
    patch = { bonusTeam: options.team };
  } else if (action.startsWith('game_')) {
    const clock = room.gameClock || { status: 'stopped', remainingMs: 180000, updatedAt: now };
    const remaining = Math.max(0, clock.remainingMs - (clock.status === 'running' ? now - clock.updatedAt : 0));
    if (action === 'game_start' && clock.status === 'running') return {};
    if (!['game_start', 'game_pause', 'game_reset'].includes(action)) throw new Error('Unknown clock action.');
    patch = { gameClock: { status: action === 'game_start' ? 'running' : action === 'game_pause' ? 'paused' : 'stopped', remainingMs: action === 'game_reset' ? 180000 : remaining, updatedAt: now } };
  } else { throw new Error('Unknown room action.'); }
  const entry = { type: action, at: now, by: uid, details: action.replace(/_/g, ' ') };
  if (room.currentBuzz && (action.includes('grade') || action === 'record_buzz')) entry.details += `: ${room.currentBuzz.name} (${room.currentBuzz.team})`;
  return { ...patch, lastAction: entry, log: [...(room.log || []), entry].slice(-200) };
}
