import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { StudentTabParamList } from './types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import ProgressScreen from '../screens/progress/ProgressScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EvaluationsScreen from '../screens/evaluations/EvaluationsScreen';

const Tab = createBottomTabNavigator<StudentTabParamList>();

export default function StudentNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFEFB',
          borderTopColor: '#DCE5DB',
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 7,
          height: 62 + insets.bottom,
        },
        tabBarActiveTintColor: '#0A3824',
        tabBarInactiveTintColor: '#7A887D',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'camera' : 'camera-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Attendance',
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Progress',
        }}
      />
      <Tab.Screen
        name="Evaluations"
        component={EvaluationsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'star' : 'star-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Results',
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Reports',
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Alerts',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Account',
        }}
      />
    </Tab.Navigator>
  );
}
