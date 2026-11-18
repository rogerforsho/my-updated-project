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

function StudentTabs() {
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
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
        name="Group"
        component={GroupScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size ?? 22} color={color} />
          ),
          title: 'Group',
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size ?? 22} color={color} />
          ),
          title: 'More',
        }}
      />
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
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ ...pushedHeader, title: 'Alerts' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ ...pushedHeader, title: 'Account' }} />
    </Stack.Navigator>
  );
}
