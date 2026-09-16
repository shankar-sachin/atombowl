type AtomSettings = {
  sfx: boolean;
  tts: boolean;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  div: string;
  mode: string;
  rememberTopics: boolean;
  autoCheck?: boolean;
  autoThreshold?: number;
  highContrast: boolean;
  animations: boolean;
  fontSize: string;
  accent: string;
  theme: string;
};

type AutoCheckerResult = {
  isCorrect: boolean;
  confidence: number;
  matched: string;
};

type AutoChecker = {
  grade(input: {
    userAnswer: string;
    correctAnswer: string;
    questionType: string;
    threshold: number;
  }): AutoCheckerResult;
};

type PracticeScoreStats = {
  answered: number;
  correct: number;
  totalTime: number;
  slowCorrect: number;
};

type AtomScoreEngine = {
  compute: (stats: PracticeScoreStats) => number;
};

declare global {
  interface Window {
    atomSettings?: AtomSettings;
    atomNavigate?: (url: string) => void;
    go?: (page: string) => void;
    autoChecker?: AutoChecker;
    ATOM_API_BASE?: string;
    startRun?: (mode: string) => void;
    bank?: unknown[];
    atomScoreEngine?: AtomScoreEngine;
    atomAccount?: {
      getUser: () => unknown | null;
      getProfile?: () => {
        username?: string;
        playerName?: string;
        displayName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        photoURL?: string;
      } | null;
      getGuestTag?: () => string;
      onAuthChange: (cb: (user: unknown | null) => void) => () => void;
      signInWithProvider: (providerId: string) => Promise<unknown>;
      signInWithEmail: (email: string, password: string) => Promise<unknown>;
      signInWithIdentifier?: (identifier: string, password: string) => Promise<unknown>;
      signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<unknown>;
      signUpWithDetails?: (details: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        username: string;
        password: string;
        playerName?: string;
      }) => Promise<unknown>;
      signOut: () => Promise<void>;
      loadRemoteSettings: () => Promise<unknown | null>;
      saveSettings: (settings: AtomSettings) => Promise<void>;
      updatePracticeStats: (patch: {
        totalRuns?: number;
        totalAnswered?: number;
        totalCorrect?: number;
        totalTime?: number;
        totalSlowCorrect?: number;
      }) => Promise<void>;
      loadPracticeStats?: () => Promise<{
        totalRuns?: number;
        totalAnswered?: number;
        totalCorrect?: number;
        totalTime?: number;
        totalSlowCorrect?: number;
      } | null>;
      isUsernameAvailable?: (username: string) => Promise<boolean>;
      resetPassword: (email: string) => Promise<void>;
      getSyncError?: () => string;
      updateAccountProfile?: (patch: {
        username?: string;
        playerName?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        photoURL?: string;
      }) => Promise<unknown>;
      loadBuzzerProfile: () => Promise<{ name?: string; team?: string } | null>;
      saveBuzzerProfile: (profile: { name?: string; team?: string }) => Promise<void>;
    };
  }

  interface Element {
    dataset?: DOMStringMap;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
  }

  interface HTMLElement {
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    options?: HTMLOptionsCollection;
    src?: string;
    alt?: string;
  }
}

declare module "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js" {
  export const GoogleAuthProvider: any;
  export const OAuthProvider: any;
  export const EmailAuthProvider: any;
  export const signInWithPopup: any;
  export const linkWithPopup: any;
  export const createUserWithEmailAndPassword: any;
  export const signInWithEmailAndPassword: any;
  export const linkWithCredential: any;
  export const signOut: any;
  export const onAuthStateChanged: any;
  export const updateProfile: any;
}

declare module "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js" {
  export const doc: any;
  export const getDoc: any;
  export const setDoc: any;
  export const updateDoc: any;
  export const serverTimestamp: any;
  export const increment: any;
  export const runTransaction: any;
}

declare module "./firebase.js" {
  export const app: any;
  export const analytics: any;
  export const db: any;
  export const auth: any;
  export const ensureAnonAuth: () => Promise<any>;
}

export {};
