import React from 'react';
import { Animated, Easing } from 'react-native';

const ANIMATION_MS = 220;
const SETTLE_MS = 120;
// The lower row is up to 96px tall; hiding it changes the page height, which
// moves the scroll offset by itself. These keep that from flip-flopping.
const ROW_HEIGHT = 96;
const TRAVEL_TO_TOGGLE = 24; // px of real scrolling in one direction before switching
const HIDE_AFTER_Y = 48;     // never hide while near the top
const SHOW_AT_TOP_Y = 8;

// Hides the header's lower row (caption + name) while scrolling down and shows
// it again when scrolling up or back at the top. Used by the Veterinarian and
// Pet Owner headers.
export const useLowerHeaderMotion = () => {
  const scrollViewRef = React.useRef(null);
  const lowerHeaderAnimation = React.useRef(new Animated.Value(1)).current;
  const isLowerHeaderVisible = React.useRef(true);
  // Scroll events are ignored until the row has opened/closed and settled.
  const ignoreUntil = React.useRef(0);
  const lastScrollY = React.useRef(0);
  const travel = React.useRef(0); // + down, - up, since the last direction change

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;
    if (isLowerHeaderVisible.current === shouldBeVisible) return;

    isLowerHeaderVisible.current = shouldBeVisible;
    ignoreUntil.current = Date.now() + ANIMATION_MS + SETTLE_MS;
    travel.current = 0;
    lowerHeaderAnimation.stopAnimation();
    Animated.timing(lowerHeaderAnimation, {
      toValue,
      duration: ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handleScroll = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    const delta = y - lastScrollY.current;
    lastScrollY.current = y;

    // Offset jumps caused by the row itself opening/closing aren't the user.
    if (Date.now() < ignoreUntil.current) return;

    if (y <= SHOW_AT_TOP_Y) {
      animateLowerHeader(1);
      return;
    }

    // Too little to scroll: hiding the row would only make the page bounce.
    const scrollable = (contentSize?.height || 0) - (layoutMeasurement?.height || 0);
    if (scrollable < ROW_HEIGHT * 2) return;

    // Accumulate travel in the current direction; reset when it reverses.
    if ((delta > 0 && travel.current < 0) || (delta < 0 && travel.current > 0)) travel.current = 0;
    travel.current += delta;

    if (travel.current > TRAVEL_TO_TOGGLE && y > HIDE_AFTER_Y) animateLowerHeader(0);
    else if (travel.current < -TRAVEL_TO_TOGGLE) animateLowerHeader(1);
  };

  return { scrollViewRef, lowerHeaderAnimation, handleScroll };
};
