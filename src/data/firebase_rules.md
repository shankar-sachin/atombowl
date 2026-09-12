# Firebase account setup

Enable Email/Password and Google in Firebase Authentication → Sign-in method. Enable Anonymous for buzzer guests. Apple and Microsoft currently show “Coming soon”; no provider configuration is needed for them. Add each deployed site hostname (and localhost for development) under Authentication → Settings → Authorized domains. Password reset uses Firebase's configured email template.

The client uses project `nsbatombowl`. Its public Firebase web configuration is in `src/ts/firebase.ts`. Never put provider secrets in that file.

## Account security rules

The repository now includes a complete `firestore.rules` for accounts and buzzer rooms and a `firebase.json` configuration. Review it against any additional collections in your deployed project before deploying. Room buzz writes are restricted to the authenticated member’s identity and a valid first-buzz transition; scores and host controls require the host UID. The clients and rules must be released together.

For an account-only integration, merge the following matches **inside your existing** `/databases/{database}/documents` block. Preserve your room rules. Remove any broad public read/write rule that also matches account documents: Firestore grants access if any matching allow expression succeeds.

```text
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  match /{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
match /usernames/{username} {
  allow get: if !exists(/databases/$(database)/documents/usernames/$(username))
    || resource.data.keys().hasOnly(['uid', 'username'])
    || (request.auth != null && resource.data.uid == request.auth.uid);
  allow list: if false;
  allow create: if request.auth != null
    && request.auth.token.firebase.sign_in_provider != 'anonymous'
    && username.matches('^[a-z0-9]{3,20}$')
    && request.resource.data.keys().hasOnly(['uid', 'username'])
    && request.resource.data.uid == request.auth.uid
    && request.resource.data.username == username
    && getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.profile.username == username;
  allow update: if request.auth != null
    && resource.data.uid == request.auth.uid
    && request.resource.data.uid == resource.data.uid
    && request.resource.data.username == username
    && request.resource.data.keys().hasOnly(['uid', 'username']);
  allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
}
```

Before enabling public username availability reads, remove `email` and any other private fields from **existing** username documents using a trusted administrative migration. The client now writes only `uid` and `username`; it cannot sanitize records owned by other users. Password login intentionally uses email, since Firebase does not support username/password login and a public username-to-email directory discloses private email addresses.

Username reservation and profile creation commit together in a Firestore transaction. Firebase Auth creation is separate: if profile setup fails afterward, the account remains usable by email, and the UI reports the partial failure rather than deleting an account that may contain guest data.

## Verification

Run `npm run build`, `npm test`, and `npm run test:firebase` (requires Java 21+ and the Firebase emulator download). Unit tests use Firebase mocks; the emulator suite executes the real room transactions and security rules locally. These do not prove that deployed rules or OAuth configuration are correct. In a staging project verify signup, duplicate username, returning email login, password reset, Google login, guest upgrade, reload persistence, profile save, logout, and two different accounts in the same browser. Verify that another UID cannot read or write private user documents and that username records have no email addresses.

Reference: https://firebase.google.com/docs/firestore/security/rules-conditions

## Buzzer room verification

Use two separate browser profiles for distinct players; tabs share Firebase identity. Create a room, join via its code or generated invite, race two buzzes, grade each outcome, exhaust team lockouts, award a bonus without a buzz, pause/resume the game clock, and reload both host and player pages. A host may also use the player view with the same UID, but it is the same membership, not a second player. New room IDs are their collision-checked codes; old random-ID rooms remain joinable by code.

Timers use device wall clocks for display, with Firestore rules enforcing the deadline against server request time. The host processes expiry when connected; late buzzes are denied even if the host disconnects. Keep device clocks synchronized. This browser/Firestore architecture resolves the first committed buzz, and does not promise competition-grade latency fairness.

Deploy rules only after reviewing the existing project's collections and legacy username data: `firebase deploy --only firestore:rules --project nsbatombowl`. This repository change does not itself deploy rules or enable authentication providers.
