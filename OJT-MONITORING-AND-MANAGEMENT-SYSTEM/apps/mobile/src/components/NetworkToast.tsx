import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface NetworkToastProps {
  isSlow?: boolean;
  isOffline?: boolean;
}

export default function NetworkToast({ isSlow = false, isOffline = false }: NetworkToastProps) {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isSlow || isOffline) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isSlow, isOffline, fadeAnim]);

  if (!isSlow && !isOffline) return null;

  return (
    <Animated.View style={[s.container, { opacity: fadeAnim }]}>
      <View style={[s.pill, isOffline ? s.pillOffline : s.pillSlow]}>
        <View style={[s.dot, isOffline ? s.dotOffline : s.dotSlow]} />
        <Text style={s.text}>
          {isOffline
            ? 'No internet connection. Please reconnect.'
            : 'Slow connection detected, please wait...'}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pillSlow: {
    backgroundColor: '#092E1D',
    borderWidth: 1,
    borderColor: 'rgba(255, 204, 0, 0.4)',
  },
  pillOffline: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotSlow: {
    backgroundColor: '#E4DBC4',
  },
  dotOffline: {
    backgroundColor: '#ef4444',
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
