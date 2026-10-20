import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HANDLE_HEIGHT = 76;
const HANDLE_WIDTH = 14;

interface EdgeHandleDrawerProps {
  onToggle: () => void;
  isOpen: boolean;
}

export const EdgeHandleDrawer: React.FC<EdgeHandleDrawerProps> = ({ onToggle, isOpen }) => {
  // Vertical position along the right edge (starts at 40% height)
  const translateY = useSharedValue(SCREEN_HEIGHT * 0.4);
  const startY = useSharedValue(SCREEN_HEIGHT * 0.4);

  // Horizontal offset for drag gesture (0 = flush to edge, negative = pulled inward)
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0.85);

  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    opacity.value = withTiming(0.9, { duration: 150 });
    idleTimer.current = setTimeout(() => {
      opacity.value = withTiming(0.35, { duration: 800 });
    }, 3000);
  };

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const handleToggleJs = () => {
    resetIdleTimer();
    onToggle();
  };

  // Drag gesture: drag inward to open, or slide up/down to reposition along edge
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = translateY.value;
      opacity.value = withTiming(1, { duration: 100 });
    })
    .onUpdate((e) => {
      'worklet';
      // Only allow pulling inward (negative translateX)
      translateX.value = Math.min(0, Math.max(-60, e.translationX));
      translateY.value = startY.value + e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      // If pulled inward by more than 20px, trigger open
      if (e.translationX < -20 || e.velocityX < -200) {
        runOnJS(handleToggleJs)();
      }

      // Always snap horizontal position back to edge (flush)
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });

      // Keep vertical position bounded within screen margins
      const targetY = Math.max(
        80,
        Math.min(SCREEN_HEIGHT - HANDLE_HEIGHT - 90, translateY.value)
      );
      translateY.value = withSpring(targetY, { damping: 18, stiffness: 200 });

      runOnJS(resetIdleTimer)();
    });

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      runOnJS(handleToggleJs)();
    });

  const composed = Gesture.Simultaneous(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  // Hide the handle when full overlay is open
  if (isOpen) return null;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.handleContainer, animatedStyle]}>
        <View style={styles.neonTrack}>
          <View style={styles.neonDot} />
          <View style={styles.neonBar} />
          <View style={styles.neonDot} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  handleContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: 'rgba(20, 20, 32, 0.92)',
    borderWidth: 1.5,
    borderRightWidth: 0,
    borderColor: '#7c5cff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 998,
    elevation: 8,
    shadowColor: '#7c5cff',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  neonTrack: {
    width: 3.5,
    height: 38,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  neonDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#00f2fe',
  },
  neonBar: {
    width: 2.5,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#7c5cff',
  },
});
