import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import SignInScreen from '../screens/auth/SignInScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PendingScreen from '../screens/auth/PendingScreen';
import ResubmitScreen from '../screens/auth/ResubmitScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator({ initialRouteName = 'SignIn' }: { initialRouteName?: keyof AuthStackParamList }) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Pending" component={PendingScreen} />
      <Stack.Screen name="Resubmit" component={ResubmitScreen} />
    </Stack.Navigator>
  );
}
