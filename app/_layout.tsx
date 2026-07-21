import { Stack, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '../lib/posthog';
import './global.css';

export default function RootLayout() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    posthog.screen(pathname, { previous_screen: previousPathname.current });
    previousPathname.current = pathname;
  }, [pathname]);
  const isPortal = pathname.startsWith('/vendor') || pathname.startsWith('/admin-portal') || pathname.startsWith('/cafeteria-portal');
  const buyerMobileRoutes = ['/', '/cart', '/cafeteria', '/services', '/profile', '/faq', '/delivery', '/payment', '/order', '/notifications', '/marketplace', '/supermarket'];
  const isBuyerMobileRoute = buyerMobileRoutes.some((route) => route === '/' ? pathname === route : pathname === route || pathname.startsWith(`${route}/`));
  // Onboarding and authentication deliberately use the full desktop canvas.
  // The buyer marketplace remains presented as a mobile app on wide browsers.
  const useBuyerFrame = Platform.OS === 'web' && width >= 680 && !isPortal && isBuyerMobileRoute;

  const navigator = (
    <PostHogProvider client={posthog} autocapture={{ captureScreens: false, captureTouches: true }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(buyer)" />
        <Stack.Screen name="(vendor)" />
        <Stack.Screen name="vendor-portal" />
        <Stack.Screen name="admin-portal" />
        <Stack.Screen name="cafeteria-portal" />
      </Stack>
    </PostHogProvider>
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
