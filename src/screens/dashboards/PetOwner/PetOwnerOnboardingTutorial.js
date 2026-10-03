import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from '../../../utils/secureStorage';

const STORAGE_KEY_PREFIX = 'pawcruz_pet_owner_tutorial_seen_';

// One flag per account, not per device -- a returning owner on a fresh
// install should not be re-onboarded, and a shared/reset device should not
// skip onboarding for a different account signing in on it.
export async function hasSeenPetOwnerTutorial(userId) {
  if (!userId) return true;
  try {
    const value = await SecureStore.getItemAsync(`${STORAGE_KEY_PREFIX}${userId}`);
    return value === '1';
  } catch {
    return true;
  }
}

export async function markPetOwnerTutorialSeen(userId) {
  if (!userId) return;
  try {
    await SecureStore.setItemAsync(`${STORAGE_KEY_PREFIX}${userId}`, '1');
  } catch {
    // Non-critical -- worst case the tutorial reappears next launch.
  }
}

const STEPS = [
  {
    key: 'welcome',
    icon: require('../../assets/paw1.png'),
    title: 'Welcome to PawCruz',
    description: "Here's a quick look at how to get around your Pet Owner dashboard.",
  },
  {
    key: 'menu',
    icon: require('../../assets/Dashboard_Icon.png'),
    title: 'Get around from the bottom bar',
    description: 'Use the navigation bar at the bottom of the screen to jump to Home, Pets, Book, Appointments, Queue, or Messages from any screen.',
  },
  {
    key: 'queue',
    icon: require('../../assets/List.png'),
    title: 'Track your queue number',
    description: 'Your live queue number sits at the top of the Dashboard. Tap "View Queue" to see your status and estimated wait once you check in at the clinic.',
  },
  {
    key: 'appointment',
    icon: require('../../assets/Appointment_Icon.png'),
    title: 'Book a visit',
    description: 'Use "Book Appointment" to schedule a clinic visit, then check "Appointments" to view, reschedule, or cancel your bookings.',
  },
  {
    key: 'pets',
    icon: require('../../assets/Pets_Icon.png'),
    title: 'Manage your pets',
    description: 'Open "Animal Patients" to keep pet profiles and medical records up to date.',
  },
  {
    key: 'messages',
    icon: require('../../assets/Message_Icon.png'),
    title: 'Message the clinic',
    description: 'Reach the clinic directly through "Messages" whenever you have a question.',
  },
  {
    key: 'assist',
    icon: require('../../assets/chatbot.png'),
    tint: false,
    title: 'Need quick help?',
    description: 'The support button at the bottom of the screen opens PawCruz Pet Care Assistant for fast answers.',
  },
];

export default function PetOwnerOnboardingTutorial({ visible, onFinish, onSkip }) {
  const [stepIndex, setStepIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fade]);

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const goNext = () => {
    if (isLast) {
      onFinish?.();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const goBack = () => setStepIndex((current) => Math.max(0, current - 1));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { opacity: fade }]}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Image
              source={step.icon}
              style={[styles.icon, step.tint === false ? null : styles.iconTinted]}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>

          <View style={styles.dotsRow}>
            {STEPS.map((s, index) => (
              <View key={s.key} style={[styles.dot, index === stepIndex && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actionsRow}>
            {stepIndex > 0 ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={goBack} activeOpacity={0.85}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.secondaryButtonSpacer} />
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={goNext} activeOpacity={0.9}>
              <LinearGradient
                colors={['#1e5a8c', '#256297', '#2c6ba3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 35, 48, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: 'center',
  },
  skipButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 1,
  },
  skipButtonText: {
    color: '#78909b',
    fontSize: 13,
    fontWeight: '800',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#eff9fc',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  icon: {
    width: 40,
    height: 40,
  },
  iconTinted: {
    tintColor: '#2c6ba3',
  },
  title: {
    color: '#123a5e',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    color: '#5f7f94',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 22,
    maxWidth: 300,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 22,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#d9edf2',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#2c6ba3',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
  },
  secondaryButtonSpacer: {
    minWidth: 60,
  },
  secondaryButtonText: {
    color: '#78909b',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
