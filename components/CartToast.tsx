import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type CartToastProps = { visible: boolean; message: string; onDismiss: () => void };

export function CartToast({ visible, message, onDismiss }: CartToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 2200);
    return () => clearTimeout(timer);
  }, [onDismiss, visible]);

  if (!visible) return null;
  return <View pointerEvents="none" style={styles.wrap}><View style={styles.toast}><View style={styles.icon}><Ionicons name="checkmark" size={17} color="#01193D" /></View><Text numberOfLines={1} style={styles.text}>Added to cart</Text><Ionicons name="cart-outline" size={19} color="#F8F3ED" /></View></View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, bottom: 108, alignItems: 'center', zIndex: 50 },
  toast: { maxWidth: 360, minHeight: 52, borderRadius: 26, backgroundColor: '#01193D', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#01193D', shadowOpacity: 0.24, shadowRadius: 11, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  icon: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1, color: '#F8F3ED', fontSize: 14, fontWeight: '700' },
});
