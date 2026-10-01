import React, { useEffect, useMemo, useState } from "react";
import ScreenErrorBoundary from "../components/ScreenErrorBoundary";

// Single source of truth for the authenticated (logged-in) account.
// Set on login, updated when the user edits their OWN profile, cleared on logout.
// Viewing another pet owner / patient never touches this.
let sessionUser = null;
const listeners = new Set();

const idOf = (user) => (user && typeof user === "object" ? user.id || user.user_id || user.profile_id || null : null);

export function getSessionUser() {
  return sessionUser;
}

export function setSessionUser(user) {
  sessionUser = idOf(user) ? user : null;
  listeners.forEach((listener) => listener(sessionUser));
}

export function subscribeSessionUser(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionUser() {
  const [user, setUser] = useState(sessionUser);
  useEffect(() => {
    setUser(sessionUser);
    return subscribeSessionUser(setUser);
  }, []);
  return user;
}

// The `user` a screen should see: always the logged-in account. A route `user`
// is only kept when it IS the logged-in account (it may carry fresher profile
// edits); any other account in the params is replaced.
export function resolveScreenUser(loggedIn, routeUser) {
  const loggedInId = idOf(loggedIn);
  if (!loggedInId) return routeUser;
  if (String(idOf(routeUser)) === String(loggedInId)) return { ...loggedIn, ...routeUser };
  return loggedIn;
}

const wrapped = new Map();

// Wraps a screen so `route.params.user` is always the authenticated account.
export function withSessionUser(Screen) {
  if (wrapped.has(Screen)) return wrapped.get(Screen);
  function SessionScreen(props) {
    const loggedIn = useSessionUser();
    const routeUser = props.route?.params?.user;
    const user = useMemo(() => resolveScreenUser(loggedIn, routeUser), [loggedIn, routeUser]);
    const route = useMemo(
      () => (user === routeUser ? props.route : { ...props.route, params: { ...(props.route?.params || {}), user } }),
      [props.route, user, routeUser]
    );
    const goHome = () => {
      const home = user?.role === "veterinarian" ? "vet-screen" : user?.role === "pet_owner" ? "petowner-screen" : "login";
      props.navigation?.reset({ index: 0, routes: [{ name: home, params: home === "login" ? undefined : { user } }] });
    };
    return (
      <ScreenErrorBoundary screenName={props.route?.name} onGoHome={goHome}>
        <Screen {...props} route={route} />
      </ScreenErrorBoundary>
    );
  }
  SessionScreen.displayName = `WithSessionUser(${Screen.displayName || Screen.name || "Screen"})`;
  wrapped.set(Screen, SessionScreen);
  return SessionScreen;
}
