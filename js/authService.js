import { getOAuthRedirectUrl } from "./supabaseConfig.js";
import { getSupabaseClient } from "./supabaseClient.js";
import {
  adoptSupabaseSession,
  clearAccountPlatformSession,
  getAccountHandoffState,
  markWordstrikeAccountActivity,
  prepareAccountPlatformStorage,
} from "./thiepnAccount.js";

const freezeState = (status, session = null, error = null) => Object.freeze({
  status,
  session,
  user: session?.user ?? null,
  error,
});

const safeError = () => Object.freeze({ message: "Online account request failed." });

const defaultAccountPlatform = Object.freeze({
  prepareStorage: prepareAccountPlatformStorage,
  adoptSession: adoptSupabaseSession,
  clearSession: clearAccountPlatformSession,
  markActivity: markWordstrikeAccountActivity,
  getHandoffState: getAccountHandoffState,
});

export function createAuthService({
  getClient = getSupabaseClient,
  getRedirectUrl = getOAuthRedirectUrl,
  accountPlatform = defaultAccountPlatform,
} = {}) {
  let state = freezeState("idle");
  let initializationPromise = null;
  let authSubscription = null;
  const listeners = new Set();

  const publish = (nextState) => {
    state = nextState;
    for (const listener of listeners) listener(state);
    return state;
  };

  const stateFromSession = (session) => freezeState(
    session?.user ? "signed-in" : "signed-out",
    session?.user ? session : null,
  );

  const syncAccountPlatform = (session) => {
    if (!session?.user) {
      accountPlatform.clearSession?.();
      return null;
    }
    const normalized = accountPlatform.adoptSession?.(session) ?? session;
    void accountPlatform.markActivity?.(normalized);
    return normalized;
  };

  const initialize = () => {
    if (initializationPromise) return initializationPromise;
    publish(freezeState("loading"));
    initializationPromise = (async () => {
      accountPlatform.prepareStorage?.();
      const client = getClient();
      if (!client?.auth) return publish(freezeState("unavailable"));
      try {
        if (!authSubscription) {
          const response = client.auth.onAuthStateChange?.((_event, session) => {
            const normalized = syncAccountPlatform(session);
            publish(stateFromSession(normalized));
          });
          authSubscription = response?.data?.subscription ?? response?.subscription ?? null;
        }
        const { data, error } = await client.auth.getSession();
        if (error) return publish(freezeState("error", null, safeError()));
        const normalized = syncAccountPlatform(data?.session ?? null);
        return publish(stateFromSession(normalized));
      } catch {
        return publish(freezeState("error", null, safeError()));
      }
    })();
    return initializationPromise;
  };

  const signIn = async () => {
    if (state.status === "signing-in") return state;
    await initialize();
    if (state.status === "signing-in" || state.status === "signed-in") return state;
    const client = getClient();
    if (!client?.auth) return publish(freezeState("unavailable"));
    publish(freezeState("signing-in"));
    try {
      // Keep Supabase JS as WordStrike's OAuth/refresh engine. It writes the
      // canonical shared storage key, while the platform adapter owns the
      // account/session metadata contract after the session is returned.
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getRedirectUrl() },
      });
      if (error) return publish(freezeState("error", null, safeError()));
      return state;
    } catch {
      return publish(freezeState("error", null, safeError()));
    }
  };

  const signOutCurrentBrowser = async () => {
    if (state.status === "signing-out") return state;
    await initialize();
    const client = getClient();
    if (!client?.auth) return publish(freezeState("unavailable"));
    publish(freezeState("signing-out", state.session));
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) return publish(freezeState("error", null, safeError()));
      accountPlatform.clearSession?.();
      return publish(freezeState("signed-out"));
    } catch {
      return publish(freezeState("error", null, safeError()));
    }
  };

  return Object.freeze({
    initializeAuth: initialize,
    getAuthState: () => state,
    getAccountHandoffState: () => accountPlatform.getHandoffState?.(state.session) ?? Object.freeze({
      signedIn: state.status === "signed-in",
      requiresAdditionalVerification: false,
      assuranceLevel: "aal1",
    }),
    subscribeToAuth(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    signInWithGoogle: signIn,
    signOut: signOutCurrentBrowser,
  });
}

const authService = createAuthService();

export const initializeAuth = authService.initializeAuth;
export const getAuthState = authService.getAuthState;
export const getAuthAccountHandoffState = authService.getAccountHandoffState;
export const subscribeToAuth = authService.subscribeToAuth;
export const signInWithGoogle = authService.signInWithGoogle;
export const signOut = authService.signOut;
