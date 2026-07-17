import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', pale: '#E7EDF6', icon: '#7898C6', green: '#006D50', muted: '#A0A0A0' } as const;
type Icon = keyof typeof Ionicons.glyphMap;
type Notification = { id: string; user_id: string; kind: 'order' | 'delivery' | 'promotion' | 'cafeteria' | 'booking' | 'service' | 'general'; title: string; message: string; action_label: string | null; action_href: string | null; is_read: boolean; created_at: string };

const NOTIFICATION_ICONS: Record<Notification['kind'], Icon> = { order: 'checkmark-outline', delivery: 'bicycle-outline', promotion: 'pricetag-outline', cafeteria: 'restaurant-outline', booking: 'calendar-outline', service: 'sparkles-outline', general: 'notifications-outline' };
const iconFor = (kind: Notification['kind']): Icon => NOTIFICATION_ICONS[kind];
const groupFor = (date: string) => {
  const hours = (Date.now() - new Date(date).getTime()) / 36e5;
  if (hours < 1) return 'JUST NOW';
  const today = new Date(); const notificationDate = new Date(date);
  return today.toDateString() === notificationDate.toDateString() ? 'TODAY' : 'EARLIER';
};
const timeFor = (date: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export default function NotificationsPage() {
  const router = useRouter();
  const storedUserId = useAuthStore((state) => state.session?.user.id);
  const [userId, setUserId] = useState<string | undefined>(storedUserId);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUserId(storedUserId);
    if (storedUserId) return;
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, [storedUserId]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase.from('notifications').select('id, user_id, kind, title, message, action_label, action_href, is_read, created_at').eq('user_id', userId).order('created_at', { ascending: false });
      if (active) { setNotifications((data ?? []) as Notification[]); setLoading(false); }
    };
    void load();
    const channel = supabase.channel(`notifications-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
      if (payload.eventType === 'INSERT') setNotifications((current) => [payload.new as Notification, ...current]);
      if (payload.eventType === 'UPDATE') setNotifications((current) => current.map((item) => item.id === (payload.new as Notification).id ? payload.new as Notification : item));
      if (payload.eventType === 'DELETE') setNotifications((current) => current.filter((item) => item.id !== (payload.old as Notification).id));
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [userId]);

  const rows = useMemo(() => notifications.flatMap((notification, index) => {
    const previous = notifications[index - 1]; const group = groupFor(notification.created_at);
    return (index === 0 || groupFor(previous.created_at) !== group) ? [{ type: 'heading' as const, id: group + notification.id, label: group }, { type: 'notification' as const, ...notification }] : [{ type: 'notification' as const, ...notification }];
  }), [notifications]);
  const markRead = async (item: Notification) => { if (!item.is_read) await supabase.from('notifications').update({ is_read: true }).eq('id', item.id); };
  const openAction = async (item: Notification) => { await markRead(item); if (item.action_href) router.push(item.action_href as never); };

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)')}><Ionicons name="arrow-back-outline" size={31} color={COLORS.cream} /></TouchableOpacity><Text style={styles.headerTitle}>Notifications</Text></View>}
      renderItem={({ item }) => item.type === 'heading' ? <Text style={styles.groupTitle}>{item.label}</Text> : <View style={[styles.card, !item.is_read && styles.cardUnread]}><View style={styles.iconCircle}><Ionicons name={iconFor(item.kind)} size={31} color={COLORS.navy} /></View><View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.message}>{item.message}</Text>{item.action_label && <View style={styles.actions}><TouchableOpacity style={styles.primaryAction} onPress={() => openAction(item)}><Text style={styles.primaryActionText}>{item.action_label}</Text><Ionicons name="arrow-forward" size={20} color={COLORS.navy} /></TouchableOpacity>{!item.is_read && <TouchableOpacity style={styles.dismiss} onPress={() => markRead(item)}><Text style={styles.dismissText}>DISMISS</Text></TouchableOpacity>}</View>}<Text style={styles.time}>{timeFor(item.created_at)}</Text></View>{!item.is_read && <View style={styles.unread} />}</View>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="small" color={COLORS.navy} /> : <View style={styles.empty}><Ionicons name="notifications-off-outline" size={15} color={COLORS.muted} /><Text style={styles.emptyTitle}>You are all caught up</Text><Text style={styles.emptyText}>New updates about your orders, meals and services will appear here.</Text></View>}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, list: { padding: 20, paddingTop: 72, paddingBottom: 36 },
  header: { height: 100, marginBottom: 42, borderRadius: 40, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, gap: 22 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: COLORS.cream, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: COLORS.cream, fontSize: 30, fontWeight: '500' },
  groupTitle: { color: COLORS.muted, fontSize: 22, fontWeight: '700', marginBottom: 14, marginLeft: 4 },
  card: { minHeight: 118, marginBottom: 12, borderRadius: 14, backgroundColor: COLORS.pale, padding: 16, flexDirection: 'row', gap: 12 }, cardUnread: { backgroundColor: '#E5ECF6' }, iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.icon, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, paddingRight: 8 }, title: { color: COLORS.navy, fontSize: 21, lineHeight: 25, fontWeight: '700' }, message: { color: COLORS.navy, fontSize: 17, lineHeight: 22, marginTop: 4 }, actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }, primaryAction: { minHeight: 44, borderWidth: 1.5, borderColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, primaryActionText: { color: COLORS.navy, fontSize: 14, fontWeight: '800' }, dismiss: { minHeight: 44, borderWidth: 1.5, borderColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, dismissText: { color: COLORS.navy, fontSize: 14, fontWeight: '800' }, time: { color: COLORS.muted, fontSize: 14, fontWeight: '600', marginTop: 6 }, unread: { position: 'absolute', top: 16, right: 16, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.green },
  loading: { marginTop: 90 }, empty: { alignItems: 'center', gap: 11, marginTop: 80, paddingHorizontal: 35 }, emptyTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '800' }, emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
