# ⚛️ Atom Bowl

**Atom Bowl** (current version 0.9.1) is a fast, clean, browser-based question platform designed for **National Science Bowl (NSB)** preparation and it also contains live NSB-like buzzer rooms and game clock settings using Firebase.
Note: website has changed to [shankar-sachin.github.io/Atom_Bowl](https://shankar-sachin.github.io/Atom_Bowl)
It focuses on realism, speed, and accuracy along with low latency servers designed for the pros.

![Demo](docs/data/demo.gif)


Built for students who want to grind questions the way real rounds feel and host buzzing rounds with unmatched realism.

Note: Atom Bowl v1 is coming! It will include AI Generate using Gemini API, a working Accounts and Authentication system, along with adding a Bank C with more questions!

🔗 **Live site:** [shankar-sachin.github.io/Atom_Bowl](https://shankar-sachin.github.io/Atom_Bowl)
ℹ️ **Info Docs (How to Use)** <https://www.github.com/atom-bowl/Atom_Bowl/info_docs.md>

---

## 🚀 Features
- 🆕 **New Features from v0.9.1 update**
  - Buzzer Rooms v1
  - Game Clock
  - Autocorrect (using efficient Python scripts)
  - Light mode
  - Interrupt
  - AtomScore(R)
  - Learn using 90+ lessons across 6 topics
  - Practice Engine v0.3
  - Subtopics
  - Strong backend powered by Firebase and Render Docker
  - Question Bank Upgrade (Bank A + B powered by Ruby)

- 📚 **Real NSB-style questions**
  - Physics
  - Chemistry
  - Biology
  - Earth & Space Science
  - Math
  - General Science
  - Astronomy

- ⚡ **Instant loading**
  - Pure HCJ Stack for Frontend
  - No frameworks, no bloat

- 🧑‍💻 **Used Languages**
  - HTML / CSS / JavaScript for frontend loader
  - Python for Autocorrect using Render Docker
  - Ruby for Filter Searching using Render Docker
  - TypeScript for source code, built using `tsc config`

- 🧩 **Multiple question sets**
  - Clean JSON-based data
  - Easy to expand and maintain

- 📖 **Over 90+ target-based lessons**
  - Easy-to-access JSON-based datta
  - Mainstream focused NSB-oriented lessons
  - Throughout all 6 official NSB categories + General Science

- 🎯 **Practice-focused design**
  - Straight to the question
  - No distractions
  - Built for repetition and speed

---

## Features Under Development

- Generate using AI (Gemini 3.0 and Llama)
- Accounts (available for testing)

## Credits
- Question Bank A goes to official DOE questions parsed by @arxenix. @arxenix did not contribute to code, only to sets
- Question Bank B goes to SciBowlDB's official question bank.
- Question Bank C is coming soon from smaller invitationals and niche competitions.

## Get going at <https://atom-bowl.github.io/Atom_Bowl/>

*Last updated 2/12/2026 at 6:28 PM*


## Development and Firebase setup

Use Node.js 22 or 24. Run `npm ci`, `npm run build`, and `npm start` to serve the site and APIs locally. The build compiles TypeScript and copies source HTML/CSS to `docs`, the deployed site directory. `npm run build:watch` watches TypeScript only.

- `npm test`: account, room-state, answer-grading, and backend regression tests.
- `npm run test:firebase`: real Firestore emulator rules and transaction tests, including simultaneous buzzes. Requires Java 21+; the first run downloads the emulator.
- [Firebase setup](src/data/firebase_rules.md): providers, authorized domains, legacy username migration, room rules, and staging verification. Deploy the new client and reviewed rules together; no production configuration is changed by building this repository.

Production dependency audit passes with the pinned lockfile (`npm audit --omit=dev`). The Firebase CLI currently brings seven moderate development-only audit findings; resolving those requires upstream dependency updates or a separately reviewed toolchain change.

## License

Atom Bowl’s original source code is licensed under the [MIT License](LICENSE). Third-party question banks, images, and provider artwork retain their respective licenses and terms.
