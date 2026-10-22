import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, Dimensions, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

interface ZoomableImageProps {
  uri: string;
  width?: number;
  height?: number;
  isWebtoon?: boolean;
  onCenterTap?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  uri,
  width = SCREEN_WIDTH,
  height = SCREEN_HEIGHT,
  isWebtoon = false,
  onCenterTap,
}) => {
  const [currentUri, setCurrentUri] = useState(uri);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [fallbackTried, setFallbackTried] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    setCurrentUri(uri);
    setHasError(false);
    setFallbackTried(false);
    setLoading(true);
  }, [uri]);

  const handleTapJs = () => {
    if (onCenterTap) {
      onCenterTap();
    }
  };

  const handleError = () => {
    if (!fallbackTried && (currentUri.includes('.mangadex.network') || currentUri.includes(':44300'))) {
      const match = currentUri.match(/\/(data(?:-saver)?\/[a-f0-9]+\/[^/?#]+)/i);
      if (match) {
        setFallbackTried(true);
        setCurrentUri(`https://uploads.mangadex.org/${match[1]}`);
        setLoading(true);
        setHasError(false);
        return;
      }
    }
    setLoading(false);
    setHasError(true);
  };

  const handleRetry = () => {
    setHasError(false);
    setLoading(true);
    const sep = currentUri.includes('?') ? '&' : '?';
    setCurrentUri(`${currentUri}${sep}_t=${Date.now()}`);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1.1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(true)
    .onUpdate((e) => {
      'worklet';
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      if (onCenterTap) {
        runOnJS(handleTapJs)();
      }
    });

  const composedGestures = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const hostMatch = currentUri.match(/https?:\/\/[^\/]+/);
  const imageHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...(hostMatch ? { Referer: `${hostMatch[0]}/` } : {}),
  };

  return (
    <GestureDetector gesture={composedGestures}>
      <View style={[styles.container, { width, height }]}>
        <Animated.View style={[styles.imageWrapper, animatedStyle]}>
          <Image
            source={{
              uri: currentUri,
              headers: imageHeaders,
            }}
            style={styles.image}
            contentFit={isWebtoon ? 'cover' : 'contain'}
            transition={150}
            cachePolicy="disk"
            onLoadStart={() => setLoading(true)}
            onLoad={() => {
              setLoading(false);
              setHasError(false);
            }}
            onError={handleError}
          />
        </Animated.View>
        {loading && !hasError && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#7c5cff" />
          </View>
        )}
        {hasError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={36} color="#f87171" />
            <Text style={styles.errorText}>Image failed to load</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
              <Ionicons name="refresh" size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Tap to Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 24, 0.88)',
    padding: 20,
  },
  errorText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 14,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c5cff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
