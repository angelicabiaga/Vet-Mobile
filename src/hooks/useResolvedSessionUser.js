import { useEffect, useState } from 'react';
import { getStoredSession } from '../api/authService';

const normalizeUser = (value) => {
  if (!value) return null;
  const id = value.id || value.user_id || value.profile_id || null;
  if (!id) return value;
  return {
    ...value,
    id,
    user_id: value.user_id || id,
    profile_id: value.profile_id || id,
  };
};

export default function useResolvedSessionUser(routeUser) {
  const [user, setUser] = useState(() => normalizeUser(routeUser));
  const routeUserId = routeUser?.id || routeUser?.user_id || routeUser?.profile_id || null;

  useEffect(() => {
    let active = true;
    const normalizedRouteUser = normalizeUser(routeUser);

    if (routeUserId) {
      setUser(normalizedRouteUser);
      return () => { active = false; };
    }

    getStoredSession()
      .then((session) => {
        if (active) setUser(normalizeUser(session?.profile || session?.user || null));
      })
      .catch(() => {
        if (active) setUser(normalizedRouteUser);
      });

    return () => { active = false; };
  }, [routeUserId]);

  return user;
}
