import { Stack, usePathname } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import './global.css';

export default function RootLayout() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isPortal = pathname.startsWith('/vendor') || pathname.startsWith('/admin-portal');
  const buyerMobileRoutes = ['/', '/cart', '/cafeteria', '/services', '/profile', '/faq', '/delivery', '/payment', '/order', '/notifications', '/marketplace', '/supermarket'];
  const isBuyerMobileRoute = buyerMobileRoutes.some((route) => route === '/' ? pathname === route : pathname === route || pathname.startsWith(`${route}/`));
  // Onboarding and authentication deliberately use the full desktop canvas.
  // The buyer marketplace remains presented as a mobile app on wide browsers.
  const useBuyerFrame = Platform.OS === 'web' && width >= 680 && !isPortal && isBuyerMobileRoute;

  const navigator = (
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

  if (useBuyerFrame) {
    return <View style={styles.webCanvas}><View style={styles.mobileFrame}>{navigator}</View></View>;
  }

  return (
    navigator
  );
}

const styles = StyleSheet.create({
  webCanvas: { flex: 1, backgroundColor: '#E7ECF3', alignItems: 'center' },
  mobileFrame: { flex: 1, width: '100%', maxWidth: 430, backgroundColor: '#FFFFFF', overflow: 'hidden', shadowColor: '#01193D', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
});
