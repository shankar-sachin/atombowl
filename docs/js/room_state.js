export function canBuzz(room, player, now = Date.now()) {
    var _a;
    return !!(player === null || player === void 0 ? void 0 : player.uid) && Object.prototype.hasOwnProperty.call(room.scores || {}, player.team)
        && ['tossup_open', 'bonus_open'].includes(room.status) && !room.currentBuzz
        && (!((_a = room.timers) === null || _a === void 0 ? void 0 : _a.phaseEndAt) || now < room.timers.phaseEndAt)
        && (room.status !== 'bonus_open' || room.bonusTeam === player.team)
        && (room.status !== 'tossup_open' || !(room.lockoutTeams || [room.lockoutTeam]).includes(player.team));
}
export function buzzPatch(room, player, now = Date.now()) {
    if (!canBuzz(room, player, now))
        throw new Error('Buzzers are locked for your team.');
    return {
        currentBuzz: { uid: player.uid, name: player.name, team: player.team, at: now },
        status: room.status === 'bonus_open' ? 'bonus_locked' : 'tossup_locked',
        timers: null
    };
}
export function buzzKey(room) {
    return room.currentBuzz ? `${room.currentIndex || 0}:${room.currentBuzz.uid}:${room.currentBuzz.at}` : "";
}
function gradedStats(room, kind, points) {
    const stats = JSON.parse(JSON.stringify(room.stats || { team: {}, player: {} }));
    stats.team || (stats.team = {});
    stats.player || (stats.player = {});
    const buzz = room.currentBuzz;
    if (!buzz)
        return stats;
    for (const [bucket, key] of [[stats.team, buzz.team], [stats.player, buzz.uid]]) {
        const value = bucket[key] || (bucket[key] = { correct: 0, incorrect: 0, interrupt: 0, buzzes: 0, points: 0 });
        if (kind)
            value[kind] = (value[kind] || 0) + 1;
        if (stats.lastBuzz !== buzzKey(room))
            value.buzzes = (value.buzzes || 0) + 1;
        value.points = (value.points || 0) + points;
    }
    stats.lastBuzz = buzzKey(room);
    Object.assign(stats.player[buzz.uid], { name: buzz.name, team: buzz.team });
    return stats;
}
export function hostPatch(room, uid, action, options = {}, now = Date.now()) {
    var _a, _b, _c, _d, _e, _f;
    if (room.hostUid !== uid)
        throw new Error('Only the room host can do that.');
    if (room.status === 'ended')
        throw new Error('This room has ended.');
    const scores = { ...(room.scores || {}) };
    const tossupSeconds = ((_a = room.settings) === null || _a === void 0 ? void 0 : _a.nsbRules) ? 5 : (((_b = room.settings) === null || _b === void 0 ? void 0 : _b.tuTime) || 5);
    const bonusSeconds = ((_c = room.settings) === null || _c === void 0 ? void 0 : _c.nsbRules) ? 20 : (((_d = room.settings) === null || _d === void 0 ? void 0 : _d.bonusTime) || 20);
    const timer = (type, seconds) => ({ phaseEndAt: now + seconds * 1000, phaseDuration: seconds, phaseType: type });
    let patch;
    if (action === 'record_buzz') {
        if (!room.currentBuzz || ((_e = room.stats) === null || _e === void 0 ? void 0 : _e.lastBuzz) === buzzKey(room))
            return {};
        patch = { stats: gradedStats(room, '', 0) };
    }
    else if (action === 'tossup_start' || action === 'next_tossup') {
        patch = { status: 'tossup_open', currentBuzz: null, lockoutTeam: null, lockoutTeams: [],
            currentIndex: (room.currentIndex || 0) + 1, currentCategory: options.category || room.currentCategory || 'General',
            timers: timer('tossup', tossupSeconds) };
    }
    else if (action === 'bonus_start') {
        if (room.status !== 'bonus_ready')
            throw new Error('Grade a correct tossup before opening the bonus.');
        const team = options.team || room.bonusTeam;
        if (!Object.prototype.hasOwnProperty.call(scores, team))
            throw new Error('Choose a valid bonus team.');
        patch = { status: 'bonus_open', currentBuzz: null, bonusTeam: team, lockoutTeam: null, lockoutTeams: [], timers: timer('bonus', bonusSeconds) };
    }
    else if (action.startsWith('tossup_grade_')) {
        if (room.status !== 'tossup_locked' || !room.currentBuzz)
            throw new Error('There is no tossup buzz to grade.');
        const kind = action.slice('tossup_grade_'.length);
        if (!['correct', 'incorrect', 'interrupt'].includes(kind))
            throw new Error('Unknown grade.');
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
    }
    else if (action === 'bonus_correct' || action === 'bonus_wrong') {
        if (!['bonus_open', 'bonus_locked'].includes(room.status))
            throw new Error('There is no bonus to grade.');
        const points = action === 'bonus_correct' ? 10 : 0;
        scores[room.bonusTeam] = (scores[room.bonusTeam] || 0) + points;
        patch = { scores, stats: gradedStats(room, points ? 'correct' : 'incorrect', points),
            status: 'lobby', currentBuzz: null, timers: null, lockoutTeam: null, lockoutTeams: [] };
    }
    else if (action === 'tossup_dead') {
        if (!room.status.startsWith('tossup_'))
            throw new Error('No active tossup.');
        patch = { status: 'tossup_dead', currentBuzz: null, timers: null };
    }
    else if (action === 'expire') {
        if (!room.status.endsWith('_open') || !((_f = room.timers) === null || _f === void 0 ? void 0 : _f.phaseEndAt) || now < room.timers.phaseEndAt)
            return {};
        patch = { status: room.status === 'bonus_open' ? 'bonus_locked' : 'tossup_dead', timers: null };
    }
    else if (action === 'bonus_team') {
        if (room.status !== 'bonus_ready' || !Object.prototype.hasOwnProperty.call(scores, options.team))
            throw new Error('Bonus team can only change before the bonus opens.');
        patch = { bonusTeam: options.team };
    }
    else if (action.startsWith('game_')) {
        const clock = room.gameClock || { status: 'stopped', remainingMs: 180000, updatedAt: now };
        const remaining = Math.max(0, clock.remainingMs - (clock.status === 'running' ? now - clock.updatedAt : 0));
        if (action === 'game_start' && clock.status === 'running')
            return {};
        if (!['game_start', 'game_pause', 'game_reset'].includes(action))
            throw new Error('Unknown clock action.');
        patch = { gameClock: { status: action === 'game_start' ? 'running' : action === 'game_pause' ? 'paused' : 'stopped', remainingMs: action === 'game_reset' ? 180000 : remaining, updatedAt: now } };
    }
    else {
        throw new Error('Unknown room action.');
    }
    const entry = { type: action, at: now, by: uid, details: action.replace(/_/g, ' ') };
    if (room.currentBuzz && (action.includes('grade') || action === 'record_buzz'))
        entry.details += `: ${room.currentBuzz.name} (${room.currentBuzz.team})`;
    return { ...patch, lastAction: entry, log: [...(room.log || []), entry].slice(-200) };
}
//# sourceMappingURL=room_state.js.map