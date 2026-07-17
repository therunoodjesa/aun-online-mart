import { Stack } from 'expo-router';
import './global.css';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(buyer)" />
      <Stack.Screen name="(vendor)" />
      <Stack.Screen name="vendor-portal" />
      <Stack.Screen name="admin-portal" />
    </Stack>
  );
}
