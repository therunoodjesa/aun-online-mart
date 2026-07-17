import { Stack } from 'expo-router';

export default function BuyerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="cafeteria" />
      <Stack.Screen name="services" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="faq" />
      <Stack.Screen name="delivery" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="order" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="marketplace" />
      <Stack.Screen name="supermarket" />
    </Stack>
  );
}
