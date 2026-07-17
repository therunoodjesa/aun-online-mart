import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, Dimensions, Platform,
  ActivityIndicator, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartstore';
import { FavouriteButton } from '../../../components/FavouriteButton';
import { isFavourited } from '../../../lib/favourites';
import { CartToast } from '../../../components/CartToast';

const { width } = Dimensions.get('window');
const S = Platform.OS === 'web' ? 1 : width / 430;

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  status: string;
  is_meal_plan_eligible: boolean;
};

type Vendor = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  location: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_open: boolean;
  average_prep_time: string | null;
  important_message: string | null;
  products: Product[];
};

export default function VendorPage() {
  const router = useRouter();
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isFavourite, setIsFavourite] = useState(false);
  const [cartToast, setCartToast] = useState('');
  const { items: cartItems, addItem, changeQuantity } = useCartStore();

  useEffect(() => {
    fetchVendor();
  }, [vendorId]);

  const fetchVendor = async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('vendors')
      .select(`
        id,
        name,
        description,
        category,
        location,
        logo_url,
        banner_url,
        is_open,
        average_prep_time,
        important_message,
        products (
          id,
          name,
          price,
          image_url,
          category,
          status,
          is_meal_plan_eligible
        )
      `)
      .eq('id', vendorId)
      .eq('is_approved', true)
      .single();

    setLoading(false);

    if (error) {
      setError('Could not load this vendor.');
      return;
    }

    setVendor(data as Vendor);
    setIsFavourite(await isFavourited('vendor', vendorId).catch(() => false));
  };

  // Derive unique categories from products
  const categories = vendor
    ? ['All', ...Array.from(new Set(
        vendor.products
          .map(p => p.category)
          .filter(Boolean) as string[]
      ))]
    : [];

  const filteredProducts = vendor
    ? activeCategory === 0
      ? vendor.products.filter(p => p.status !== 'hidden')
      : vendor.products.filter(p =>
          p.category === categories[activeCategory] && p.status !== 'hidden'
        )
    : [];

  const updateQty = (id: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + delta),
    }));

    const product = vendor?.products.find((item) => item.id === id);
    if (delta > 0 && product) {
      addItem({ productId: product.id, name: product.name, category: product.category, price: product.price, imageUrl: product.image_url });
      setCartToast(`${product.name} added to cart`);
    } else if (delta < 0) {
      changeQuantity(id, delta);
    }
  };

  const addToCart = (id: string) => {
    const product = vendor?.products.find((item) => item.id === id);
    if (!product) return;
    addItem({ productId: product.id, name: product.name, category: product.category, price: product.price, imageUrl: product.image_url });
    setCartToast(`${product.name} added to cart`);
  };

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(buyer)/');
  };

  // LOADING STATE
  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#68ECCB" />
      </View>
    );
  }

  // ERROR STATE
  if (error || !vendor) {
    return (
      <View style={styles.centred}>
        <Ionicons name="alert-circle-outline" size={40 * S} color="#A0A0A0" />
        <Text style={styles.errorText}>{error ?? 'Vendor not found.'}</Text>
        <TouchableOpacity onPress={goBack} style={styles.retryBtn}>
          <Text style={styles.retryText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
      >
        {/* Banner */}
        <View style={styles.banner}>
          {vendor.banner_url ? (
            <Image
              source={{ uri: vendor.banner_url }}
              style={styles.bannerImg}
            />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons
                name="restaurant-outline"
                size={64 * S}
                color="rgba(104,236,203,0.3)"
              />
            </View>
          )}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={goBack}
          >
            <Ionicons name="arrow-back-outline" size={20 * S} color="#F8F3ED" />
          </TouchableOpacity>
          <FavouriteButton entityType="vendor" entityId={vendor.id} style={styles.favBtn} />
          {!vendor.is_open && (
            <View style={styles.closedOverlay}>
              <Text style={styles.closedText}>Currently closed</Text>
            </View>
          )}
        </View>

        {/* Vendor info */}
        <View style={styles.infoSection}>
          <Text style={styles.vendorName}>{vendor.name}</Text>
          {vendor.description && (
            <Text style={styles.vendorDesc}>{vendor.description}</Text>
          )}
          <View style={styles.metaRow}>
            <Ionicons name="star" size={16 * S} color="#F5C842" />
            <Text style={styles.metaText}>4.9</Text>
            <View style={styles.metaDivider} />
            <Ionicons name="time-outline" size={16 * S} color="#01193D" />
            <Text style={styles.metaText}>{vendor.average_prep_time ?? '30–60 mins'}</Text>
            <View style={styles.metaDivider} />
            <Ionicons name="walk-outline" size={16 * S} color="#01193D" />
            <Text style={styles.metaText}>Pickup</Text>
            <View style={styles.metaDivider} />
            <Ionicons name="bicycle-outline" size={16 * S} color="#01193D" />
            <Text style={styles.metaText}>Delivery</Text>
          </View>
        </View>

        {/* Category tabs — sticky */}
        <View style={styles.categoryTabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTabs}
          >
            {categories.map((cat, i) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(i)}
                style={styles.categoryTabBtn}
              >
                <Text style={[
                  styles.categoryTab,
                  activeCategory === i && styles.categoryTabActive,
                ]}>
                  {cat}
                </Text>
                {activeCategory === i && (
                  <View style={styles.categoryTabLine} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Optional vendor notice */}
        {(vendor.important_message || !vendor.is_open) && (
          <View style={styles.noticeWrap}>
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={18 * S} color="#085041" />
              <Text style={styles.noticeText}>
                {vendor.important_message || 'This vendor is currently closed. Check back later.'}
              </Text>
            </View>
          </View>
        )}

        {/* Products grid */}
        <View style={styles.productsGrid}>
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="basket-outline" size={40 * S} color="#A0A0A0" />
              <Text style={styles.emptyText}>No items here yet</Text>
            </View>
          ) : (
            filteredProducts.reduce((rows: Product[][], product, i) => {
              if (i % 2 === 0) rows.push([]);
              rows[rows.length - 1].push(product);
              return rows;
            }, []).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.productRow}>
                {row.map(product => (
                  <TouchableOpacity
                    key={product.id}
                    style={[
                      styles.productCard,
                      product.status === 'sold_out' && styles.productCardSoldOut,
                    ]}
                    onPress={() => router.push(
                      `/(buyer)/marketplace/${vendorId}/${product.id}`
                    )}
                    activeOpacity={0.9}
                    disabled={product.status === 'sold_out'}
                  >
                    <View style={styles.productImg}>
                      {product.image_url ? (
                        <Image
                          source={{ uri: product.image_url }}
                          style={styles.productImgFile}
                        />
                      ) : (
                        <View style={styles.productImgPlaceholder}>
                          <Ionicons
                            name="restaurant-outline"
                            size={32 * S}
                            color="rgba(104,236,203,0.3)"
                          />
                        </View>
                      )}
                      {product.status === 'sold_out' && (
                        <View style={styles.soldOverlay}>
                          <Text style={styles.soldText}>Sold out</Text>
                        </View>
                      )}
                      {product.is_meal_plan_eligible && (
                        <View style={styles.mpTag}>
                          <Ionicons name="id-card-outline" size={10 * S} color="#fff" />
                        </View>
                      )}
                    </View>

                    <View style={styles.productBar}>
                      <View style={styles.productBarTop}>
                        <Text style={styles.productName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => addToCart(product.id)}
                          disabled={product.status === 'sold_out'}
                        >
                          <Ionicons name="cart-outline" size={20 * S} color="#F8F3ED" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.productBarBottom}>
                        <View style={styles.qtyControl}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => updateQty(product.id, -1)}
                          >
                            <Ionicons name="remove-outline" size={14 * S} color="#01193D" />
                          </TouchableOpacity>
                          <Text style={styles.qtyNum}>
                            {quantities[product.id] ?? 1}
                          </Text>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => updateQty(product.id, 1)}
                          >
                            <Ionicons name="add-outline" size={14 * S} color="#01193D" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.productPrice}>
                          ₦{product.price.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                {row.length === 1 && (
                  <View style={styles.productCardEmpty} />
                )}
              </View>
            ))
          )}
        </View>

        <View style={{ height: 100 * S }} />
      </ScrollView>

      <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
      {/* Cart bar */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartBar}
          onPress={() => router.push('/(buyer)/cart')}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartLabel}>View cart</Text>
          <Text style={styles.cartTotal}>₦{cartTotal.toLocaleString()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F3ED' },
  centred: {
    flex: 1,
    backgroundColor: '#01193D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16 * S,
  },
  errorText: { fontSize: 15 * S, color: '#A0A0A0', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#68ECCB',
    borderRadius: 8,
    paddingHorizontal: 20 * S,
    paddingVertical: 10 * S,
  },
  retryText: { fontSize: 14 * S, fontWeight: '600', color: '#01193D' },

  banner: { width, height: 220 * S, position: 'relative', overflow: 'hidden', borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  bannerImg: { width: '100%', height: '100%', resizeMode: 'cover', borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  bannerPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: '#01193D',
    alignItems: 'center', justifyContent: 'center',
  },
  closedOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedText: { fontSize: 18 * S, fontWeight: '700', color: '#F8F3ED' },
  backBtn: {
    position: 'absolute', top: 44 * S, left: 12 * S,
    width: 44 * S, height: 44 * S, borderRadius: 22 * S,
    backgroundColor: 'rgba(1,25,61,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  favBtn: {
    position: 'absolute', top: 44 * S, right: 12 * S,
    width: 44 * S, height: 44 * S, borderRadius: 22 * S,
    backgroundColor: 'rgba(1,25,61,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  infoSection: {
    backgroundColor: '#F8F3ED',
    paddingHorizontal: 12 * S,
    paddingTop: 10 * S,
    paddingBottom: 10 * S,
  },
  vendorName: {
    fontSize: 28 * S, fontWeight: '800',
    color: '#01193D', marginBottom: 6 * S,
  },
  vendorDesc: {
    fontSize: 16 * S, color: '#111111',
    lineHeight: 19, marginBottom: 12 * S,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 * S,
  },
  metaText: { fontSize: 12 * S, fontWeight: '600', color: '#01193D' },
  metaDivider: {
    width: 1, height: 14 * S,
    backgroundColor: 'rgba(1,25,61,0.2)',
  },

  categoryTabsWrap: {
    backgroundColor: '#F8F3ED',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,25,61,0.1)',
  },
  categoryTabs: { paddingHorizontal: 6 * S },
  categoryTabBtn: {
    paddingRight: 26 * S,
    paddingVertical: 20 * S,
    position: 'relative',
  },
  categoryTab: {
    fontSize: 20 * S, fontWeight: '500',
    color: 'rgba(1,25,61,0.4)',
  },
  categoryTabActive: { color: '#01193D' },
  categoryTabLine: {
    position: 'absolute', bottom: 0,
    left: 0, right: 26 * S,
    height: 5, backgroundColor: '#01193D', borderRadius: 3,
  },

  noticeWrap: {
    paddingHorizontal: 20 * S,
    paddingTop: 16 * S,
    paddingBottom: 8 * S,
    backgroundColor: '#F8F3ED',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8 * S,
    backgroundColor: '#E8FAF5',
    borderWidth: 1,
    borderColor: '#68ECCB',
    borderRadius: 10,
    padding: 14 * S,
  },
  noticeText: {
    flex: 1,
    fontSize: 14 * S, color: '#085041', lineHeight: 20,
  },

  productsGrid: {
    paddingHorizontal: 12 * S,
    paddingTop: 12 * S,
    backgroundColor: '#F8F3ED',
  },
  productRow: {
    flexDirection: 'row',
    gap: 8 * S,
    marginBottom: 8 * S,
  },
  productCard: {
    flex: 1, borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#01193D',
  },
  productCardSoldOut: { opacity: 0.6 },
  productCardEmpty: { flex: 1 },
  productImg: { width: '100%', height: 143 * S },
  productImgFile: { width: '100%', height: '100%', resizeMode: 'cover' },
  productImgPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: '#0f2044',
    alignItems: 'center', justifyContent: 'center',
  },
  soldOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12 * S, fontWeight: '600',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 5, paddingHorizontal: 8 * S, paddingVertical: 3 * S,
  },
  mpTag: {
    position: 'absolute', top: 6 * S, right: 6 * S,
    width: 20 * S, height: 20 * S, borderRadius: 10 * S,
    backgroundColor: '#1D9E75',
    alignItems: 'center', justifyContent: 'center',
  },
  productBar: { minHeight: 77 * S, backgroundColor: '#01193D', padding: 10 * S, gap: 8 * S },
  productBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 14 * S, fontWeight: '600',
    color: '#F8F3ED', flex: 1, marginRight: 6 * S,
  },
  productBarBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F3ED', borderRadius: 20,
    paddingHorizontal: 4 * S, paddingVertical: 3 * S,
    gap: 8 * S,
  },
  qtyBtn: {
    width: 22 * S, height: 22 * S,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyNum: {
    fontSize: 13 * S, fontWeight: '600',
    color: '#01193D', minWidth: 16 * S, textAlign: 'center',
  },
  productPrice: {
    fontSize: 14 * S, fontWeight: '600', color: '#F8F3ED',
  },

  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    padding: 48 * S, gap: 12 * S,
  },
  emptyText: { fontSize: 14 * S, color: '#A0A0A0' },

  cartBar: {
    position: 'absolute',
    bottom: 24 * S, left: 20 * S, right: 20 * S,
    backgroundColor: '#01193D',
    borderRadius: 12,
    paddingVertical: 16 * S, paddingHorizontal: 20 * S,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartBadge: {
    width: 24 * S, height: 24 * S, borderRadius: 12 * S,
    backgroundColor: '#68ECCB',
    alignItems: 'center', justifyContent: 'center',
  },
  cartBadgeText: { fontSize: 12 * S, fontWeight: '700', color: '#01193D' },
  cartLabel: {
    fontSize: 15 * S, fontWeight: '600',
    color: '#F8F3ED', flex: 1, marginLeft: 10 * S,
  },
  cartTotal: { fontSize: 15 * S, fontWeight: '600', color: '#68ECCB' },
});
