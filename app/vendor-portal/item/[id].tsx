import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import type { ReactNode } from 'react';

type Option = { id?: string; option_group: string; name: string; price_modifier: string; is_available: boolean; selection_mode?: 'multiple' | 'single' };
type OptionSuggestion = { group: string; choices: { name: string; price_modifier: string }[]; selection_mode: 'multiple' | 'single' };
type ExtraPlacement = { section: 'marketplace' | 'supermarket'; category: string };
const marketplaceCategories = ['meals', 'cakes', 'fast-food', 'ice-cream', 'dairy'];
const supermarketCategories = ['all-products', 'baking-stuff', 'beauty-hygiene', 'electronics', 'fragrances', 'groceries'];
let extraPlacementControls: ReactNode = null;
let optionModesByGroup: Record<string, 'multiple' | 'single'> = {};
let updateOptionGroupMode: ((group: string, mode: 'multiple' | 'single') => void) | null = null;

export default function CatalogueItemEditor() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [marketplaceCategory, setMarketplaceCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [extraPlacements, setExtraPlacements] = useState<ExtraPlacement[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [available, setAvailable] = useState(true);
  const [options, setOptions] = useState<Option[]>([]);
  const [suggestions, setSuggestions] = useState<OptionSuggestion[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (isNew || !id) return;
    const load = async () => {
      const { data: product, error } = await supabase.from('products').select('id, vendor_id, name, description, price, category, marketplace_category, marketplace_subcategory, image_url, status').eq('id', id).single();
      if (error || !product) { setLoadError(error?.message ?? 'This item no longer exists.'); setLoading(false); return; }
      const { data: auth } = await supabase.auth.getUser();
      const { data: vendor } = await supabase.from('vendors').select('id').eq('owner_id', auth.user?.id ?? '').maybeSingle();
      if (!vendor || product.vendor_id !== vendor.id) { setLoadError('You can only edit products from your own store.'); setLoading(false); return; }
      setName(product.name ?? ''); setDescription(product.description ?? ''); setPrice(String(product.price ?? '')); setCategory(product.category ?? ''); setMarketplaceCategory(product.marketplace_category ?? ''); setSubcategory(product.marketplace_subcategory ?? ''); setImageUrl(product.image_url ?? ''); setAvailable(product.status === 'available');
      const { data: placementRows } = await supabase.from('product_category_placements').select('section, category').eq('product_id', id).limit(2);
      setExtraPlacements((placementRows ?? []).filter((row): row is ExtraPlacement => (row.section === 'marketplace' || row.section === 'supermarket') && Boolean(row.category)));
      const { data: productOptions } = await supabase.from('product_options').select('id, option_group, name, price_modifier, is_available, selection_mode').eq('product_id', id).order('option_group');
      setOptions((productOptions ?? []).map((option) => ({ ...option, price_modifier: String(option.price_modifier ?? 0), selection_mode: option.selection_mode === 'single' ? 'single' : 'multiple' })));
      setLoading(false);
    };
    void load();
  }, [id, isNew, router]);

  useEffect(() => {
    const loadSuggestions = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: vendor } = await supabase.from('vendors').select('id').eq('owner_id', auth.user.id).maybeSingle();
      if (!vendor) return;
      const { data: products } = await supabase.from('products').select('id').eq('vendor_id', vendor.id);
      const productIds = (products ?? []).map((product) => product.id);
      if (!productIds.length) return;
      const { data: rows } = await supabase.from('product_options').select('option_group, name, price_modifier, selection_mode').in('product_id', productIds).eq('is_available', true).order('option_group').order('name');
      const grouped = new Map<string, OptionSuggestion>();
      for (const row of rows ?? []) {
        const group = String(row.option_group ?? '').trim();
        const name = String(row.name ?? '').trim();
        if (!group || !name) continue;
        const suggestion = grouped.get(group) ?? { group, choices: [], selection_mode: row.selection_mode === 'single' ? 'single' : 'multiple' };
        if (!suggestion.choices.some((choice) => choice.name.toLowerCase() === name.toLowerCase())) suggestion.choices.push({ name, price_modifier: String(row.price_modifier ?? 0) });
        grouped.set(group, suggestion);
      }
      setSuggestions(Array.from(grouped.values()));
    };
    void loadSuggestions();
  }, []);

  const updateOption = (index: number, patch: Partial<Option>) => setOptions((current) => current.map((option, currentIndex) => currentIndex === index ? { ...option, ...patch } : option));
  const useSuggestion = (suggestion: OptionSuggestion) => setOptions((current) => {
    const existing = new Set(current.map((option) => `${option.option_group.toLowerCase()}::${option.name.toLowerCase()}`));
    const additions = suggestion.choices.filter((choice) => !existing.has(`${suggestion.group.toLowerCase()}::${choice.name.toLowerCase()}`)).map((choice) => ({ option_group: suggestion.group, name: choice.name, price_modifier: choice.price_modifier, is_available: true, selection_mode: suggestion.selection_mode }));
    return [...current, ...additions];
  });
  const save = async () => {
    if (!name.trim() || !price || Number.isNaN(Number(price)) || Number(price) < 0) { Alert.alert('Check the details', 'Add a product name and a valid price.'); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: vendor } = await supabase.from('vendors').select('id').eq('owner_id', auth.user?.id ?? '').maybeSingle();
    if (!vendor) { setSaving(false); Alert.alert('Store unavailable', 'Your account is not linked to a vendor store.'); return; }
    const payload = { name: name.trim(), description: description.trim() || null, price: Number(price), category: category.trim() || null, marketplace_category: marketplaceCategory || null, marketplace_subcategory: subcategory.trim() || null, image_url: imageUrl.trim() || null, status: available ? 'available' : 'hidden' };
    const result = isNew ? await supabase.from('products').insert({ ...payload, vendor_id: vendor.id }).select('id').single() : await supabase.from('products').update(payload).eq('id', id).select('id').single();
    if (result.error || !result.data) { setSaving(false); Alert.alert('Could not save item', result.error?.message ?? 'Please try again.'); return; }
    const productId = result.data.id;
    const placementDelete = await supabase.from('product_category_placements').delete().eq('product_id', productId);
    if (placementDelete.error) { setSaving(false); Alert.alert('Could not save categories', placementDelete.error.message); return; }
    const validPlacements = extraPlacements.filter((placement) => placement.category.trim()).slice(0, 2);
    if (validPlacements.length) {
      const placementInsert = await supabase.from('product_category_placements').insert(validPlacements.map((placement) => ({ product_id: productId, section: placement.section, category: placement.category })));
      if (placementInsert.error) { setSaving(false); Alert.alert('Could not save categories', placementInsert.error.message); return; }
    }
    const validOptions = options.filter((option) => option.name.trim() && option.option_group.trim());
    const existingIds = validOptions.map((option) => option.id).filter(Boolean) as string[];
    if (!isNew) { const { data: existing } = await supabase.from('product_options').select('id').eq('product_id', productId); const removed = (existing ?? []).map((option) => option.id).filter((optionId) => !existingIds.includes(optionId)); if (removed.length) await supabase.from('product_options').delete().in('id', removed); }
    for (const option of validOptions) {
      const optionPayload = { product_id: productId, option_group: option.option_group.trim(), name: option.name.trim(), price_modifier: Number(option.price_modifier) || 0, is_available: option.is_available, selection_mode: option.selection_mode ?? 'multiple' };
      if (option.id) await supabase.from('product_options').update(optionPayload).eq('id', option.id); else await supabase.from('product_options').insert(optionPayload);
    }
    setSaving(false);
    Alert.alert('Saved', `${name.trim()} is now in your catalogue.`);
    router.replace('/vendor-portal');
  };

  extraPlacementControls = <ExtraPlacementControls placements={extraPlacements} onChange={setExtraPlacements} />;
  optionModesByGroup = Object.fromEntries(options.filter((option) => option.option_group.trim()).map((option) => [option.option_group.trim().toLowerCase(), option.selection_mode ?? 'multiple']));
  updateOptionGroupMode = (group, mode) => setOptions((current) => current.map((option) => option.option_group.trim().toLowerCase() === group.trim().toLowerCase() ? { ...option, selection_mode: mode } : option));
  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (loadError) return <View style={styles.errorScreen}><Ionicons name="alert-circle-outline" size={42} color="#B34A4A" /><Text style={styles.errorTitle}>We could not open this item</Text><Text style={styles.errorText}>{loadError}</Text><TouchableOpacity style={styles.errorButton} onPress={() => router.back()}><Text style={styles.errorButtonText}>Back to inventory</Text></TouchableOpacity></View>;
  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.top}><TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={21} color="#FFFFFF" /><Text style={styles.backText}>Back to portal</Text></TouchableOpacity><Text style={styles.topTitle}>{isNew ? 'Add item' : 'Edit item'}</Text></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator><View style={styles.header}><View><Text style={styles.title}>{isNew ? 'New catalogue item' : 'Update catalogue item'}</Text><Text style={styles.subtitle}>The changes appear in your buyer catalogue as soon as you save.</Text></View><TouchableOpacity onPress={save} disabled={saving} style={[styles.save, saving && styles.saveDisabled]}>{saving ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="save-outline" size={18} color="#01193D" /><Text style={styles.saveText}>Save item</Text></>}</TouchableOpacity></View><Section title="Product details"><Field label="Product name" value={name} onChangeText={setName} placeholder="e.g. Jollof rice" /><View style={styles.twoCol}><View style={styles.flex}><Field label="Price (NGN)" value={price} onChangeText={setPrice} placeholder="2100" keyboardType="numeric" /></View><View style={styles.flex}><Field label="Your store subcategory" value={category} onChangeText={setCategory} placeholder="e.g. Layered cakes" /></View></View><Field label="Description" value={description} onChangeText={setDescription} placeholder="Tell customers about this item" multiline /><Field label="Image URL" value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." autoCapitalize="none" /><View style={styles.availability}><View><Text style={styles.fieldLabel}>Available to order</Text><Text style={styles.help}>Turn off to hide this item from customers.</Text></View><Switch value={available} onValueChange={setAvailable} trackColor={{ false: '#D9DEE5', true: '#9AE4D1' }} thumbColor="#FFFFFF" /></View></Section><Section title="Marketplace discovery"><Text style={styles.help}>Choose the broad discovery area, then name the exact tab customers should see. Your store can use any subcategory you need.</Text><View style={styles.pills}>{marketplaceCategories.map((item) => <TouchableOpacity key={item} onPress={() => setMarketplaceCategory(marketplaceCategory === item ? '' : item)} style={[styles.pill, marketplaceCategory === item && styles.pillActive]}><Text style={[styles.pillText, marketplaceCategory === item && styles.pillTextActive]}>{item.replace('-', ' ')}</Text></TouchableOpacity>)}</View><Field label="Marketplace subcategory" value={subcategory} onChangeText={setSubcategory} placeholder="e.g. Layered cakes" /></Section><Section title="Custom choices"><Text style={styles.help}>Use separate groups such as Protein, Side, Size, Colour or Extras. Add a price only when the choice costs extra.</Text>{suggestions.length > 0 && <><Text style={styles.suggestionLabel}>Reuse your saved groups</Text><View style={styles.suggestionPills}>{suggestions.map((suggestion) => <TouchableOpacity key={suggestion.group} onPress={() => useSuggestion(suggestion)} style={styles.suggestionPill}><Text style={styles.suggestionPillText}>{suggestion.group}</Text></TouchableOpacity>)}</View><Text style={styles.suggestionHint}>Tap a group to add its saved choices below. You can edit every name and price.</Text></>}{options.map((option, index) => <View key={option.id ?? `new-${index}`} style={styles.option}><View style={styles.optionFields}><View style={styles.optionGroup}><Field label="Group" value={option.option_group} onChangeText={(value) => updateOption(index, { option_group: value })} placeholder="Protein" compact /></View><View style={styles.optionName}><Field label="Choice" value={option.name} onChangeText={(value) => updateOption(index, { name: value })} placeholder="Chicken" compact /></View><View style={styles.optionPrice}><Field label="Extra (NGN)" value={option.price_modifier} onChangeText={(value) => updateOption(index, { price_modifier: value })} placeholder="0" keyboardType="numeric" compact /></View></View><TouchableOpacity onPress={() => setOptions((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={styles.remove}><Ionicons name="trash-outline" size={18} color="#B34A4A" /></TouchableOpacity></View>)}<TouchableOpacity onPress={() => setOptions((current) => [...current, { option_group: '', name: '', price_modifier: '0', is_available: true }])} style={styles.addOption}><Ionicons name="add-circle-outline" size={19} color="#176E73" /><Text style={styles.addOptionText}>Add a choice</Text></TouchableOpacity></Section></ScrollView></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Field({ label, compact, multiline, ...props }: { label: string; compact?: boolean; multiline?: boolean } & React.ComponentProps<typeof TextInput>) { const group = String(props.value ?? '').trim(); const mode = optionModesByGroup[group.toLowerCase()] ?? 'multiple'; return <View style={[styles.field, compact && styles.compactField]}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} multiline={multiline} style={[styles.input, multiline && styles.textArea]} placeholderTextColor="#99A0AA" />{label === 'Marketplace subcategory' ? extraPlacementControls : null}{label === 'Group' && group ? <View style={{ marginTop: 8 }}><Text style={{ color: '#748191', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Customer selection</Text><View style={{ flexDirection: 'row', gap: 8 }}>{(['single', 'multiple'] as const).map((nextMode) => <TouchableOpacity key={nextMode} onPress={() => updateOptionGroupMode?.(group, nextMode)} style={{ borderRadius: 16, borderWidth: 1, borderColor: mode === nextMode ? '#25B68A' : '#C9D1DA', backgroundColor: mode === nextMode ? '#E1F6F0' : '#FFFFFF', paddingHorizontal: 11, paddingVertical: 6 }}><Text style={{ color: mode === nextMode ? '#176E73' : '#617081', fontSize: 12, fontWeight: '700' }}>{nextMode === 'single' ? 'Pick one' : 'Pick many'}</Text></TouchableOpacity>)}</View></View> : null}</View>; }

function ExtraPlacementControls({ placements, onChange }: { placements: ExtraPlacement[]; onChange: (placements: ExtraPlacement[]) => void }) {
  const update = (index: number, patch: Partial<ExtraPlacement>) => onChange(placements.map((placement, currentIndex) => currentIndex === index ? { ...placement, ...patch } : placement));
  return <View style={{ marginTop: 4, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#E7EBEF' }}><Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 7 }]}>Additional discovery categories</Text><Text style={styles.help}>Show this same product in up to two more buyer categories. It stays one item in your inventory.</Text>{placements.map((placement, index) => <View key={`${placement.section}-${index}`} style={{ padding: 14, borderWidth: 1, borderColor: '#DCE5EA', borderRadius: 10, marginBottom: 12, backgroundColor: '#F8FAFB' }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={styles.fieldLabel}>Extra category {index + 1}</Text><TouchableOpacity onPress={() => onChange(placements.filter((_, currentIndex) => currentIndex !== index))}><Text style={{ color: '#B34A4A', fontSize: 13, fontWeight: '800' }}>Remove</Text></TouchableOpacity></View><View style={styles.pills}>{(['marketplace', 'supermarket'] as const).map((section) => <TouchableOpacity key={section} onPress={() => update(index, { section, category: '' })} style={[styles.pill, placement.section === section && styles.pillActive]}><Text style={[styles.pillText, placement.section === section && styles.pillTextActive]}>{section}</Text></TouchableOpacity>)}</View><View style={styles.pills}>{(placement.section === 'marketplace' ? marketplaceCategories : supermarketCategories).map((category) => <TouchableOpacity key={category} onPress={() => update(index, { category })} style={[styles.pill, placement.category === category && styles.pillActive]}><Text style={[styles.pillText, placement.category === category && styles.pillTextActive]}>{category.replaceAll('-', ' ')}</Text></TouchableOpacity>)}</View></View>)}{placements.length < 2 ? <TouchableOpacity onPress={() => onChange([...placements, { section: 'marketplace', category: '' }])} style={styles.addOption}><Ionicons name="add-circle-outline" size={19} color="#176E73" /><Text style={styles.addOptionText}>Add another category</Text></TouchableOpacity> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFB' }, loading: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, errorScreen: { flex: 1, backgroundColor: '#F8FAFB', alignItems: 'center', justifyContent: 'center', padding: 28 }, errorTitle: { color: '#01193D', fontSize: 23, fontWeight: '800', marginTop: 14 }, errorText: { color: '#697485', fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 480, marginTop: 8 }, errorButton: { marginTop: 22, minHeight: 46, borderRadius: 9, paddingHorizontal: 18, backgroundColor: '#01193D', justifyContent: 'center' }, errorButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, top: { height: 76, backgroundColor: '#01193D', paddingHorizontal: 34, flexDirection: 'row', alignItems: 'center', gap: 22 }, back: { flexDirection: 'row', alignItems: 'center', gap: 9 }, backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, topTitle: { color: '#8796AE', fontSize: 17, fontWeight: '700' }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 36, paddingBottom: 70 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }, title: { color: '#01193D', fontSize: 28, fontWeight: '800' }, subtitle: { color: '#697485', fontSize: 16, marginTop: 7 }, save: { minHeight: 48, borderRadius: 10, paddingHorizontal: 18, backgroundColor: '#68ECCB', flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }, saveDisabled: { opacity: 0.6 }, saveText: { color: '#01193D', fontSize: 15, fontWeight: '800' }, section: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', padding: 24, marginBottom: 20 }, sectionTitle: { color: '#01193D', fontSize: 19, fontWeight: '800', marginBottom: 15 }, field: { marginBottom: 16 }, compactField: { marginBottom: 0 }, fieldLabel: { color: '#485666', fontSize: 13, fontWeight: '800', marginBottom: 7 }, input: { height: 46, borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 9, paddingHorizontal: 12, color: '#192431', fontSize: 15, backgroundColor: '#FFFFFF' }, textArea: { height: 96, paddingTop: 12, textAlignVertical: 'top' }, twoCol: { flexDirection: 'row', gap: 16 }, flex: { flex: 1 }, help: { color: '#748191', fontSize: 14, lineHeight: 20, marginBottom: 14 }, availability: { minHeight: 58, borderTopWidth: 1, borderColor: '#E7EBEF', paddingTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pills: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', marginBottom: 18 }, pill: { borderRadius: 20, borderWidth: 1, borderColor: '#C9D1DA', paddingHorizontal: 13, paddingVertical: 8 }, pillActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, pillText: { color: '#617081', textTransform: 'capitalize', fontSize: 14, fontWeight: '700' }, pillTextActive: { color: '#176E73' }, suggestionLabel: { color: '#485666', fontSize: 13, fontWeight: '800', marginBottom: 8 }, suggestionPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 7 }, suggestionPill: { minHeight: 36, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#25B68A', backgroundColor: '#E1F6F0', alignItems: 'center', justifyContent: 'center' }, suggestionPillText: { color: '#176E73', fontSize: 14, fontWeight: '800' }, suggestionHint: { color: '#748191', fontSize: 13, lineHeight: 18, marginBottom: 15 }, option: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderBottomWidth: 1, borderColor: '#EDF0F3', paddingBottom: 14, marginBottom: 14 }, optionFields: { flex: 1, flexDirection: 'row', gap: 10 }, optionGroup: { flex: 1 }, optionName: { flex: 1.2 }, optionPrice: { width: 105 }, remove: { width: 42, height: 42, borderRadius: 9, borderWidth: 1, borderColor: '#F0D4D4', alignItems: 'center', justifyContent: 'center' }, addOption: { height: 46, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: '#25B68A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, addOptionText: { color: '#176E73', fontSize: 14, fontWeight: '800' },
});
