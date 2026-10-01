import React from 'react';
import { StyleSheet } from 'react-native';
import AiAssistFab from '../../../components/AiAssistFab';
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
    <AiAssistFab style={styles.quickAssist} onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })} />
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
  // Sits above the bar's right edge; the web's launcher is bottom-right too.
  quickAssist: {
    position: 'absolute',
    right: 18,
    top: -76,
    zIndex: 10,
  },
});
