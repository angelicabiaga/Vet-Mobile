import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

// Shared icon-only bottom tab bar for the mobile roles. Each role supplies its
// own items (see PetOwnerBottomNav / VetBottomNav); this file owns the look,
// the sliding highlight, keyboard hiding and the tab-style navigation.

// All icons share one 24x24 grid and stroke width so they render at exactly
// the same visual size (the old PNGs each had different built-in padding).
const ICON_SIZE = 24;
const ICON_PATHS = {
  home: (
    <>
      <Path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    </>
  ),
  paw: (
    <>
      <Circle cx="11" cy="4" r="2" />
      <Circle cx="18" cy="8" r="2" />
      <Circle cx="20" cy="16" r="2" />
      <Path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </>
  ),
  book: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
      <Path d="M3 10h18" />
      <Path d="M16 19h6" />
      <Path d="M19 16v6" />
    </>
  ),
  appointments: (
    <>
      <Rect x="8" y="2" width="8" height="4" rx="1" />
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Path d="M12 11h4" />
      <Path d="M12 16h4" />
      <Path d="M8 11h.01" />
      <Path d="M8 16h.01" />
    </>
  ),
  schedule: (
    <>
      <Path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <Path d="M16 2v4" />
      <Path d="M8 2v4" />
      <Path d="M3 10h5" />
      <Path d="M17.5 17.5 16 16.3V14" />
      <Circle cx="16" cy="16" r="6" />
    </>
  ),
  queue: (
    <>
      <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <Path d="M13 5v2" />
      <Path d="M13 17v2" />
      <Path d="M13 11v2" />
    </>
  ),
  messages: (
    <>
      <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <Path d="M8 12h.01" />
      <Path d="M12 12h.01" />
      <Path d="M16 12h.01" />
    </>
  ),
};

function NavIcon({ name, color }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24">
      <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name]}
      </G>
    </Svg>
  );
}

const BAR_HEIGHT = 62;
const BAR_PADDING = 8;
const BAR_BORDER = 1;
const PILL_WIDTH = 48;
const PILL_HEIGHT = 42;
const INACTIVE_COLOR = '#7d97a8';
const ACTIVE_COLOR = '#ffffff';

// Every screen renders its own bar, so the new screen's highlight starts where
// the previous screen's was and slides over -- the bar reads as one continuous
// control while the screens crossfade underneath it. Tracked per role (keyed by
// the role's home route) so the two roles never share a starting position.
const lastActiveKeyByHome = {};

// Android resizes the window for the keyboard (app.json softwareKeyboardLayoutMode
// "resize"), which would push the bar up on top of chat inputs and forms. While
// the keyboard is open the bar leaves the layout (so the screen gets the full
// height at once) and slides down behind the keyboard; it slides back on close.
function useKeyboardHidden() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const hideProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      Animated.timing(hideProgress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
      Animated.timing(hideProgress, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [hideProgress]);

  return { keyboardOpen, hideProgress };
}

// Tabs keep the stack flat: [..., Home, <tab>, <its sub-screens>]. Switching tabs
// drops the old tab's screens instead of piling new pages on top, so Back from
// any tab returns Home, and an already-open tab is reused (no remount/refetch).
function switchTab(navigation, homeRoute, item, user) {
  const params = user ? { user } : undefined;
  const state = navigation.getState?.();
  const routes = state?.routes || [];
  const current = routes[state?.index ?? routes.length - 1];
  if (current?.name === item.route) return;

  const homeIndex = routes.findIndex((route) => route.name === homeRoute);
  if (homeIndex === -1) {
    navigation.navigate(item.route, params);
    return;
  }

  const base = routes.slice(0, homeIndex + 1);
  let nextRoutes = base;
  if (item.route !== homeRoute) {
    const existing = routes.slice(homeIndex + 1).find((route) => route.name === item.route);
    nextRoutes = [...base, existing || { name: item.route, params }];
  }

  navigation.reset({ ...state, routes: nextRoutes, index: nextRoutes.length - 1 });
}

function NavItem({ item, index, position, indicatorOpacity, onPress }) {
  // The white icon fades in as the highlight slides under it, and the grey one out.
  const { activeOpacity, inactiveOpacity } = useMemo(() => {
    const active = Animated.multiply(
      position.interpolate({
        inputRange: [index - 1, index, index + 1],
        outputRange: [0, 1, 0],
        extrapolate: 'clamp',
      }),
      indicatorOpacity,
    );
    return { activeOpacity: active, inactiveOpacity: Animated.subtract(1, active) };
  }, [index, indicatorOpacity, position]);

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
    >
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.iconLayer, { opacity: inactiveOpacity }]}>
          <NavIcon name={item.icon} color={INACTIVE_COLOR} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, { opacity: activeOpacity }]}>
          <NavIcon name={item.icon} color={ACTIVE_COLOR} />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

// `items`: [{ key, label, icon, route }] where `icon` is a key of ICON_PATHS.
// `floatingAction`: optional absolutely-positioned element (e.g. Quick Assist)
// that sits above the bar and hides with it while the keyboard is open.
export default function BottomTabBar({ items, homeRoute, navigation, user, activeKey, floatingAction = null }) {
  const { keyboardOpen, hideProgress } = useKeyboardHidden();
  const activeIndex = items.findIndex((item) => item.key === activeKey);

  const initial = useRef(null);
  if (initial.current === null) {
    const previousIndex = items.findIndex((item) => item.key === lastActiveKeyByHome[homeRoute]);
    initial.current = {
      index: previousIndex >= 0 ? previousIndex : Math.max(activeIndex, 0),
      visible: previousIndex >= 0,
    };
  }
  const position = useRef(new Animated.Value(initial.current.index)).current;
  const indicatorOpacity = useRef(new Animated.Value(initial.current.visible ? 1 : 0)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const animations = [
      Animated.timing(indicatorOpacity, {
        toValue: activeIndex >= 0 ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ];
    if (activeIndex >= 0) {
      animations.push(Animated.spring(position, {
        toValue: activeIndex,
        damping: 18,
        stiffness: 190,
        mass: 0.9,
        useNativeDriver: true,
      }));
    }
    Animated.parallel(animations).start();
  }, [activeIndex, indicatorOpacity, position]);

  useEffect(() => {
    const markActive = () => { lastActiveKeyByHome[homeRoute] = activeIndex >= 0 ? activeKey : null; };
    if (navigation?.isFocused?.()) markActive();
    return navigation?.addListener?.('focus', markActive);
  }, [navigation, homeRoute, activeKey, activeIndex]);

  const count = items.length;
  const itemWidth = barWidth ? (barWidth - BAR_BORDER * 2 - BAR_PADDING * 2) / count : 0;
  const pillWidth = Math.min(PILL_WIDTH, Math.max(itemWidth - 4, 0));
  const firstPillX = BAR_PADDING + (itemWidth - pillWidth) / 2;

  const hideStyle = {
    opacity: hideProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: hideProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }],
  };

  return (
    <Animated.View
      style={[styles.wrapper, keyboardOpen && styles.wrapperKeyboardOpen, hideStyle]}
      pointerEvents={keyboardOpen ? 'none' : 'auto'}
    >
      {floatingAction}

      <View
        style={styles.bar}
        accessibilityRole="tablist"
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      >
        {itemWidth ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: pillWidth,
                opacity: indicatorOpacity,
                transform: [{
                  translateX: position.interpolate({
                    inputRange: [0, count - 1],
                    outputRange: [firstPillX, firstPillX + itemWidth * (count - 1)],
                  }),
                }],
              },
            ]}
          />
        ) : null}

        {items.map((item, index) => (
          <NavItem
            key={item.key}
            item={item}
            index={index}
            position={position}
            indicatorOpacity={indicatorOpacity}
            onPress={() => switchTab(navigation, homeRoute, item, user)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  wrapperKeyboardOpen: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: BAR_PADDING,
    borderWidth: BAR_BORDER,
    borderColor: '#dcebf3',
    shadowColor: '#123a5e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 14,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: (BAR_HEIGHT - BAR_BORDER * 2 - PILL_HEIGHT) / 2,
    height: PILL_HEIGHT,
    borderRadius: 16,
    backgroundColor: '#2c6ba3',
    shadowColor: '#2c6ba3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  iconLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
