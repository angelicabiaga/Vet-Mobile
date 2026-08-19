import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const PET_OWNER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
  { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
  { key: 'pets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
  { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
];

const VETERINARIAN_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'vet-screen' },
  { key: 'patients', label: 'Patients', icon: require('../../assets/Pets_Icon.png'), route: 'VetPatients' },
  { key: 'appointments', label: 'My Appointments', icon: require('../../assets/Appointment_Icon.png'), route: 'VetAppointment' },
  { key: 'medical-records', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'VetMedRec' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'VetMessages' },
];

const STAFF_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
  { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'StaffAppointment' },
  { key: 'mypets', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
];

export default function PetOwnerSideDrawer({ visible, onClose, navigation, user, activeKey, role = 'pet_owner' }) {
  const [mounted, setMounted] = useState(visible);
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      animation.setValue(0);
      Animated.spring(animation, {
        toValue: 1,
        damping: 20,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) return;
    Animated.timing(animation, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [animation, mounted, visible]);

  const navigateTo = (item) => {
    onClose?.();
    navigation.navigate(item.route, { user });
  };

  const normalizedRole = String(role).trim().toLowerCase();
  const menuItems =
    normalizedRole === 'veterinarian' ? VETERINARIAN_MENU_ITEMS :
    normalizedRole === 'staff' ? STAFF_MENU_ITEMS :
    PET_OWNER_MENU_ITEMS;

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: animation }]}>
          <TouchableOpacity
            style={styles.backdropTouch}
            onPress={onClose}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{
                translateX: animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-420, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.drawerTitle}>Menu</Text>
              <Text style={styles.drawerSubtitle}>
                {normalizedRole === 'veterinarian' ? 'PawCruz Veterinarian' : normalizedRole === 'staff' ? 'PawCruz Staff' : 'PawCruz Pet Owner'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {menuItems.map((item) => {
            const active = item.key === activeKey;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.menuItem, active && styles.menuItemActive]}
                onPress={() => navigateTo(item)}
                activeOpacity={0.88}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Image source={item.icon} style={styles.icon} resizeMode="contain" />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,43,51,0.62)' },
  backdropTouch: { flex: 1 },
  drawer: {
    width: '75%', height: '100%', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 20,
    backgroundColor: '#447C99', borderTopRightRadius: 30, borderBottomRightRadius: 30,
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#14384a', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.28,
    shadowRadius: 18, elevation: 32,
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingHorizontal: 4 },
  drawerTitle: { color: '#ffffff', fontSize: 23, fontWeight: '900' },
  drawerSubtitle: { color: '#d8edf3', fontSize: 12, fontWeight: '700', marginTop: 4 },
  closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#ffffff', fontSize: 28, fontWeight: '500', lineHeight: 30 },
  menuItem: { minHeight: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 12 },
  menuItemActive: { backgroundColor: 'rgba(255,255,255,0.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)' },
  iconWrap: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(68,124,153,0.42)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  iconWrapActive: { backgroundColor: 'rgba(38,96,126,0.82)' },
  icon: { width: 20, height: 20, tintColor: '#ffffff' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: '#ffffff' },
});
