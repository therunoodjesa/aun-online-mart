import { useEffect, useMemo, useRef } from 'react';
import {
  View, Image, StyleSheet,
  Animated, useWindowDimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authstore';
import { resolveAccountHome } from '../lib/account-route';

const logoSource = require('../assets/images/aom-logo.png');

export default function SplashScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const logoSize = useMemo(() => {
    const shortestSide = Math.min(width, height);
    return Math.min(Math.max(shortestSide * 0.62, 180), 340);
  }, [width, height]);
  const logoY = useRef(new Animated.Value(-Math.max(height, 500))).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const poweredOpacity = useRef(new Animated.Value(0)).current;

  const continueFromSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/onboarding'); return; }
      useAuthStore.getState().setSession(session);
      await useAuthStore.getState().fetchProfile(session.user.id);
      router.replace(await resolveAccountHome(session.user));
    } catch {
      router.replace('/onboarding');
    }
  };

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoY, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(poweredOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
        holdTimer = setTimeout(() => void continueFromSession(), 5000);
      });
  }, 1000);

    return () => {
      clearTimeout(timer);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.logoWrap,
          {
            width: logoSize,
            height: logoSize,
            transform: [{ translateY: logoY }],
            opacity: logoOpacity,
          },
        ]}
      >
        <Image
          source={logoSource}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[styles.powered, { opacity: poweredOpacity }]}>Powered by iRO TECH</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#01193D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: '100%',
    height: '100%',
  },
  powered: {
    position: 'absolute',
    bottom: 42,
    alignSelf: 'center',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
