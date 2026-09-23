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

  const publishSessionEvent = (event, session) => {
    if (session?.user) return publish(stateFromSession(session));
    if (event === "SIGNED_OUT") return publish(freezeState("signed-out"));
    // INITIAL_SESSION can arrive before getSession() resolves and transient auth
    // events may omit a session. Never turn a healthy restored session into a
    // visible logout unless Supabase explicitly emitted SIGNED_OUT.
    if (state.session?.user) return state;
    if (event === "INITIAL_SESSION") return state;
    return publish(freezeState("signed-out"));
  };

  const initialize = () => {
    if (initializationPromise) return initializationPromise;
    const preservedSession = state.session?.user ? state.session : null;
    if (!preservedSession) publish(freezeState("loading"));
    const request = (async () => {
      const client = getClient();
      if (!client?.auth) return publish(freezeState("unavailable"));
      try {
        if (!authSubscription) {
          const response = client.auth.onAuthStateChange?.((event, session) => {
            publishSessionEvent(event, session);
          });
          authSubscription = response?.data?.subscription ?? response?.subscription ?? null;
        }
        const { data, error } = await client.auth.getSession();
        if (error) {
          // A network/service failure is not proof that the browser session was
          // revoked. Keep a restored session usable and retry on the next init.
          if (state.session?.user || preservedSession?.user) {
            return publish(stateFromSession(state.session?.user ? state.session : preservedSession));
          }
          return publish(freezeState("error", null, safeError()));
        }
        return publish(stateFromSession(data?.session ?? null));
      } catch {
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
