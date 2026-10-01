import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

// The floating "Ask PawCruz AI" button, matching the web's chatbot launcher
// (AppShell's .chatbotLauncher): a gradient orb with the bot's face, a
// spinning highlight, two pulse rings, a nodding head, a blinking online dot
// and a gentle float. Sizes are the web's phone sizes.

const ORB = 60;
const FACE = 46;
const ICON = 35;
const CHATBOT_ICON = require('../screens/assets/chatbot.png');

// The highlight that sweeps around the rim (the web's conic-gradient arc).
const RIM_RADIUS = ORB / 2 - 2;
const RIM = 2 * Math.PI * RIM_RADIUS;

// On the web the "Ask PawCruz AI" label slides out on hover. Phones have no
// hover, so it slides out once per app session and again while pressed.
let labelIntroShown = false;

export default function AiAssistFab({ onPress, style }) {
  const float = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulseA = useRef(new Animated.Value(0)).current;
  const pulseB = useRef(new Animated.Value(0)).current;
  const nod = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(Boolean(value)); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduceMotion(Boolean(value)));
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timing = (value, toValue, duration, easing = Easing.inOut(Easing.sin)) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    const animations = [
      // aiFabFloat: up 6px and back over 3.6s.
      Animated.loop(Animated.sequence([timing(float, 1, 1800), timing(float, 0, 1800)])),
      // aiFabSpin: one turn every 3.2s.
      Animated.loop(timing(spin, 1, 3200, Easing.linear)),
      // aiFabPulse: 2.6s each, the second ring half a beat behind.
      Animated.loop(timing(pulseA, 1, 2600, Easing.out(Easing.ease))),
      Animated.sequence([Animated.delay(1300), Animated.loop(timing(pulseB, 1, 2600, Easing.out(Easing.ease)))]),
      // aiFabNod: still for most of 5s, then a quick tilt left and right.
      Animated.loop(Animated.sequence([
        Animated.delay(4300),
        timing(nod, -1, 200),
        timing(nod, 0.8, 200),
        timing(nod, 0, 300),
      ])),
      // aiFabBlink: the online dot's glow, every 2s.
      Animated.loop(Animated.sequence([timing(blink, 1, 1000), timing(blink, 0, 1000)])),
    ];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [reduceMotion, float, spin, pulseA, pulseB, nod, blink]);

  useEffect(() => {
    if (labelIntroShown) return undefined;
    labelIntroShown = true;
    const intro = Animated.sequence([
      Animated.delay(700),
      Animated.timing(label, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(label, { toValue: 0, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    intro.start();
    return () => intro.stop();
  }, [label]);

  const pressTo = (toValue) => {
    Animated.parallel([
      Animated.spring(press, { toValue, damping: 9, stiffness: 260, mass: 0.7, useNativeDriver: true }),
      Animated.timing(label, { toValue, duration: toValue ? 220 : 180, useNativeDriver: true }),
    ]).start();
  };

  const ringStyle = (value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, style, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.label,
          {
            opacity: label,
            transform: [
              { translateX: label.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              { scale: label.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.labelText} numberOfLines={1}>Ask PawCruz AI</Text>
      </Animated.View>

      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(1)}
        onPressOut={() => pressTo(0)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Ask PawCruz AI"
      >
        <Animated.View
          style={[
            styles.orbWrap,
            {
              transform: [
                { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                { rotate: press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-4deg'] }) },
              ],
            },
          ]}
        >
          {!reduceMotion ? (
            <>
              <Animated.View pointerEvents="none" style={[styles.ring, ringStyle(pulseA)]} />
              <Animated.View pointerEvents="none" style={[styles.ring, ringStyle(pulseB)]} />
            </>
          ) : null}

          <LinearGradient colors={['#2c6ba3', '#4DA8DA', '#78c4ca', '#2c6ba3']} start={{ x: 0.1, y: 0.9 }} end={{ x: 0.9, y: 0.1 }} style={styles.orb}>
            {!reduceMotion ? (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
              >
                <Svg width={ORB} height={ORB}>
                  <Circle cx={ORB / 2} cy={ORB / 2} r={RIM_RADIUS} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${RIM * 0.24} ${RIM}`} />
                  <Circle cx={ORB / 2} cy={ORB / 2} r={RIM_RADIUS} fill="none" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${RIM * 0.1} ${RIM}`} strokeDashoffset={-RIM * 0.07} />
                </Svg>
              </Animated.View>
            ) : null}
            <View style={styles.face}>
              <Animated.Image
                source={CHATBOT_ICON}
                resizeMode="contain"
                style={[styles.faceIcon, { transform: [{ rotate: nod.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] }) }] }]}
              />
            </View>
          </LinearGradient>

          <View pointerEvents="none" style={styles.dotSpot}>
            <Animated.View
              style={[
                styles.dotGlow,
                {
                  opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                  transform: [{ scale: blink.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                },
              ]}
            />
            <View style={styles.dot} />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: ORB, height: ORB },
  label: {
    position: 'absolute',
    right: ORB + 10,
    top: (ORB - 38) / 2,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    ...Platform.select({
      ios: { shadowColor: '#1c5680', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  labelText: { fontSize: 13.5, fontWeight: '800', color: '#1e5a8c' },
  orbWrap: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: '#2c6ba3',
    ...Platform.select({
      ios: { shadowColor: '#1c5680', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.38, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 2,
    borderColor: 'rgba(77, 168, 218, 0.7)',
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#143c5a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5 },
      android: { elevation: 3 },
    }),
  },
  faceIcon: { width: ICON, height: ICON, transformOrigin: '50% 80%' },
  dotSpot: { position: 'absolute', right: 2, bottom: 4, width: 14, height: 14 },
  dotGlow: { position: 'absolute', top: 0, left: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#35d07f' },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#35d07f', borderWidth: 2.5, borderColor: '#ffffff' },
});
