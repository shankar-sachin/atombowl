# Security Policy

## Reporting a vulnerability

If you find a security problem, **report it immediately by opening a [GitHub Issue](https://github.com/shankar-sachin/atombowl/issues/new) with both the `security` and `urgent` labels.**

Please include:
- What is affected (page, feature, Firestore rule, account flow).
- Steps to reproduce.
- The impact you think it has.

Public issues are visible to everyone, so do not post real user data, passwords or tokens. Use test accounts and describe the problem without them.

## Supported versions

Only the latest deployment at <https://atombowl.web.app> and the `main` branch are supported.

## Scope

In scope: the Atom Bowl site, Firebase Authentication flows, Firestore security rules (`firestore.rules`) and buzzer-room logic.

Out of scope: vulnerabilities in Firebase or Google itself (report those to Google), and attacks that need physical access or are purely social engineering.

## Notes

The Firebase web configuration in `src/ts/firebase.ts` is public by design. Access is controlled by the Firestore rules and Authentication, not by hiding that key.
