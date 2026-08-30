import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function PortalInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const userAgent = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(userAgent));
    setInstalled(window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (Platform.OS !== 'web' || installed) return null;
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };
  return <View style={styles.card}>
    <View style={styles.icon}><Ionicons name="phone-portrait-outline" size={22} color="#176E73" /></View>
    <View style={styles.copy}><Text style={styles.title}>Use AOM Operations like an app</Text><Text style={styles.text}>{isIos ? 'In Safari, tap Share, then Add to Home Screen. You can enable order alerts once it is installed.' : 'Install this workspace for faster access to orders, stock and store updates.'}</Text></View>
    {installPrompt ? <TouchableOpacity onPress={() => void install()} style={styles.button}><Text style={styles.buttonText}>Install</Text></TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#E1F6F0', borderWidth: 1, borderColor: '#81DABF', borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  icon: { width: 39, height: 39, borderRadius: 10, backgroundColor: '#C7EEE3', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: '#176E73', fontSize: 14, fontWeight: '800' },
  text: { color: '#176E73', fontSize: 12, lineHeight: 17, marginTop: 2 },
  button: { minHeight: 36, borderRadius: 8, backgroundColor: '#01193D', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
