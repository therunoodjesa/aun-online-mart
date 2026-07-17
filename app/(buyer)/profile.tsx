import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';

type ProfileRow = { full_name: string | null; email: string | null; student_id: string | null; age: number | null; school_year: string | null };
type MealPlan = { plan_count: number; meals_used_today: number; requested_plan_count: number | null; request_status: string };

export default function ProfilePage() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const setProfile = useAuthStore((state) => state.setProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('My');
  const [age, setAge] = useState('');
  const [schoolYear, setSchoolYear] = useState('');
  const [studentId, setStudentId] = useState('');
  const [requestedPlans, setRequestedPlans] = useState(0);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      const [{ data: profile }, { data: plan }] = await Promise.all([
        supabase.from('profiles').select('full_name, email, student_id, age, school_year').eq('id', auth.user.id).maybeSingle(),
        supabase.from('meal_plan_accounts').select('plan_count, meals_used_today, requested_plan_count, request_status').eq('user_id', auth.user.id).maybeSingle(),
      ]);
      const info = profile as ProfileRow | null;
      setName(info?.full_name || auth.user.user_metadata?.full_name || 'My');
      setAge(info?.age ? String(info.age) : ''); setSchoolYear(info?.school_year ?? ''); setStudentId(info?.student_id ?? '');
      if (plan) { const account = plan as MealPlan; setMealPlan(account); setRequestedPlans(account.plan_count || account.requested_plan_count || 0); }
      setLoading(false);
    };
    void load();
  }, []);

  const usedUp = Boolean(mealPlan?.plan_count && mealPlan.meals_used_today >= mealPlan.plan_count);
  const displayName = name.trim().split(/\s+/)[0] || 'My';
  const planText = usedUp ? 'Meal plan used up today.' : mealPlan?.plan_count ? `${mealPlan.plan_count} meal plan${mealPlan.plan_count === 1 ? '' : 's'} active today` : mealPlan?.request_status === 'pending' ? 'Meal-plan request pending verification' : 'No meal plan available';
  const openWhatsAppSupport = async () => {
    try {
      await Linking.openURL('https://wa.me/2349133646024');
    } catch {
      Alert.alert('WhatsApp unavailable', 'Please message 09133646024 on WhatsApp.');
    }
  };
  const save = async () => {
    if (!studentId.trim() || !schoolYear.trim()) { Alert.alert('Complete your student details', 'Add your student ID and school year before saving.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('request_meal_plan', { p_full_name: name, p_age: age ? Number(age) : null, p_school_year: schoolYear, p_student_id: studentId, p_requested_plan_count: requestedPlans });
    if (error) { setSaving(false); Alert.alert('Could not save details', 'Run the profile meal-plan migration in Supabase, then try again.'); return; }
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSaving(false);
    if (authError) { Alert.alert('Details saved', 'Your profile was saved, but your display name could not be updated yet.'); return; }
    const current = useAuthStore.getState().profile;
    if (current) setProfile({ ...current, full_name: name.trim(), student_id: studentId.trim() || undefined });
    setMealPlan({ plan_count: mealPlan?.plan_count ?? 0, meals_used_today: mealPlan?.meals_used_today ?? 0, requested_plan_count: requestedPlans, request_status: requestedPlans ? 'pending' : 'not_requested' });
    router.replace('/(buyer)/profile');
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (edit !== 'true') return <View style={styles.screen}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.dashboardContent} showsVerticalScrollIndicator={false}>
    <View style={styles.dashboardHero}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)')}><Ionicons name="arrow-back" size={27} color="#F8F3ED" /></TouchableOpacity><TouchableOpacity style={styles.dashboardAvatar} onPress={() => router.push({ pathname: '/(buyer)/profile', params: { edit: 'true' } })}><Ionicons name="person" size={64} color="#01193D" /><View style={styles.editBadge}><Ionicons name="pencil" size={17} color="#01193D" /></View></TouchableOpacity><Text style={styles.dashboardTitle}>{displayName}’s profile</Text></View>
    <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>0</Text><Text style={styles.statLabel}>Orders placed</Text></View><View style={styles.stat}><Text style={styles.statValue}>0</Text><Text style={styles.statLabel}>Favourites</Text></View><View style={[styles.stat, { borderRightWidth: 0 }]}><Text style={styles.spentValue}>₦0</Text><Text style={styles.statLabel}>Spent</Text></View></View>
    <View style={styles.dashboardList}><TouchableOpacity style={styles.dashboardCard} onPress={() => router.push('/(buyer)/favourites')}><View style={[styles.cardIcon, styles.favouriteIcon]}><Ionicons name="heart-outline" size={29} color="#176E73" /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Favourites</Text><Text style={styles.cardText}>Saved items and vendors</Text></View></TouchableOpacity><TouchableOpacity style={styles.dashboardCard} onPress={() => router.push('/(buyer)/faq')}><View style={[styles.cardIcon, styles.faqIcon]}><Ionicons name="help-circle-outline" size={31} color="#01193D" /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>FAQs</Text><Text style={styles.cardText}>Help and support</Text></View></TouchableOpacity><TouchableOpacity style={styles.dashboardCard} onPress={() => router.push('/(buyer)/notifications')}><View style={styles.cardIcon}><Ionicons name="notifications" size={29} color="#01193D" /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Notifications</Text><Text style={styles.cardText}>Control updates</Text></View></TouchableOpacity><TouchableOpacity style={styles.dashboardCard} onPress={openWhatsAppSupport}><View style={[styles.cardIcon, styles.supportIcon]}><Ionicons name="logo-whatsapp" size={29} color="#006D50" /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>WhatsApp support</Text><Text style={styles.cardText}>Message our customer service agent and get a reply within 2 minutes</Text></View></TouchableOpacity></View>
    <TouchableOpacity style={styles.logout} onPress={() => supabase.auth.signOut().then(() => router.replace('/(auth)/login'))}><Ionicons name="log-out-outline" size={28} color="#F10D0D" /><Text style={styles.logoutText}>LOG OUT</Text></TouchableOpacity>
  </ScrollView></View>;
  return <View style={styles.screen}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)')}><Ionicons name="arrow-back" size={27} color="#F8F3ED" /></TouchableOpacity><View style={styles.avatar}><Ionicons name="person" size={64} color="#01193D" /><View style={styles.editBadge}><Ionicons name="pencil" size={17} color="#01193D" /></View></View><Text style={styles.title}>{displayName}’s profile</Text></View>
    <View style={styles.form}><Text style={styles.formTitle}>Personal details</Text><TextInput value={name} onChangeText={setName} placeholder="Full name" style={styles.input} /><View style={styles.dual}><TextInput value={age} onChangeText={setAge} placeholder="Age" keyboardType="number-pad" style={[styles.input, styles.half]} /><TextInput value={schoolYear} onChangeText={setSchoolYear} placeholder="School year" style={[styles.input, styles.half]} /></View><TextInput value={studentId} onChangeText={setStudentId} placeholder="Student ID" autoCapitalize="characters" style={styles.input} />
      <View style={[styles.planCard, usedUp && styles.usedCard]}><View style={styles.planIcon}><Ionicons name="card-outline" size={25} color="#005B3B" /></View><View style={styles.planCopy}><Text style={styles.planTitle}>Meal plan</Text><Text style={styles.planText}>{planText}</Text></View></View>
      {!mealPlan?.plan_count && <><Text style={styles.requestLabel}>REQUEST MEAL PLANS FOR THIS SEMESTER</Text><View style={styles.planChoices}>{[0, 1, 2, 3].map((count) => <TouchableOpacity key={count} onPress={() => setRequestedPlans(count)} style={[styles.choice, requestedPlans === count && styles.choiceActive]}><Text style={[styles.choiceText, requestedPlans === count && styles.choiceTextActive]}>{count}</Text></TouchableOpacity>)}</View><Text style={styles.helper}>Your request is verified before meal-plan credit can be used.</Text></>}
      <TouchableOpacity style={styles.save} onPress={save} disabled={saving}><Text style={styles.saveText}>{saving ? 'SAVING…' : 'SAVE PROFILE DETAILS'}</Text></TouchableOpacity>
    </View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#01193D' }, content: { paddingBottom: 38 }, hero: { height: 310, backgroundColor: '#01193D', borderBottomLeftRadius: 76, borderBottomRightRadius: 76, alignItems: 'center', paddingTop: 55 }, back: { position: 'absolute', top: 53, left: 27, width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, avatar: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#F8F3ED', borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, editBadge: { position: 'absolute', right: -8, bottom: 10, width: 48, height: 48, borderRadius: 24, backgroundColor: '#E7ECF3', borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, title: { color: '#F8F3ED', fontSize: 31, fontWeight: '600', marginTop: 17 }, form: { padding: 22, gap: 12 }, formTitle: { color: '#01193D', fontSize: 23, fontWeight: '800', marginBottom: 2 }, input: { height: 54, borderRadius: 10, borderWidth: 1, borderColor: '#C8D1DE', backgroundColor: '#FFFFFF', paddingHorizontal: 15, color: '#01193D', fontSize: 16 }, dual: { flexDirection: 'row', gap: 10 }, half: { flex: 1 }, planCard: { minHeight: 88, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: '#E1F5EE', flexDirection: 'row', alignItems: 'center', gap: 12 }, usedCard: { backgroundColor: '#E7ECF3' }, planIcon: { width: 45, height: 45, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, planCopy: { flex: 1 }, planTitle: { color: '#01193D', fontSize: 17, fontWeight: '800' }, planText: { color: '#005B3B', fontSize: 14, fontWeight: '600', marginTop: 3 }, requestLabel: { color: '#7E7E7E', fontSize: 13, fontWeight: '800', marginTop: 6 }, planChoices: { flexDirection: 'row', gap: 9 }, choice: { width: 54, height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#A7B1C0', alignItems: 'center', justifyContent: 'center' }, choiceActive: { backgroundColor: '#01193D', borderColor: '#01193D' }, choiceText: { color: '#01193D', fontSize: 17, fontWeight: '700' }, choiceTextActive: { color: '#68ECCB' }, helper: { color: '#7E7E7E', fontSize: 13, lineHeight: 18 }, save: { height: 56, borderRadius: 10, backgroundColor: '#01193D', marginTop: 12, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, dashboardContent: { paddingBottom: 42 }, dashboardHero: { height: 330, backgroundColor: '#01193D', borderBottomLeftRadius: 82, borderBottomRightRadius: 82, alignItems: 'center', paddingTop: 62 }, dashboardAvatar: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#F8F3ED', borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, dashboardTitle: { color: '#F8F3ED', fontSize: 31, fontWeight: '600', marginTop: 18 }, stats: { flexDirection: 'row', marginTop: 28, marginHorizontal: 12 }, stat: { flex: 1, minHeight: 115, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#A9A9A9' }, statValue: { color: '#000000', fontSize: 30, fontWeight: '800' }, spentValue: { color: '#176E73', fontSize: 29, fontWeight: '800' }, statLabel: { color: '#A0A0A0', fontSize: 15, textAlign: 'center', marginTop: 7 }, dashboardList: { paddingHorizontal: 20, gap: 18, marginTop: 24 }, dashboardCard: { minHeight: 113, borderRadius: 15, backgroundColor: '#E7ECF3', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }, cardIcon: { width: 60, height: 60, borderRadius: 11, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, favouriteIcon: { backgroundColor: '#C4D4E9' }, faqIcon: { backgroundColor: '#FFF0D5' }, supportIcon: { backgroundColor: '#BFEDE8' }, cardCopy: { flex: 1 }, cardTitle: { color: '#01193D', fontSize: 20, fontWeight: '600' }, cardText: { color: '#A0A0A0', fontSize: 15, lineHeight: 20, marginTop: 2 }, logout: { height: 75, marginTop: 28, marginHorizontal: 98, borderWidth: 1.5, borderColor: '#F10D0D', borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 13 }, logoutText: { color: '#F10D0D', fontSize: 17, fontWeight: '800' },
});
