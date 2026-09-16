// @ts-nocheck
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
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
let analytics = null;
void isSupported().then(supported => {
    if (supported)
        analytics = getAnalytics(app);
}).catch(() => { });
const db = getFirestore(app);
const auth = getAuth(app);
let anonymousSignIn = null;
async function ensureAnonAuth() {
    await auth.authStateReady();
    if (auth.currentUser)
        return auth.currentUser;
    if (!anonymousSignIn) {
        anonymousSignIn = signInAnonymously(auth).then((credential) => credential.user)
            .finally(() => { anonymousSignIn = null; });
    }
    return anonymousSignIn;
}
export { app, analytics, db, auth, ensureAnonAuth };
//# sourceMappingURL=firebase.js.map