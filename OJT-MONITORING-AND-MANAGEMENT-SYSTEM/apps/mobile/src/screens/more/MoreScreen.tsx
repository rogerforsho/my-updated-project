import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { StudentStackParamList } from '../../navigation/types';
import { type } from '../../theme';

const ROWS: { route: Exclude<keyof StudentStackParamList, 'Tabs'>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'Evaluations', label: 'Results', icon: 'star-outline' },
  { route: 'HteEvaluation', label: 'HTE Evaluation', icon: 'business-outline' },
  { route: 'Profile', label: 'Account', icon: 'person-outline' },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<StudentStackParamList>>();
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Text style={s.title}>More</Text>
      <View style={s.card}>
        {ROWS.map((row, i) => (
          <TouchableOpacity
            key={row.route}
            style={[s.row, i > 0 && s.rowDivider]}
            onPress={() => navigation.navigate(row.route)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={row.label}
          >
            <Ionicons name={row.icon} size={22} color="#0A3824" />
            <Text style={s.label}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#7A887D" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2', paddingHorizontal: 20 },
  title: { ...type.title, paddingTop: 16, paddingBottom: 16 },
  card: { backgroundColor: '#FFFEFB', borderRadius: 20, borderWidth: 1, borderColor: '#DCE5DB', overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EEF2ED' },
  label: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0A3824' },
});
