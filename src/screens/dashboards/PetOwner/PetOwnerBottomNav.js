import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import BottomTabBar from '../../../components/BottomTabBar';

// Pet Owner mobile navigation. Replaces the old hamburger/side drawer with a
// bottom tab bar so every section is one tap away. Profile and Notifications
// stay reachable via the header avatar/bell buttons.
const HOME_ROUTE = 'petowner-screen';

export const PET_OWNER_NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: 'home', route: HOME_ROUTE },
  { key: 'pets', label: 'Animal Patients', icon: 'paw', route: 'PetOwnerMyPets' },
  { key: 'appointment', label: 'Book Appointment', icon: 'book', route: 'PetOwnerAppointment' },
  { key: 'myAppointments', label: 'Appointments', icon: 'appointments', route: 'PetOwnerMyAppointments' },
  { key: 'queue', label: 'Queue', icon: 'queue', route: 'PetOwnerQueue' },
  { key: 'messages', label: 'Messages', icon: 'messages', route: 'PetOwnerMessages' },
];

// Tab roots crossfade instead of sliding (see App.js) so switching tabs feels
// like one screen changing rather than a new page being pushed.
export const PET_OWNER_TAB_ROUTES = PET_OWNER_NAV_ITEMS.map((item) => item.route);

export default function PetOwnerBottomNav({ navigation, user, activeKey, showQuickAssist = true }) {
  const quickAssist = showQuickAssist ? (
    <TouchableOpacity
      style={styles.quickAssist}
      onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Open Quick Assist"
    >
      <View style={styles.quickAssistInner}>
        <Image source={require('../../assets/support.png')} style={styles.quickAssistIcon} resizeMode="contain" />
      </View>
    </TouchableOpacity>
  ) : null;

  return (
    <BottomTabBar
      items={PET_OWNER_NAV_ITEMS}
      homeRoute={HOME_ROUTE}
      navigation={navigation}
      user={user}
      activeKey={activeKey}
      floatingAction={quickAssist}
    />
  );
}

const styles = StyleSheet.create({
  quickAssist: {
    position: 'absolute',
    right: 20,
    top: -64,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2c6ba3',
    borderWidth: 2,
    borderColor: '#d7eef3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#123a5e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 10,
  },
  quickAssistInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e7f6f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAssistIcon: { width: 22, height: 22, tintColor: '#123a5e' },
});
