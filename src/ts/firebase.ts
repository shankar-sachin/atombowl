// @ts-nocheck
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth, initializeAuth, browserSessionPersistence, signInAnonymously, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNvcpI84hInA_iRWnF9R7k6FCnRkZ_Xtk",
  authDomain: "nsbatombowl.firebaseapp.com",
  projectId: "nsbatombowl",
  storageBucket: "nsbatombowl.firebasestorage.app",
  messagingSenderId: "974348736378",
  appId: "1:974348736378:web:8a9dff15eb3ce057b9a8c3",
  measurementId: "G-07E60ZCBSP"
};

const app = initializeApp(firebaseConfig);
let analytics: any = null;
void isSupported().then(supported => {
  if (supported) analytics = getAnalytics(app);
}).catch(() => {});

const db = getFirestore(app);

// Local testing against `firebase emulators:start --only auth,firestore`.
// Opt in with ?emulators=1 on localhost; the choice is remembered for the tab.
// ?tabauth=1 (emulators only) keeps the anonymous user in sessionStorage so each tab
// is its own player; without it, tabs share one IndexedDB user like production does.
const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const params = new URLSearchParams(location.search);
if (isLocalHost) {
  const flag = params.get("emulators");
  if (flag !== null) sessionStorage.setItem("atom_emulators", flag === "1" ? "1" : "0");
}
const useEmulators = isLocalHost && sessionStorage.getItem("atom_emulators") === "1";
if (useEmulators) {
  const tabFlag = params.get("tabauth");
  if (tabFlag !== null) sessionStorage.setItem("atom_tabauth", tabFlag === "1" ? "1" : "0");
}
const useTabAuth = useEmulators && sessionStorage.getItem("atom_tabauth") === "1";
const auth = useTabAuth
  ? initializeAuth(app, { persistence: browserSessionPersistence })
  : getAuth(app);
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

let anonymousSignIn: Promise<any> | null = null;
async function ensureAnonAuth() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!anonymousSignIn) {
    anonymousSignIn = signInAnonymously(auth).then((credential) => credential.user)
      .finally(() => { anonymousSignIn = null; });
  }
  return anonymousSignIn;
}

export { app, analytics, db, auth, ensureAnonAuth, useEmulators };
