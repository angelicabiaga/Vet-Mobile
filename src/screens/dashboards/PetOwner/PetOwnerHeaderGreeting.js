import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// One place to resolve the owner's display name so every Pet Owner header shows
// the same full name ("Janelle Despa") instead of a mix of usernames and names.
export function getPetOwnerFullName(user) {
  const joined = [user?.first_name || user?.firstName, user?.last_name || user?.lastName]
    .filter(Boolean)
    .join(' ');
  return user?.full_name || user?.fullName || joined || user?.name || user?.username || 'Pet Owner';
}

// Left-aligned caption + name for the lower row of the Pet Owner header. The
// caption describes the current screen (e.g. "Book your appointment"). Pass
// `user` to show the owner's full name, or `name` to show something else (such
// as the other person in a message thread). `accent={false}` drops the thin
// divider line for headers that already have a button beside the text.
export default function PetOwnerHeaderGreeting({ caption, name, user, accent = true }) {
  const displayName = name || getPetOwnerFullName(user);

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
