import { useEffect, useRef } from 'react';
import {
  View, Image, StyleSheet,
  Animated, Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const logoY = useRef(new Animated.Value(-400)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 5 second delay then 2 second drop
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
      ]).start();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.logoWrap,
          {
            transform: [{ translateY: logoY }],
            opacity: logoOpacity,
          },
        ]}
      >
        <Image
          source={require('../assets/images/aom-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
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
  logoWrap: {
    width: width * 0.75,
    height: width * 0.75,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});