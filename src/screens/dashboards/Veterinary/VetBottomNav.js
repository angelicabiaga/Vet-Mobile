import React from 'react';
import BottomTabBar from '../../../components/BottomTabBar';

// Veterinarian mobile navigation. Mirrors the Vet Dashboard's service shortcuts
// (Animal Patients, Appointments, Schedule, Messages) plus Home. Profile and
// Notifications stay reachable via the header avatar/bell buttons.
const HOME_ROUTE = 'vet-screen';

export const VET_NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: 'home', route: HOME_ROUTE },
  { key: 'patients', label: 'Animal Patients', icon: 'paw', route: 'VetPatientOwners' },
  { key: 'appointments', label: 'Appointments', icon: 'appointments', route: 'VetAppointment' },
  { key: 'schedule', label: 'Schedule', icon: 'schedule', route: 'VetSchedule' },
  { key: 'messages', label: 'Messages', icon: 'messages', route: 'VetMessages' },
];

// Tab roots crossfade instead of sliding (see App.js).
export const VET_TAB_ROUTES = VET_NAV_ITEMS.map((item) => item.route);

export default function VetBottomNav({ navigation, user, activeKey }) {
  return (
    <BottomTabBar
      items={VET_NAV_ITEMS}
      homeRoute={HOME_ROUTE}
      navigation={navigation}
      user={user}
      activeKey={activeKey}
    />
  );
}
