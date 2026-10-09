import { getOAuthRedirectUrl } from "./supabaseConfig.js";
import { getSupabaseClient } from "./supabaseClient.js";

const freezeState = (status, session = null, error = null) => Object.freeze({
  status,
  session,
  user: session?.user ?? null,
  error,
});

const safeError = () => Object.freeze({ message: "Online account request failed." });

export function createAuthService({
  getClient = getSupabaseClient,
  getRedirectUrl = getOAuthRedirectUrl,
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

  // Auth events are authoritative over a getSession() request started earlier.
  // Without this revision guard, a late null/stale result can log out a user
  // who just signed in, or resurrect a session after an explicit sign-out.
  let sessionEventRevision = 0;
  const publishSessionEvent = (event, session) => {
    if (event === "SIGNED_OUT") {
      sessionEventRevision += 1;
      return publish(freezeState("signed-out"));
    }
    if (session?.user) {
      sessionEventRevision += 1;
      return publish(stateFromSession(session));
    }
    // A null INITIAL_SESSION or transient event is not an authoritative logout.
    // getSession() resolves the cold-start signed-out state if no newer event wins.
    return state;
  };

  const initialize = () => {
    if (initializationPromise) return initializationPromise;
    const preservedSession = state.session?.user ? state.session : null;
    if (!preservedSession) publish(freezeState("loading"));
    const revisionAtStart = sessionEventRevision;
    const request = (async () => {
      try {
        const client = getClient();
        if (!client?.auth) {
          if (sessionEventRevision !== revisionAtStart) return state;
          return publish(freezeState("unavailable"));
        }
        if (!authSubscription) {
          const response = client.auth.onAuthStateChange?.((event, session) => {
            publishSessionEvent(event, session);
          });
          authSubscription = response?.data?.subscription ?? response?.subscription ?? null;
        }
        const { data, error } = await client.auth.getSession();
        // Supabase can emit INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, or
        // SIGNED_OUT while getSession is still pending. Never overwrite the
        // event's newer state with the request's older snapshot.
        if (sessionEventRevision !== revisionAtStart) return state;
        if (error) {
          if (state.session?.user || preservedSession?.user) {
            return publish(stateFromSession(state.session?.user ? state.session : preservedSession));
          }
          return publish(freezeState("error", null, safeError()));
        }
        return publish(stateFromSession(data?.session ?? null));
      } catch {
        if (sessionEventRevision !== revisionAtStart) return state;
        // A transient network/storage exception is not a confirmed logout.
        if (state.session?.user || preservedSession?.user) {
          return publish(stateFromSession(state.session?.user ? state.session : preservedSession));
        }
        return publish(freezeState("error", null, safeError()));
      }
    })();
    initializationPromise = request;
    void request.finally(() => {
      if (initializationPromise === request) initializationPromise = null;
    });
    return request;
  };

  const signIn = async () => {
    if (state.status === "signing-in") return state;
    await initialize();
    if (state.status === "signing-in" || state.status === "signed-in") return state;
    const client = getClient();
    if (!client?.auth) return publish(freezeState("unavailable"));
    publish(freezeState("signing-in"));
    try {
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
      return publish(freezeState("signed-out"));
    } catch {
      return publish(freezeState("error", null, safeError()));
    }
  };

  return Object.freeze({
    initializeAuth: initialize,
    getAuthState: () => state,
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
export const subscribeToAuth = authService.subscribeToAuth;
export const signInWithGoogle = authService.signInWithGoogle;
export const signOut = authService.signOut;
