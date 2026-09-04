import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function PortalInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [alertStatus, setAlertStatus] = useState<'idle' | 'enabling' | 'testing' | 'enabled' | 'tested' | 'unavailable' | 'blocked' | 'error'>('idle');
  const vapidPublicKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;

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

  // The browser keeps a push subscription after a reload. Restore that state
  // instead of asking an already-enabled device to enable alerts again.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let active = true;
    const restoreAlertState = async () => {
      if (!vapidPublicKey || !window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (active) setAlertStatus('unavailable');
        return;
      }
      if (Notification.permission === 'denied') {
        if (active) setAlertStatus('blocked');
        return;
      }
      // "default" means the device has not chosen yet. Never prompt on page load.
      if (Notification.permission !== 'granted') return;
      try {
        const registration = await navigator.serviceWorker.register('/aom-sw.js', { scope: '/' });
        const subscription = await registration.pushManager.getSubscription();
        const { data: auth } = await supabase.auth.getUser();
        if (!subscription || !auth.user) return;
        const payload = subscription.toJSON();
        if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) return;
        const { data, error } = await supabase.functions.invoke('portal-push', { body: { action: 'register', subscription: { endpoint: payload.endpoint, p256dh: payload.keys.p256dh, auth: payload.keys.auth, user_agent: navigator.userAgent } } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Device registration failed.');
        if (active) setAlertStatus('enabled');
      } catch (error) {
        console.warn('Unable to restore portal alerts', error);
        if (active) setAlertStatus('error');
      }
    };
    void restoreAlertState();
    return () => { active = false; };
  }, [vapidPublicKey]);

  if (Platform.OS !== 'web') return null;
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };
  const enableAlerts = async () => {
    if (!vapidPublicKey || !window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setAlertStatus('unavailable');
      return;
    }
    if (Notification.permission === 'denied') { setAlertStatus('blocked'); return; }
    try {
      setAlertStatus('enabling');
      await navigator.serviceWorker.register('/aom-sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setAlertStatus('blocked'); return; }
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const payload = subscription.toJSON();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) throw new Error('Please sign in again before enabling alerts.');
      const { data, error } = await supabase.functions.invoke('portal-push', { body: { action: 'register', subscription: { endpoint: payload.endpoint, p256dh: payload.keys.p256dh, auth: payload.keys.auth, user_agent: navigator.userAgent } } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Device registration failed.');
      setAlertStatus('enabled');
      await testAlerts();
    } catch (error) {
      console.warn('Unable to enable portal alerts', error);
      setAlertStatus('error');
    }
  };

  const testAlerts = async () => {
    try {
      setAlertStatus('testing');
      const { data, error } = await supabase.functions.invoke('portal-push', { body: { test: true } });
      if (error || data?.status !== 'complete' || Number(data?.sent ?? 0) < 1) throw new Error(data?.reason ?? error?.message ?? 'The alert could not be delivered.');
      setAlertStatus('tested');
    } catch (error) {
      console.warn('Unable to send portal push test', error);
      setAlertStatus('error');
    }
  };

  const canEnableAlerts = !isIos || installed;
  const installingCopy = isIos
    ? 'In Safari, tap Share, then Add to Home Screen. Open the installed app to enable alerts.'
    : 'Install this workspace for faster access to orders, stock and store updates.';
  const alertCopy = alertStatus === 'tested' ? 'Test alert delivered. This device is ready for order updates.'
    : alertStatus === 'enabled' ? 'Device registered. Send a test alert to confirm delivery.'
    : alertStatus === 'blocked' ? 'Alerts are blocked in this browser. Enable notifications in its site settings, then try again.'
      : alertStatus === 'unavailable' ? 'Alerts need a secure browser and AOM’s device-alert key. Use the deployed portal, not a preview or in-app browser.'
        : alertStatus === 'error' ? 'We could not save alerts for this device. Check your connection and try again.'
          : 'Receive a notification as soon as an order needs your attention.';
  return <View style={styles.card}>
    <View style={styles.icon}><Ionicons name="phone-portrait-outline" size={22} color="#176E73" /></View>
    <View style={styles.copy}><Text style={styles.title}>{canEnableAlerts ? 'Turn on order alerts' : 'Use AOM Operations like an app'}</Text><Text style={styles.text}>{canEnableAlerts ? alertCopy : installingCopy}</Text></View>
    {canEnableAlerts && !['enabled', 'tested'].includes(alertStatus) ? <TouchableOpacity disabled={alertStatus === 'enabling' || alertStatus === 'testing'} onPress={() => void enableAlerts()} style={styles.button}><Text style={styles.buttonText}>{alertStatus === 'enabling' ? 'Enabling…' : alertStatus === 'testing' ? 'Testing…' : 'Enable alerts'}</Text></TouchableOpacity> : null}
    {canEnableAlerts && alertStatus === 'enabled' ? <TouchableOpacity onPress={() => void testAlerts()} style={styles.button}><Text style={styles.buttonText}>Test alert</Text></TouchableOpacity> : null}
    {!installed && installPrompt ? <TouchableOpacity onPress={() => void install()} style={styles.button}><Text style={styles.buttonText}>Install</Text></TouchableOpacity> : null}
  </View>;
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
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
