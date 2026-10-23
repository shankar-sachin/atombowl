// @ts-nocheck
(() => {
  const SCORE_VALUES = {
    tossup: 4,
    bonus: 10,
    interrupt: -4
  };

  const teams = ['A', 'B'];

  const getStatValue = (team, stat) => {
    const el = document.querySelector(`.stat-value[data-team="${team}"][data-stat="${stat}"]`);
    return el ? parseInt(el.textContent, 10) || 0 : 0;
  };

  const setStatValue = (team, stat, value) => {
    const el = document.querySelector(`.stat-value[data-team="${team}"][data-stat="${stat}"]`);
    if (el) {
      el.textContent = String(Math.max(0, value));
    }
  };

  const updateScore = (team) => {
    const total =
      getStatValue(team, 'tossup') * SCORE_VALUES.tossup +
      getStatValue(team, 'bonus') * SCORE_VALUES.bonus +
      getStatValue(team, 'interrupt') * SCORE_VALUES.interrupt;
    const scoreEl = document.querySelector(`[data-score][data-team="${team}"]`);
    if (scoreEl) scoreEl.textContent = String(total);
  };

  const updateAllScores = () => {
    teams.forEach(updateScore);
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.stat-btn');
    if (!button) return;
    const team = button.dataset.team;
    if (!team) return;
    const stat = button.dataset.stat;
    if (!stat) return;

    const current = getStatValue(team, stat);
    const next = button.dataset.action === 'inc' ? current + 1 : current - 1;
    setStatValue(team, stat, next);
    updateScore(team);
  });

  const resetAllBtn = document.getElementById('resetAll');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      teams.forEach((team) => {
        Object.keys(SCORE_VALUES).forEach((stat) => setStatValue(team, stat, 0));
        updateScore(team);
      });
    });
  }

  const timerDisplay = document.getElementById('timerDisplay');
  const timerMeta = document.getElementById('timerMeta');
  const startBtn = document.getElementById('timerStart');
  const pauseBtn = document.getElementById('timerPause');
  const resetBtn = document.getElementById('timerReset');
  const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));

  let timerInterval = null;
  let duration = 20;
  let remaining = 20;
  let running = false;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const renderTimer = () => {
    if (timerDisplay) timerDisplay.textContent = formatTime(remaining);
  };

  const setMode = (btn) => {
    const nextDuration = parseInt(btn.dataset.duration || '0', 10);
    const nextLabel = btn.dataset.label || 'Custom';
    if (!nextDuration) return;
    duration = nextDuration;
    remaining = duration;
    modeButtons.forEach((item) => {
      const selected = item === btn;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    if (timerMeta) timerMeta.textContent = `Mode: ${nextLabel}`;
    stopTimer();
    renderTimer();
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    running = false;
    if (startBtn) startBtn.disabled = false;
  };

  const startTimer = () => {
    if (running) return;
    const startTime = Date.now();
    const baseRemaining = remaining;
    running = true;
    if (startBtn) startBtn.disabled = true;
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      remaining = Math.max(0, baseRemaining - elapsed);
      renderTimer();
      if (remaining <= 0) {
        stopTimer();
      }
    }, 200);
  };

  if (startBtn) startBtn.addEventListener('click', startTimer);
  if (pauseBtn) pauseBtn.addEventListener('click', stopTimer);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      stopTimer();
      remaining = duration;
      renderTimer();
    });
  }

  modeButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn)));
  renderTimer();
  updateAllScores();

  const gameDisplay = document.getElementById('gameClockDisplay');
  const gameMinutesInput = document.getElementById('gameMinutes');
  const gameSecondsInput = document.getElementById('gameSeconds');
  const cueOneMin = document.getElementById('cueOneMin');
  const cueThirty = document.getElementById('cueThirty');
  const cueSound = document.getElementById('cueSound');
  const gameStart = document.getElementById('gameStart');
  const gamePause = document.getElementById('gamePause');
  const gameReset = document.getElementById('gameReset');

  let gameInterval = null;
  let gameDuration = 8 * 60;
  let gameRemaining = 8 * 60;
  let gameRunning = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => ctx.close();
    } catch {
      // Audio not supported or blocked
    }
  };

  const renderGameClock = () => {
    if (!gameDisplay) return;
    const mins = Math.floor(gameRemaining / 60);
    const secs = gameRemaining % 60;
    gameDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const setGameDuration = () => {
    const mins = clamp(parseInt(gameMinutesInput?.value || '0', 10), 0, 99);
    const secs = clamp(parseInt(gameSecondsInput?.value || '0', 10), 0, 59);
    if (gameMinutesInput) gameMinutesInput.value = String(mins);
    if (gameSecondsInput) gameSecondsInput.value = String(secs);
    gameDuration = mins * 60 + secs;
    gameRemaining = gameDuration;
    renderGameClock();
  };

  const flashGameClock = () => {
    if (!gameDisplay) return;
    gameDisplay.classList.remove('flash');
    void gameDisplay.offsetWidth;
    gameDisplay.classList.add('flash');
  };

  const stopGameClock = () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
    gameRunning = false;
    if (gameStart) gameStart.disabled = false;
  };

  const startGameClock = () => {
    if (gameRunning || gameDuration === 0) return;
    const startTime = Date.now();
    const baseRemaining = gameRemaining;
    gameRunning = true;
    if (gameStart) gameStart.disabled = true;
    gameInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const nextRemaining = Math.max(0, baseRemaining - elapsed);
      const prevRemaining = gameRemaining;
      gameRemaining = nextRemaining;
      renderGameClock();

      if (cueOneMin?.checked && prevRemaining > 60 && gameRemaining <= 60) {
        flashGameClock();
      }
      if (cueThirty?.checked && prevRemaining > 30 && gameRemaining <= 30) {
        flashGameClock();
      }

      if (gameRemaining <= 0) {
        flashGameClock();
        if (cueSound?.checked) playBeep();
        stopGameClock();
      }
    }, 200);
  };

  if (gameMinutesInput) gameMinutesInput.addEventListener('change', setGameDuration);
  if (gameSecondsInput) gameSecondsInput.addEventListener('change', setGameDuration);
  if (gameStart) gameStart.addEventListener('click', startGameClock);
  if (gamePause) gamePause.addEventListener('click', stopGameClock);
  if (gameReset) {
    gameReset.addEventListener('click', () => {
      stopGameClock();
      gameRemaining = gameDuration;
      renderGameClock();
    });
  }

  setGameDuration();
})();


