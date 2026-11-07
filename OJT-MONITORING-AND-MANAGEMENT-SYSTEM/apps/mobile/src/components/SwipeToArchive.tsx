import { useRef, type ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const THRESHOLD = -96;

/** Swipe the child left past the threshold to archive it; releases short of it spring back. */
export default function SwipeToArchive({ onArchive, children }: { onArchive: () => void; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const archive = useRef(onArchive);
  archive.current = onArchive;

  const pan = useRef(PanResponder.create({
    // Only claim clearly horizontal drags so the list keeps scrolling vertically.
    onMoveShouldSetPanResponder: (_, g) => g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx <= THRESHOLD) {
        Animated.timing(x, { toValue: -Dimensions.get('window').width, duration: 160, useNativeDriver: true })
          .start(() => archive.current());
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  })).current;

  return (
    <View>
      <View style={s.action} pointerEvents="none">
        <Ionicons name="archive-outline" size={18} color="#ffffff" />
        <Text style={s.actionText}>Archive</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  action: { ...StyleSheet.absoluteFill, borderRadius: 18, backgroundColor: '#526257', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22, gap: 2 },
  actionText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
