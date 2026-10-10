import React from 'react';
import { Animated } from 'react-native';

// The header's lower row (caption + first name), hidden while scrolling down
// and shown again when scrolling up. Same motion as the Veterinarian header
// (VetShell); drive it with useLowerHeaderMotion's `lowerHeaderAnimation`.
export default function CollapsingHeaderRow({ animation, children }) {
  const animatedStyle = animation
    ? {
        maxHeight: animation.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
        opacity: animation,
        transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
      }
    : null;
  return <Animated.View style={[{ overflow: 'hidden' }, animatedStyle]}>{children}</Animated.View>;
}
