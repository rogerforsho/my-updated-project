import type { ComponentType } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { StudentStackParamList, StudentTabParamList } from './types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import ProgressScreen from '../screens/progress/ProgressScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EvaluationsScreen from '../screens/evaluations/EvaluationsScreen';
import HteEvaluationScreen from '../screens/hteEvaluation/HteEvaluationScreen';
import GroupScreen from '../screens/group/GroupScreen';
import MoreScreen from '../screens/more/MoreScreen';

const Tab = createBottomTabNavigator<StudentTabParamList>();
const Stack = createNativeStackNavigator<StudentStackParamList>();

// Icon with a soft pill behind it when its tab is selected.
function TabIcon({ on, off, color, focused }: { on: IconName; off: IconName; color: string; focused: boolean }) {
  return (
    <View style={{ width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.tint : 'transparent' }}>
      <Ionicons name={focused ? on : off} size={22} color={color} />
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: keyof StudentTabParamList; component: ComponentType; on: IconName; off: IconName }[] = [
  { name: 'Attendance', component: AttendanceScreen, on: 'camera', off: 'camera-outline' },
  { name: 'Progress', component: ProgressScreen, on: 'stats-chart', off: 'stats-chart-outline' },
  { name: 'Reports', component: ReportsScreen, on: 'document-text', off: 'document-text-outline' },
  { name: 'Group', component: GroupScreen, on: 'chatbubbles', off: 'chatbubbles-outline' },
  { name: 'Notifications', component: NotificationsScreen, on: 'notifications', off: 'notifications-outline' },
  { name: 'More', component: MoreScreen, on: 'ellipsis-horizontal', off: 'ellipsis-horizontal' },
];

function StudentTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#0A3824',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 7,
          height: 62 + insets.bottom,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        // 10 px so six labels fit on a 360 px phone.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      {TABS.map(t => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={{
            title: t.name,
            tabBarIcon: ({ color, focused }) => <TabIcon on={t.on} off={t.off} color={color} focused={focused} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const pushedHeader = {
  headerShown: true,
  headerTintColor: '#0A3824',
  headerStyle: { backgroundColor: '#FFFEFB' },
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' as const },
};

export default function StudentNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={StudentTabs} />
      <Stack.Screen name="Evaluations" component={EvaluationsScreen} options={{ ...pushedHeader, title: 'Results' }} />
      <Stack.Screen name="HteEvaluation" component={HteEvaluationScreen} options={{ ...pushedHeader, title: 'HTE Evaluation' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ ...pushedHeader, title: 'Account' }} />
    </Stack.Navigator>
  );
}
