import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionUser } from '../../../session/sessionStore';

// One place to resolve the owner's display name so every Pet Owner header shows
// the same full name ("Janelle Despa") instead of a mix of usernames and names.
export function getPetOwnerFullName(user) {
  const joined = [user?.first_name || user?.firstName, user?.last_name || user?.lastName]
    .filter(Boolean)
    .join(' ');
  return user?.full_name || user?.fullName || joined || user?.name || user?.username || 'Pet Owner';
}

// First name only, for headers and greetings ("Janelle Despa" -> "Janelle").
// Uses first_name when the profile has one, otherwise the first word of the
// full name, skipping a "Dr." title. Falls back to the username, then `fallback`.
export function getFirstName(user, fallback = 'Pet Owner') {
  const explicit = String(user?.first_name || user?.firstName || '').trim();
  if (explicit) return explicit;
  const words = String(user?.full_name || user?.fullName || user?.name || '').trim().split(/\s+/).filter(Boolean);
  const first = /^dr\.?$/i.test(words[0] || '') ? words[1] : words[0];
  return first || user?.username || fallback;
}

const idOf = (user) => user?.id || user?.user_id || user?.profile_id || null;

// Left-aligned caption + name for the lower row of the header (Pet Owner and
// Veterinarian). The caption describes the current screen (e.g. "Book your
// appointment"). Pass `user` to show the logged-in account's FIRST name, or
// `name` to show something else (such as the other person in a message
// thread). `accent={false}` drops the thin divider line for headers that
// already have a button beside the text.
export default function PetOwnerHeaderGreeting({ caption, name, user, accent = true, fallback = 'Pet Owner' }) {
  // The logged-in account's latest saved profile wins, so a first name changed
  // in Edit Profile shows on every screen, even ones opened with older params.
  const sessionUser = useSessionUser();
  const account = sessionUser
    ? (!user || String(idOf(user)) === String(idOf(sessionUser)) ? { ...(user || {}), ...sessionUser } : sessionUser)
    : user;
  const displayName = name || getFirstName(account, fallback);

  return (
    <View style={styles.wrap}>
      {accent ? <View style={styles.accent} /> : null}
      <View style={[styles.textBlock, !accent && styles.textBlockNoAccent]}>
        <Text style={styles.caption} numberOfLines={1}>{caption}</Text>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 2,
  },
  accent: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(216, 237, 243, 0.7)',
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  textBlockNoAccent: {
    marginLeft: 14,
  },
  caption: {
    fontSize: 12,
    color: '#b8d4e5',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 3,
  },
});
