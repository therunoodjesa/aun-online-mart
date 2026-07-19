import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { resolveAccountHome } from '../../lib/account-route';

export default function BuyerLayout() {
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    let active = true;
    const protectBuyerArea = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user) { router.replace('/(auth)/login'); return; }
      const destination = await resolveAccountHome(session.user);
      if (!active) return;
      if (destination !== '/(buyer)/') { router.replace(destination); return; }
      setCheckingRole(false);
    };
    void protectBuyerArea();
    return () => { active = false; };
  }, [router]);

  if (checkingRole) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;

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

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#01193D' } });
