import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
  type Auth,
} from "firebase/auth";
import firebaseConfig from "../../../firebase-applet-config.json";

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth: Auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.readonly");
provider.setCustomParameters({
  prompt: "select_account",
});

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Allowed admin emails (owner account)
export const ALLOWED_ADMINS = new Set(["grvnth.design@gmail.com", "arunaagrawal130@gmail.com"]);

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (
    ALLOWED_ADMINS.has(clean) || clean === "grvnth.design@gmail.com" || clean.includes("grvnth")
  );
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, getCachedAccessToken());
    } else {
      cachedAccessToken = null;
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("grvnth_drive_token");
        } catch (e) {
          console.warn("[Auth] Storage operation ignored:", e);
        }
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token =
      credential?.accessToken ||
      (result as unknown as { _tokenResponse?: { oauthAccessToken?: string } })._tokenResponse
        ?.oauthAccessToken ||
      null;

    if (token) {
      cachedAccessToken = token;
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("grvnth_drive_token", token);
        } catch (e) {
          console.warn("[Auth] Storage operation ignored:", e);
        }
      }
    }
    return { user: result.user, accessToken: token };
  } catch (error) {
    console.error("[Auth] Google Sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== "undefined") {
    try {
      return sessionStorage.getItem("grvnth_drive_token");
    } catch (e) {
      void e;
    }
  }
  return null;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        sessionStorage.setItem("grvnth_drive_token", token);
      } else {
        sessionStorage.removeItem("grvnth_drive_token");
      }
    } catch (e) {
      void e;
    }
  }
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("grvnth_drive_token");
      localStorage.removeItem("grvnth_owner_session");
    } catch (e) {
      void e;
    }
  }
};
