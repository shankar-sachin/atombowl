# Atom Bowl: How to Use

Atom Bowl is a free practice platform for the National Science Bowl (NSB). Open <https://atombowl.web.app> in any modern browser (Chrome, Edge, Firefox or Safari) with JavaScript enabled.

## Contents

1. [Practice](#1-practice)
2. [Question Bank](#2-question-bank)
3. [Learn](#3-learn)
4. [Generate and Tutor (coming in v1.0)](#4-generate-and-tutor-coming-in-v10)
5. [Settings](#5-settings)
6. [Accounts](#6-accounts)
7. [Game Clock](#7-game-clock)
8. [Buzzer Rooms](#8-buzzer-rooms)
9. [Keyboard shortcuts](#keyboard-shortcuts)
10. [Troubleshooting](#troubleshooting)

---

## 1. Practice

Open [Practice](https://atombowl.web.app/practice_home.html) from the home page.

1. Pick your supertopics and filters. **Advanced Filters** opens 20+ subtopics.
2. Choose how long you get to buzz. Uncheck **No timer** to play with a countdown.
3. Pick one of the six game modes at the bottom.
4. The moderator reads the question aloud while the text types out letter by letter (text and speech are not perfectly synced). Buzz with the **spacebar** or by clicking the question, then type your answer.

Answers are checked by **AtomCorrect**, which tolerates typos and spelling variants. You can turn it off in [Settings](#5-settings).

### Scoring and timing (NSB rules)

| Situation | Result |
| --- | --- |
| Correct tossup | +4 points |
| Correct bonus | +10 points |
| Wrong answer after the question is fully read | no change |
| Wrong answer before the question is fully read (an **interrupt**) | -4 points |

- Tossup buzz window: configurable, minimum 5 seconds after the question is read. Bonus window: 20 seconds.
- After buzzing you have 5 seconds to type your answer (official NSB gives 2; we added a buffer because typing is slower than speaking).
- Rounds alternate Tossup, Bonus, Tossup, Bonus. One selected question in the filters gives one Tossup/Bonus pair.

## 2. Question Bank

The [Question Bank](https://atombowl.web.app/question_bank.html) holds 25,658 tossups and bonuses.

| Bank | Questions | Format | Source |
| --- | --- | --- | --- |
| Bank A | 11,046 | Image | Official DOE nationals questions |
| Bank B | 14,528 | Text | DOE nationals plus regional questions |

We recommend **Bank B**: text is closer to a real round because everyone reads at a different speed. A Bank C of invitational and regional sets is planned before Bank A is retired.

- **Filters** narrow questions by bank, division and topic. Everything runs in your browser.
- **Practice Question** opens a question in the practice engine. This is currently buggy and may not work.
- **Tutor** (AI explanations) is not available yet. See [section 4](#4-generate-and-tutor-coming-in-v10).

## 3. Learn

[Learn](https://atombowl.web.app/learn.html) has 90+ lessons built from many practice tests and reviewed for NSB relevance.

- Six categories, filterable by topic. Each topic has 15 lessons and each lesson has 4 sections.
- Every section explains its key terms. A glossary of all key terms is planned.

## 4. Generate and Tutor (coming in v1.0)

- [Generate](https://atombowl.web.app/generate.html) will create AI-generated practice material by topic, division and difficulty, with options to save and open it in the practice engine.
- [Tutor](https://atombowl.web.app/tutor.html) will explain a question to you with AI.

Both pages exist as landing pages but the features are **unavailable** until v1.0.

## 5. Settings

[Settings](https://atombowl.web.app/settings.html) apply instantly, and no save button is needed. They are stored in your browser, so they survive refreshes.

- Switch the moderator voice.
- Turn AtomCorrect on or off.
- Light or dark mode.
- **Reset to Defaults** restores everything.

## 6. Accounts

Create an account from the [account page](https://atombowl.web.app/account.html) with Google or an email and password. Accounts are tied to your sign-in so your profile follows you across devices. Use **Forgot password** on the sign-in form to reset a password by email. You can play in buzzer rooms as a guest without an account.

## 7. Game Clock

Open **Buzzers → Game Clock** or go to the [Game Clock](https://atombowl.web.app/game_clock.html).

- Set team names, then start timers with notification sounds.
- Record tossup and bonus scores and penalties.

## 8. Buzzer Rooms

[Buzzer Rooms](https://atombowl.web.app/buzzer_rooms.html) let a moderator run a live NSB-style round for friends or a team.

### Players

1. Get the room code or invite link from your moderator and paste it into the join box.
2. Pick your team, enter a display name and click **Join**. Teams update automatically.
3. Once the game starts, press the **spacebar** or click the buzzer box.
4. You can see the timer, who buzzed first and who you were outbuzzed by.
5. Click **Leave Room** to leave.

### Moderators

1. Click **Create Room** ([here](https://atombowl.web.app/buzzer_create.html)).
2. Enter team names and your name, and choose official NSB rules or open **advanced settings**.
3. Share the join code with the **Copy** button.
4. **Open Tossup** (choose the topic) or **Open Bonus** (choose the team).
5. Score answers and click **End Room** when you are done.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Buzz (practice and buzzer rooms) |

## Troubleshooting

- **Page won't load or looks stale:** hard refresh with Ctrl+Shift+R (Cmd+Shift+R on Mac).
- **No voice:** pick another voice in Settings. Voices depend on your browser and OS.
- **Can't sign in with Google:** allow pop-ups for the site and try again.
- **Something else:** see [SUPPORT.md](SUPPORT.md) or open an [issue](https://github.com/shankar-sachin/atombowl/issues).

*Last updated October 2026.*
