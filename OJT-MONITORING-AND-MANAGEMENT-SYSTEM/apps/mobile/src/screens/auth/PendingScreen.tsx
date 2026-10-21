import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Pending'> };

export default function PendingScreen({ navigation }: Props) {
  return (
    <View style={s.root}>
      <View style={s.card}>
        <View style={s.iconWrapper}>
          <Ionicons name="shield-checkmark" size={34} color="#0A3824" />
        </View>
        <Text style={s.title}>Registration Under Review</Text>
        <Text style={s.subtitle}>
          Your 4th-year trainee registration has been submitted and is awaiting review by OJT Coordinator.
        </Text>

        <View style={s.infoBox}>
          <Text style={s.infoTitle}>Verification Steps</Text>
          {[
            'OJT Coordinator verifies student number & 4th-year standing (ICS / IBE)',
            'Training company and supervisor assignment will be linked',
            'Sign in to access your attendance and rendered hours dashboard',
          ].map((item, i) => (
            <View key={i} style={s.stepRow}>
              <Ionicons name="checkmark-circle" size={16} color="#0A3824" style={{ marginTop: 1 }} />
              <Text style={s.stepText}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('SignIn')} activeOpacity={0.85}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="arrow-back" size={16} color="#E4DBC4" />
            <Text style={s.btnText}>Return to Sign In</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#092E1D', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 40 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(10,56,36,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(10,56,36,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#0A3824', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#526257', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  infoBox: {
    width: '100%',
    backgroundColor: 'rgba(10,56,36,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(10,56,36,0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  stepText: { fontSize: 12, color: '#37483C', flex: 1, lineHeight: 16 },
  btn: {
    width: '100%',
    backgroundColor: '#0A3824',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.3)',
  },
  btnText: { color: '#E4DBC4', fontSize: 14, fontWeight: '800' },
});
