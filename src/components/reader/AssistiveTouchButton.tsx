import React, { useEffect, useRef } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = 46;
const EDGE_MARGIN = 12;

interface AssistiveTouchButtonProps {
  onPress: () => void;
}

export const AssistiveTouchButton: React.FC<AssistiveTouchButtonProps> = ({ onPress }) => {
  // Start docked at the right edge
  const translateX = useSharedValue(SCREEN_WIDTH - BUTTON_SIZE - EDGE_MARGIN);
  const translateY = useSharedValue(SCREEN_HEIGHT * 0.45);
  const startX = useSharedValue(SCREEN_WIDTH - BUTTON_SIZE - EDGE_MARGIN);
  const startY = useSharedValue(SCREEN_HEIGHT * 0.45);
  const opacity = useSharedValue(0.85);

  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    opacity.value = withTiming(0.9, { duration: 150 });
    idleTimer.current = setTimeout(() => {
      opacity.value = withTiming(0.42, { duration: 800 });
    }, 3000);
  };

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const handlePressJs = () => {
    resetIdleTimer();
    onPress();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = translateX.value;
      startY.value = translateY.value;
      opacity.value = withTiming(1, { duration: 100 });
    })
    .onUpdate((e) => {
      'worklet';
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      // Snap to nearest screen edge (left or right)
      const snapToRight = translateX.value > (SCREEN_WIDTH - BUTTON_SIZE) / 2;
      const targetX = snapToRight
        ? SCREEN_WIDTH - BUTTON_SIZE - EDGE_MARGIN
        : EDGE_MARGIN;

      // Keep within safe vertical margins
      const targetY = Math.max(
        80,
        Math.min(SCREEN_HEIGHT - BUTTON_SIZE - 100, translateY.value)
      );

      translateX.value = withSpring(targetX, {
        damping: 18,
        stiffness: 160,
      });
      translateY.value = withSpring(targetY, {
        damping: 18,
        stiffness: 160,
      });

      runOnJS(resetIdleTimer)();
    });

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      runOnJS(handlePressJs)();
    });

  const composed = Gesture.Simultaneous(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.floatingButton, animatedStyle]}>
        <Ionicons name="options" size={20} color="#ffffff" />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(22, 22, 32, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 92, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 998,
    elevation: 8,
    shadowColor: '#7c5cff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
});
