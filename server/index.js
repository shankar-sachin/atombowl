const path = require("path");
const { spawn, spawnSync } = require("child_process");
const express = require("express");
const { searchLocal } = require("./search_fallback");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const ROOT = path.join(__dirname, "..");
const PYTHON = process.env.PYTHON || "python3";
const RUBY = process.env.RUBY || "ruby";

function warnIfCommandMissing(cmd, label) {
  const probe = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  if (probe.error && probe.error.code === "ENOENT") {
    // eslint-disable-next-line no-console
    console.warn(`[runtime] ${label} not found in PATH (${cmd}); related features may use fallback.`);
  }
}

warnIfCommandMissing(PYTHON, "Python");
warnIfCommandMissing(RUBY, "Ruby");

function runScript(cmd, args, input, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      reject(new Error("script-timeout"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.stdin.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      reject(err);
    });

    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `script-exit-${code}`));
        return;
      }
      try {
        const out = stdout.trim();
        resolve(out ? JSON.parse(out) : {});
      } catch (err) {
        reject(err);
      }
    });

    try {
      child.stdin.write(JSON.stringify(input || {}));
      child.stdin.end();
    } catch (err) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

app.post("/api/grade", async (req, res) => {
  const { userAnswer, correctAnswer, questionType, threshold } = req.body || {};
  if (typeof correctAnswer !== "string") {
    return res.status(400).json({ error: "correctAnswer-required" });
  }

  const script = path.join(ROOT, "server", "python", "autochecker.py");
  try {
    const result = await runScript(PYTHON, [script], {
      userAnswer,
      correctAnswer,
      questionType,
      threshold
    }, 3500);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: "grade-failed", detail: String(err.message || err) });
  }
});

app.get("/api/search", async (req, res) => {
  const script = path.join(ROOT, "server", "ruby", "search.rb");
  const payload = {
    search: req.query.search || "",
    bank: req.query.bank || "ALL",
    level: req.query.level || "ANY",
    category: req.query.category || "ANY",
    bonus: req.query.bonus || "ANY",
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 100)
  };

  try {
    const result = await runScript(RUBY, [script], payload, 6000);
    res.json({ ...(result || {}), engine: "ruby" });
  } catch (err) {
    try {
      const fallback = searchLocal(ROOT, payload);
      return res.json({
        ...(fallback || {}),
        engine: "js-fallback",
        rubyError: String((err && err.message) || err || "ruby-search-failed")
      });
    } catch (fallbackErr) {
      return res.status(500).json({
        error: "search-failed",
        detail: String(fallbackErr.message || fallbackErr),
        rubyError: String((err && err.message) || err || "ruby-search-failed")
      });
    }
  }
});

app.get("/api/stats", async (req, res) => {
  const script = path.join(ROOT, "server", "ruby", "stats.rb");
  const payload = {
    bank: req.query.bank || "ALL"
  };

  try {
    const result = await runScript(RUBY, [script], payload, 6000);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: "stats-failed", detail: String(err.message || err) });
  }
});

app.get("/api/validate", async (req, res) => {
  const script = path.join(ROOT, "server", "ruby", "validator.rb");
  const checksParam = req.query.checks;
  if (checksParam != null && typeof checksParam !== "string") return res.status(400).json({ error: "checks-must-be-a-string" });
  const checks = checksParam ? checksParam.split(",").map(s => s.trim()).filter(Boolean) : [];
  const payload = {
    bank: req.query.bank || "ALL",
    checks: checks.length ? checks : undefined
  };

  try {
    const result = await runScript(RUBY, [script], payload, 8000);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: "validate-failed", detail: String(err.message || err) });
  }
});

app.post("/api/difficulty", async (req, res) => {
  const { questionText, parsedAnswer, category, type, level } = req.body || {};
  if (typeof questionText !== "string") {
    return res.status(400).json({ error: "questionText-required" });
  }

  const script = path.join(ROOT, "server", "python", "difficulty.py");
  try {
    const result = await runScript(PYTHON, [script], {
      questionText,
      parsedAnswer,
      category,
      type,
      level
    }, 3500);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: "difficulty-failed", detail: String(err.message || err) });
  }
});

app.use(express.static(path.join(ROOT, "docs")));

if (require.main === module) app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Atom Bowl server running at http://localhost:${PORT}`);
});

module.exports = { app, runScript };
