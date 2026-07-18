import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

type Role = 'manager' | 'kitchen' | 'cashier' | 'server';
type Staff = { role: Role; is_active: boolean };
type CafeteriaCategory = 'snacks' | 'lunch' | 'dinner';
type Product = { id: string; name: string; category: CafeteriaCategory; categories: CafeteriaCategory[] | null; sort_order: number | null; price: number; status: 'available' | 'sold_out' | 'hidden'; meal_plan_eligible: boolean; image_url: string | null };
type ChoiceDraft = { name: string; price: string };

const servicePeriods: CafeteriaCategory[] = ['snacks', 'lunch', 'dinner'];
const labels: Record<Role, string> = { manager: 'Cafeteria manager', kitchen: 'Kitchen team', cashier: 'Cashier', server: 'Serving team' };
const categoriesFor = (product: Pick<Product, 'category' | 'categories'>) => product.categories?.length ? product.categories : [product.category];

export default function CafeteriaPortal() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | CafeteriaCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categories, setCategories] = useState<CafeteriaCategory[]>(['lunch']);
  const [mealEligible, setMealEligible] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [choiceGroup, setChoiceGroup] = useState('');
  const [choices, setChoices] = useState<ChoiceDraft[]>([]);
  const isManager = staff?.role === 'manager';

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const [{ data: access }, { data: rows }] = await Promise.all([
      supabase.from('cafeteria_staff').select('role, is_active').eq('user_id', auth.user.id).maybeSingle(),
      supabase.from('cafeteria_products').select('id, name, category, categories, sort_order, price, status, meal_plan_eligible, image_url').order('sort_order').order('name'),
    ]);
    setStaff(access?.is_active ? access as Staff : null);
    setProducts((rows ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const visibleProducts = useMemo(() => {
    const rows = tab === 'all' ? products : products.filter((item) => categoriesFor(item).includes(tab));
    return [...rows].sort((a, b) => Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(b.sort_order ?? Number.MAX_SAFE_INTEGER));
  }, [products, tab]);

  const openEditor = async (product?: Product) => {
    setEditingId(product?.id ?? null);
    setName(product?.name ?? '');
    setPrice(product ? String(product.price) : '');
    setCategories(product ? categoriesFor(product) : ['lunch']);
    setMealEligible(product?.meal_plan_eligible ?? true);
    setImageUrl(product?.image_url ?? '');
    setChoiceGroup('');
    setChoices([]);
    setModalOpen(true);
    if (!product) return;
    const { data } = await supabase.from('cafeteria_product_options').select('option_group, name, price_modifier').eq('product_id', product.id).order('created_at');
    if (data?.length) {
      setChoiceGroup(String(data[0].option_group));
      setChoices(data.map((choice) => ({ name: String(choice.name), price: String(choice.price_modifier ?? 0) })));
    }
  };

  const changeStatus = async (product: Product, status: Product['status']) => {
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, status } : item));
    const { error } = await supabase.from('cafeteria_products').update({ status }).eq('id', product.id);
    if (error) { void load(); Alert.alert('Could not update item', error.message); }
  };

  const moveProduct = async (product: Product, direction: -1 | 1) => {
    const ordered = [...products].sort((a, b) => Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(b.sort_order ?? Number.MAX_SAFE_INTEGER));
    const index = ordered.findIndex((item) => item.id === product.id);
    const neighbour = ordered[index + direction];
    if (index < 0 || !neighbour) return;
    const productOrder = product.sort_order ?? index + 1;
    const neighbourOrder = neighbour.sort_order ?? index + direction + 1;
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, sort_order: neighbourOrder } : item.id === neighbour.id ? { ...item, sort_order: productOrder } : item));
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase.from('cafeteria_products').update({ sort_order: neighbourOrder }).eq('id', product.id),
      supabase.from('cafeteria_products').update({ sort_order: productOrder }).eq('id', neighbour.id),
    ]);
    if (firstError || secondError) { void load(); Alert.alert('Could not change placement', firstError?.message ?? secondError?.message ?? 'Please try again.'); }
  };

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo access needed', 'Allow photo access to upload a product image. You can also paste an image URL instead.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again before uploading an image.');
      const extension = asset.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || asset.mimeType?.split('/').pop() || 'jpg';
      const path = `cafeteria/${auth.user.id}/${Date.now()}.${extension}`;
      const response = await fetch(asset.uri);
      const { error } = await supabase.storage.from('product-images').upload(path, await response.arrayBuffer(), { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (error) throw error;
      setImageUrl(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    } catch (error) { Alert.alert('Could not upload image', error instanceof Error ? error.message : 'Please try again or paste a direct image URL.'); }
    finally { setUploadingImage(false); }
  };

  const saveProduct = async () => {
    if (!name.trim() || !Number(price)) { Alert.alert('Add item details', 'Enter an item name and a price greater than zero.'); return; }
    if (!categories.length) { Alert.alert('Choose a service period', 'Select lunch, dinner, snacks, or more than one when the item is served across periods.'); return; }
    const validChoices = choices.filter((choice) => choice.name.trim());
    if (validChoices.length && !choiceGroup.trim()) { Alert.alert('Name this choice group', 'For example: Protein, Size, Drink or Flavour.'); return; }
    setSaving(true);
    const basePayload = { name: name.trim(), category: categories[0], categories, price: Number(price), meal_plan_eligible: mealEligible, image_url: imageUrl.trim() || null };
    const payload = editingId ? basePayload : { ...basePayload, sort_order: Math.max(0, ...products.map((product) => Number(product.sort_order ?? 0))) + 1 };
    const { data: saved, error } = editingId
      ? await supabase.from('cafeteria_products').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('cafeteria_products').insert({ ...payload, status: 'available' }).select('id').single();
    if (error || !saved) { setSaving(false); Alert.alert(`Could not ${editingId ? 'update' : 'add'} item`, error?.message ?? 'Please try again.'); return; }
    if (editingId) {
      const { error: removeError } = await supabase.from('cafeteria_product_options').delete().eq('product_id', saved.id);
      if (removeError) { setSaving(false); Alert.alert('Item saved, but choices could not be updated', removeError.message); return; }
    }
    if (validChoices.length) {
      const { error: optionError } = await supabase.from('cafeteria_product_options').insert(validChoices.map((choice) => ({ product_id: saved.id, option_group: choiceGroup.trim(), name: choice.name.trim(), price_modifier: Number(choice.price) || 0, is_available: true, selection_mode: 'single' })));
      if (optionError) { setSaving(false); Alert.alert('Item saved, but choices could not be added', optionError.message); return; }
    }
    setSaving(false);
    setModalOpen(false);
    void load();
  };

  if (width < 760) return <View style={styles.loading}><StatusBar style="light" /><Ionicons name="desktop-outline" size={48} color="#68ECCB" /><Text style={styles.accessTitle}>Continue on desktop</Text><Text style={styles.accessCopy}>Cafeteria operations are designed for a wider screen, where staff can manage the live menu comfortably.</Text></View>;
  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (!staff) return <View style={styles.loading}><Ionicons name="lock-closed-outline" size={42} color="#68ECCB" /><Text style={styles.accessTitle}>Cafeteria access is not linked yet</Text><Text style={styles.accessCopy}>Ask an AOM administrator to add this account to the cafeteria staff list.</Text><TouchableOpacity onPress={() => router.replace('/(buyer)/')} style={styles.returnButton}><Text style={styles.returnText}>RETURN TO AOM</Text></TouchableOpacity></View>;

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.top}><View style={styles.brand}><Ionicons name="restaurant-outline" size={25} color="#68ECCB" /><Text style={styles.brandName}>AUN Cafeteria</Text><Text style={styles.portal}>Operations</Text></View><View style={styles.role}><Ionicons name="shield-checkmark-outline" size={18} color="#68ECCB" /><Text style={styles.roleText}>{labels[staff.role]}</Text></View></View>
    <View style={styles.main}>
      <View style={styles.sidebar}><Text style={styles.menu}>CAFETERIA</Text><Nav icon="grid-outline" label="Overview" active /><Nav icon="restaurant-outline" label="Menu & availability" /><Nav icon="receipt-outline" label="Order board" /><Nav icon="bar-chart-outline" label="Daily report" /><View style={styles.sidebarNote}><Ionicons name="information-circle-outline" size={20} color="#176E73" /><Text style={styles.sidebarNoteText}>Cafeteria is managed by AOM internally. No vendor payout applies.</Text></View></View>
      <ScrollView style={styles.workspace} contentContainerStyle={styles.workspaceContent} showsVerticalScrollIndicator>
        <View style={styles.head}><View><Text style={styles.title}>Cafeteria menu</Text><Text style={styles.subtitle}>Control what students can order right now. Use the arrows to choose the order customers see.</Text></View>{isManager ? <TouchableOpacity onPress={() => void openEditor()} style={styles.addButton}><Ionicons name="add" size={21} color="#01193D" /><Text style={styles.addButtonText}>Add item</Text></TouchableOpacity> : null}</View>
        <View style={styles.summary}><Summary label="Available" value={products.filter((product) => product.status === 'available').length} colour="#176E73" /><Summary label="Sold out" value={products.filter((product) => product.status === 'sold_out').length} colour="#B64A4A" /><Summary label="Hidden" value={products.filter((product) => product.status === 'hidden').length} colour="#697485" /></View>
        <View style={styles.tabs}>{(['all', ...servicePeriods] as const).map((value) => <TouchableOpacity key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'all' ? 'All items' : value[0].toUpperCase() + value.slice(1)}</Text></TouchableOpacity>)}</View>
        <View style={styles.tableHead}><Text style={[styles.column, { flex: 2.1 }]}>ITEM</Text><Text style={styles.column}>SERVICE PERIODS</Text><Text style={styles.column}>PRICE</Text><Text style={styles.column}>STATUS</Text>{isManager ? <Text style={styles.column}>ACTIONS</Text> : null}</View>
        {visibleProducts.map((item) => <View key={item.id} style={styles.row}><View style={[styles.itemIcon, categoriesFor(item).includes('snacks') && styles.itemIconSnack]}><Ionicons name={categoriesFor(item).includes('snacks') ? 'cafe-outline' : categoriesFor(item).includes('lunch') ? 'restaurant-outline' : 'moon-outline'} size={20} color="#68ECCB" /></View><Text style={[styles.itemName, { flex: 2.1 }]}>{item.name}{item.meal_plan_eligible ? <Text style={styles.planTag}> · Meal-plan</Text> : null}</Text><Text style={styles.cell}>{categoriesFor(item).join(' + ')}</Text><Text style={styles.price}>₦{Number(item.price).toLocaleString('en-NG')}</Text><View style={[styles.status, item.status === 'sold_out' && styles.sold, item.status === 'hidden' && styles.hidden]}><View style={styles.statusDot} /><Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text></View>{isManager ? <View style={styles.actions}><TouchableOpacity onPress={() => void moveProduct(item, -1)} style={styles.action} accessibilityLabel={`Move ${item.name} earlier`}><Ionicons name="arrow-up-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void moveProduct(item, 1)} style={styles.action} accessibilityLabel={`Move ${item.name} later`}><Ionicons name="arrow-down-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void openEditor(item)} style={styles.action}><Ionicons name="pencil-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void changeStatus(item, item.status === 'available' ? 'sold_out' : 'available')} style={styles.action}><Ionicons name={item.status === 'available' ? 'close-outline' : 'checkmark-outline'} size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void changeStatus(item, item.status === 'hidden' ? 'available' : 'hidden')} style={styles.action}><Ionicons name={item.status === 'hidden' ? 'eye-outline' : 'eye-off-outline'} size={18} color="#176E73" /></TouchableOpacity></View> : null}</View>)}
        {!visibleProducts.length ? <Text style={styles.empty}>No items in this category yet.</Text> : null}
      </ScrollView>
    </View>
    <Modal transparent visible={modalOpen} animationType="fade" onRequestClose={() => setModalOpen(false)}><View style={styles.modalBackdrop}><ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}><Text style={styles.modalTitle}>{editingId ? 'Edit cafeteria item' : 'Add cafeteria item'}</Text><Field label="Item name" value={name} onChangeText={setName} placeholder="e.g. Jollof rice" /><Field label="Price (NGN)" value={price} onChangeText={setPrice} placeholder="1800" keyboardType="numeric" /><ImageField value={imageUrl} onChangeText={setImageUrl} onPick={() => void chooseImage()} uploading={uploadingImage} /><ChoicesField group={choiceGroup} onGroupChange={setChoiceGroup} choices={choices} onChoicesChange={setChoices} /><Text style={styles.fieldLabel}>Show item in</Text><Text style={styles.categoryHint}>Choose every service period this item should appear in. Select Lunch and Dinner for products served at both times.</Text><View style={styles.categoryChoices}>{servicePeriods.map((value) => <TouchableOpacity key={value} onPress={() => setCategories((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} style={[styles.choice, categories.includes(value) && styles.choiceActive]}><Ionicons name={categories.includes(value) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={categories.includes(value) ? '#176E73' : '#7B8794'} /><Text style={[styles.choiceText, categories.includes(value) && styles.choiceTextActive]}>{value}</Text></TouchableOpacity>)}</View><TouchableOpacity onPress={() => setMealEligible((current) => !current)} style={[styles.eligible, mealEligible && styles.eligibleActive]}><Ionicons name={mealEligible ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={mealEligible ? '#176E73' : '#7B8794'} /><Text style={styles.eligibleText}>Eligible for meal plan</Text></TouchableOpacity><View style={styles.modalActions}><TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={saving || uploadingImage} onPress={() => void saveProduct()} style={styles.save}>{saving ? <ActivityIndicator color="#01193D" /> : <Text style={styles.saveText}>{editingId ? 'Save changes' : 'Save item'}</Text>}</TouchableOpacity></View></ScrollView></View></Modal>
  </View>;
}

function Nav({ icon, label, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean }) { return <View style={[styles.nav, active && styles.navActive]}><Ionicons name={icon} size={20} color={active ? '#176E73' : '#7B8794'} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text></View>; }
function Summary({ label, value, colour }: { label: string; value: number; colour: string }) { return <View style={styles.summaryCard}><Text style={[styles.summaryValue, { color: colour }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function Field({ label, ...props }: { label: string; [key: string]: any }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#98A2AE" style={styles.input} /></View>; }
function ImageField({ value, onChangeText, onPick, uploading }: { value: string; onChangeText: (value: string) => void; onPick: () => void; uploading: boolean }) { return <View style={styles.field}><Text style={styles.fieldLabel}>Product image</Text><TouchableOpacity disabled={uploading} onPress={onPick} style={styles.upload}>{uploading ? <ActivityIndicator color="#176E73" /> : <><Ionicons name="image-outline" size={19} color="#176E73" /><Text style={styles.uploadText}>{value ? 'Replace uploaded photo' : 'Upload photo'}</Text></>}</TouchableOpacity><Text style={styles.help}>Or paste a public image URL.</Text><TextInput value={value} onChangeText={onChangeText} autoCapitalize="none" placeholder="https://..." placeholderTextColor="#98A2AE" style={styles.input} />{value ? <View style={styles.preview}><Image source={{ uri: value }} style={styles.previewImage} /><Text style={styles.previewText}>Product image ready</Text></View> : null}</View>; }
function ChoicesField({ group, onGroupChange, choices, onChoicesChange }: { group: string; onGroupChange: (value: string) => void; choices: ChoiceDraft[]; onChoicesChange: (choices: ChoiceDraft[]) => void }) { const update = (index: number, patch: Partial<ChoiceDraft>) => onChoicesChange(choices.map((choice, current) => current === index ? { ...choice, ...patch } : choice)); return <View style={styles.field}><Text style={styles.fieldLabel}>Customer choices</Text><Text style={styles.help}>Customers choose one option, such as a Size, Flavour, Protein or Drink.</Text><TextInput value={group} onChangeText={onGroupChange} placeholder="Choice group, e.g. Flavour" placeholderTextColor="#98A2AE" style={styles.input} />{choices.map((choice, index) => <View key={`choice-${index}`} style={styles.choiceRow}><TextInput value={choice.name} onChangeText={(value) => update(index, { name: value })} placeholder="Option name" placeholderTextColor="#98A2AE" style={[styles.input, { flex: 1 }]} /><TextInput value={choice.price} onChangeText={(value) => update(index, { price: value })} placeholder="Extra NGN" placeholderTextColor="#98A2AE" keyboardType="numeric" style={[styles.input, { width: 105 }]} /><TouchableOpacity onPress={() => onChoicesChange(choices.filter((_, current) => current !== index))} style={styles.deleteChoice}><Ionicons name="trash-outline" size={18} color="#B34A4A" /></TouchableOpacity></View>)}<TouchableOpacity onPress={() => onChoicesChange([...choices, { name: '', price: '0' }])} style={styles.addChoice}><Ionicons name="add-circle-outline" size={18} color="#176E73" /><Text style={styles.addChoiceText}>Add radio option</Text></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, loading: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 32 }, accessTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginTop: 16 }, accessCopy: { color: '#C9D7EA', fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 8, maxWidth: 440 }, returnButton: { marginTop: 24, height: 48, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, returnText: { color: '#01193D', fontSize: 14, fontWeight: '800' }, top: { height: 78, backgroundColor: '#01193D', paddingHorizontal: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandName: { color: '#F8F3ED', fontSize: 21, fontWeight: '800' }, portal: { color: '#8796AE', fontSize: 16, fontWeight: '600' }, role: { minHeight: 45, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1B3E70', borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }, roleText: { color: '#F8F3ED', fontSize: 14, fontWeight: '800' }, main: { flex: 1, flexDirection: 'row' }, sidebar: { width: 270, borderRightWidth: 1, borderColor: '#D8DDE3', paddingTop: 22 }, menu: { color: '#7B8794', fontSize: 13, fontWeight: '800', marginHorizontal: 25, marginBottom: 12 }, nav: { minHeight: 52, paddingHorizontal: 25, gap: 16, flexDirection: 'row', alignItems: 'center', borderRightWidth: 3, borderRightColor: 'transparent' }, navActive: { backgroundColor: '#E2F5F0', borderRightColor: '#25B68A' }, navText: { color: '#647181', fontSize: 16, fontWeight: '600' }, navTextActive: { color: '#176E73', fontWeight: '800' }, sidebarNote: { margin: 24, padding: 14, borderRadius: 11, backgroundColor: '#E1F6F0', flexDirection: 'row', gap: 9 }, sidebarNoteText: { flex: 1, color: '#176E73', fontSize: 12, lineHeight: 17 }, workspace: { flex: 1 }, workspaceContent: { padding: 38, paddingBottom: 60 }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }, title: { color: '#202020', fontSize: 29, fontWeight: '800' }, subtitle: { color: '#7B8794', fontSize: 16, marginTop: 6, maxWidth: 560 }, addButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 11, backgroundColor: '#68ECCB', flexDirection: 'row', alignItems: 'center', gap: 8 }, addButtonText: { color: '#01193D', fontSize: 15, fontWeight: '800' }, summary: { flexDirection: 'row', gap: 14, marginBottom: 22 }, summaryCard: { flex: 1, minHeight: 108, borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', backgroundColor: '#FFFFFF', padding: 18, justifyContent: 'space-between' }, summaryValue: { fontSize: 29, fontWeight: '800' }, summaryLabel: { color: '#697485', fontSize: 14, fontWeight: '700' }, tabs: { flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderColor: '#E0E5EA', marginBottom: 14 }, tab: { paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: '#25B68A' }, tabText: { color: '#7B8794', fontSize: 15, fontWeight: '600' }, tabTextActive: { color: '#176E73', fontWeight: '800' }, tableHead: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 9 }, column: { flex: 1, color: '#7B8794', fontSize: 12, fontWeight: '800' }, row: { minHeight: 76, borderTopWidth: 1, borderColor: '#E8EBEE', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }, itemIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, itemIconSnack: { backgroundColor: '#176E73' }, itemName: { color: '#1E2937', fontSize: 15, fontWeight: '800' }, planTag: { color: '#176E73', fontSize: 11, fontWeight: '700' }, cell: { flex: 1, color: '#647181', fontSize: 13, textTransform: 'capitalize' }, price: { flex: 1, color: '#01193D', fontSize: 14, fontWeight: '800' }, status: { flex: 1, maxWidth: 120, borderRadius: 16, backgroundColor: '#E1F6F0', paddingVertical: 7, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }, sold: { backgroundColor: '#FFE0E0' }, hidden: { backgroundColor: '#F0F1F3' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#25B68A' }, statusText: { color: '#176E73', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, actions: { flex: 1.4, flexDirection: 'row', gap: 6 }, action: { width: 34, height: 34, borderWidth: 1, borderColor: '#D4DAE0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, empty: { color: '#7B8794', textAlign: 'center', padding: 36, fontSize: 15 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(1,25,61,0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modal: { width: '100%', maxWidth: 500, maxHeight: '88%', borderRadius: 17, backgroundColor: '#FFFFFF' }, modalContent: { padding: 24 }, modalTitle: { color: '#01193D', fontSize: 22, fontWeight: '800', marginBottom: 20 }, field: { marginBottom: 16 }, fieldLabel: { color: '#526273', fontSize: 13, fontWeight: '800', marginBottom: 7 }, input: { height: 47, borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 9, paddingHorizontal: 12, color: '#1F2937', fontSize: 15 }, help: { color: '#7B8794', fontSize: 12, lineHeight: 17, marginBottom: 8 }, upload: { height: 46, borderWidth: 1, borderColor: '#25B68A', borderRadius: 9, backgroundColor: '#E1F6F0', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 }, uploadText: { color: '#176E73', fontSize: 14, fontWeight: '800' }, preview: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 }, previewImage: { width: 42, height: 32, borderRadius: 6, backgroundColor: '#EDF1F4' }, previewText: { color: '#176E73', fontSize: 12, fontWeight: '700' }, choiceRow: { flexDirection: 'row', gap: 8, marginTop: 8 }, deleteChoice: { width: 42, height: 47, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F0C5C5', borderRadius: 9 }, addChoice: { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: '#25B68A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 8 }, addChoiceText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, categoryHint: { color: '#7B8794', fontSize: 12, lineHeight: 17, marginBottom: 9 }, categoryChoices: { flexDirection: 'row', gap: 9, marginBottom: 17 }, choice: { borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }, choiceActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, choiceText: { color: '#647181', textTransform: 'capitalize', fontSize: 13, fontWeight: '700' }, choiceTextActive: { color: '#176E73' }, eligible: { minHeight: 45, borderRadius: 9, paddingHorizontal: 12, backgroundColor: '#F5F8F9', flexDirection: 'row', alignItems: 'center', gap: 9 }, eligibleActive: { backgroundColor: '#E1F6F0' }, eligibleText: { color: '#176E73', fontSize: 14, fontWeight: '700' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 }, cancel: { minHeight: 45, paddingHorizontal: 17, borderRadius: 9, borderWidth: 1, borderColor: '#D4DAE0', alignItems: 'center', justifyContent: 'center' }, cancelText: { color: '#647181', fontSize: 14, fontWeight: '800' }, save: { minHeight: 45, paddingHorizontal: 17, borderRadius: 9, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#01193D', fontSize: 14, fontWeight: '800' },
});
