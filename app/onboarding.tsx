import { useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  navy: '#01193D',
  mint: '#68ECCB',
  cream: '#F8F3ED',
  muted: '#A0A0A0',
  white: '#FFFFFF',
} as const;

type IconName = keyof typeof Ionicons.glyphMap;

type Slide = {
  id: 'shop' | 'sell' | 'deliver' | 'repeat';
  word: string;
  heading: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    id: 'shop',
    word: 'SHOP',
    heading: 'All your favourite vendors, all in one place.',
    body: '800+ products from food vendors, our supermarket, cafeteria meals, and service bookings under one umbrella, just for you.',
  },
  {
    id: 'sell',
    word: 'SELL',
    heading: 'Reach your entire desired audience (and more).',
    body: 'For student and local entrepreneurs, set up your store in minutes. List products, manage orders, and get paid all from one customised dashboard.',
  },
  {
    id: 'deliver',
    word: 'DELIVER',
    heading: 'Fast, tracked, incredibly affordable',
    body: 'AUN Online Mart works with a dedicated group of delivery riders who are trained to prioritise your requests. Track your order live and get notified the moment it arrives.',
  },
  {
    id: 'repeat',
    word: 'REPEAT',
    heading: "Let's set things up",
    body: 'A few quick permissions so our platform works best for you.',
  },
];

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: 'storefront-outline', label: 'Supermarket' },
  { icon: 'restaurant-outline', label: 'Marketplace' },
  { icon: 'cafe-outline', label: 'Cafeteria' },
  { icon: 'sparkles-outline', label: 'Service bookings' },
];

const SELL_CARDS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'storefront-outline', title: 'Your storefront', body: 'Customised beautifully in the Number 1 multi-vendor marketplace.' },
  { icon: 'bar-chart-outline', title: 'Sales analytics', body: 'Grow the sleek way. Track every order, high-performing products, etc.' },
  { icon: 'card-outline', title: 'Secure payouts', body: "Get your money securely with Paystack's system, and quickly." },
  { icon: 'people-outline', title: '1000+ audience', body: 'AUN students & external customers.' },
];

const DELIVERY_STEPS: { icon: IconName; label: string; detail: string }[] = [
  { icon: 'phone-portrait-outline', label: 'Order placed', detail: 'AISHA KANDE HALL' },
  { icon: 'desktop-outline', label: 'Order received & processed', detail: 'VENDOR APPROVED' },
  { icon: 'bicycle-outline', label: 'Package delivered', detail: 'YOUR ORDER HAS ARRIVED AT AISHA KANDE HALL' },
];

const PERMISSIONS: { icon: IconName; title: string; detail: string; available: boolean }[] = [
  { icon: 'notifications-outline', title: 'Push notification', detail: 'Order updates and delivery alerts', available: true },
  { icon: 'location-outline', title: 'Location', detail: 'Autofill your delivery address', available: true },
  { icon: 'id-card-outline', title: 'Sync your AUN ID', detail: 'Feature coming soon', available: false },
];

function PageIndicator({ active }: { active: number }) {
  return (
    <View style={styles.indicator} accessibilityLabel={`Step ${active + 1} of 4`}>
      {SLIDES.map((slide, index) => (
        <View key={slide.id} style={index === active ? styles.indicatorActive : styles.indicatorDot} />
      ))}
    </View>
  );
}

function FeaturePills() {
  return (
    <View style={styles.pills}>
      {FEATURES.map((feature) => (
        <View key={feature.label} style={styles.pill}>
          <Ionicons name={feature.icon} size={15} color={COLORS.mint} />
          <Text style={styles.pillLabel}>{feature.label}</Text>
        </View>
      ))}
    </View>
  );
}

function BrandTagline({ active, repeat = false }: { active: number; repeat?: boolean }) {
  const words = ['Shop', 'Sell', 'Deliver', 'Repeat'];
  return (
    <View style={styles.tagline}>
      {words.map((word, index) => {
        const isRepeatIcon = repeat && word === 'Repeat';
        if (isRepeatIcon) return <Ionicons key={word} name="refresh-outline" size={21} color={COLORS.mint} />;
        return (
          <Text key={word} style={[styles.taglineWord, { color: index === active ? COLORS.mint : COLORS.cream }]}>
            {word}{word === 'Repeat' ? '.' : ' · '}
          </Text>
        );
      })}
    </View>
  );
}

function ShopArt({ pageWidth }: { pageWidth: number }) {
  return (
    <View style={[styles.shopArt, { left: (pageWidth - 370) / 2 }]}>
      <View style={styles.ringOuter} />
      <View style={styles.ringInner} />
      <Ionicons name="cart-outline" size={64} color={COLORS.mint} />
      <View style={[styles.artIcon, styles.artFood]}><Ionicons name="restaurant-outline" size={21} color={COLORS.mint} /></View>
      <View style={[styles.artIcon, styles.artStore]}><Ionicons name="storefront-outline" size={21} color={COLORS.mint} /></View>
      <View style={[styles.artIcon, styles.artService]}><View style={styles.starCenter}><Ionicons name="sparkles-outline" size={21} color={COLORS.mint} /></View></View>
    </View>
  );
}

function StandardContent({ slide, index }: { slide: Slide; index: number }) {
  return (
    <View style={styles.standardContent}>
      <PageIndicator active={index} />
      <Text style={styles.word}>{slide.word}</Text>
      <Text style={styles.heading}>{slide.heading}</Text>
      <Text style={styles.body}>{slide.body}</Text>
      <FeaturePills />
      <BrandTagline active={index} />
    </View>
  );
}

function ShopSlide({ slide, pageWidth }: { slide: Slide; pageWidth: number }) {
  return <><ShopArt pageWidth={pageWidth} /><StandardContent slide={slide} index={0} /></>;
}

function SellSlide({ slide, pageWidth }: { slide: Slide; pageWidth: number }) {
  return (
    <>
      <View style={[styles.cardGrid, { left: (pageWidth - 370) / 2 }]}>
        {SELL_CARDS.map((card) => (
          <View key={card.title} style={styles.sellCard}>
            <Ionicons name={card.icon} size={24} color={COLORS.mint} />
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.body}</Text>
          </View>
        ))}
      </View>
      <StandardContent slide={slide} index={1} />
    </>
  );
}

function DeliverSlide({ slide, pageWidth }: { slide: Slide; pageWidth: number }) {
  return (
    <>
      <View style={[styles.deliveryList, { left: (pageWidth - 292) / 2 }]}>
        {DELIVERY_STEPS.map((step, index) => (
          <View key={step.label}>
            <View style={styles.deliveryCard}>
              <View style={styles.deliveryIcon}><Ionicons name={step.icon} size={20} color={COLORS.mint} /></View>
              <View style={styles.deliveryCopy}>
                <Text style={styles.deliveryLabel}>{step.label}</Text>
                <Text style={styles.deliveryDetail}>{step.detail}</Text>
              </View>
            </View>
            {index < DELIVERY_STEPS.length - 1 && <View style={styles.deliveryLine} />}
          </View>
        ))}
      </View>
      <StandardContent slide={slide} index={2} />
    </>
  );
}

function RepeatSlide({ slide, pageWidth, pageHeight }: { slide: Slide; pageWidth: number; pageHeight: number }) {
  const [permissions, setPermissions] = useState([true, true, false]);
  const repeatContentWidth = Math.min(370, pageWidth - 60);
  const permissionsWidth = Math.min(381, pageWidth - 46);
  const bottomWidth = Math.min(370, pageWidth - 46);
  const permissionsTop = Math.max(238, Math.min(288, pageHeight * 0.3));
  const bottomTop = permissionsTop + 280;
  const togglePermission = (index: number) => {
    if (!PERMISSIONS[index].available) return;
    setPermissions((current) => current.map((enabled, itemIndex) => itemIndex === index ? !enabled : enabled));
  };

  return (
    <View>
      <View style={[styles.repeatHeader, { width: repeatContentWidth, left: (pageWidth - repeatContentWidth) / 2 }]}>
        <Text style={styles.word}>{slide.word}</Text>
        <Text style={styles.repeatHeading}>{slide.heading}</Text>
        <Text style={styles.repeatBody}>{slide.body}</Text>
      </View>
      <View style={[styles.permissions, { width: permissionsWidth, left: (pageWidth - permissionsWidth) / 2, top: permissionsTop }]}>
        {PERMISSIONS.map((permission, index) => (
          <View key={permission.title}>
            <View style={styles.permissionRow}>
              <View style={[styles.permissionIcon, { borderColor: permission.available ? COLORS.mint : COLORS.muted }]}>
                <Ionicons name={permission.icon} size={24} color={permission.available ? COLORS.mint : COLORS.muted} />
              </View>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>{permission.title}</Text>
                <Text style={styles.permissionDetail}>{permission.detail}</Text>
              </View>
              <Switch
                value={permissions[index]}
                disabled={!permission.available}
                onValueChange={() => togglePermission(index)}
                trackColor={{ false: '#E6E0E9', true: COLORS.white }}
                thumbColor={permissions[index] ? COLORS.navy : '#79747E'}
              />
            </View>
            {index < PERMISSIONS.length - 1 && <View style={styles.permissionDivider} />}
          </View>
        ))}
      </View>
      <View style={[styles.repeatBottom, { width: bottomWidth, left: (pageWidth - bottomWidth) / 2, top: bottomTop }]}>
        <PageIndicator active={3} />
        <FeaturePills />
        <BrandTagline active={3} repeat />
      </View>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const listRef = useRef<FlatList<Slide>>(null);
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);

  const moveTo = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };
  const finish = () => router.replace('/(auth)/signup');
  const next = () => currentIndex === SLIDES.length - 1 ? finish() : moveTo(currentIndex + 1);

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={[styles.page, { width, height }]}>
      <ScrollView style={styles.slideScroll} contentContainerStyle={[styles.slideContent, { minHeight: item.id === 'repeat' ? height + 230 : height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.topBar, item.id === 'repeat' && { paddingHorizontal: Math.max(30, (width - Math.min(370, width - 60)) / 2) }]}>
          <Text style={styles.step}>{`${index + 1} of ${SLIDES.length}`}</Text>
          <TouchableOpacity onPress={finish} accessibilityRole="button" accessibilityLabel="Skip onboarding" hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        </View>
        {item.id === 'shop' && <ShopSlide slide={item} pageWidth={width} />}
        {item.id === 'sell' && <SellSlide slide={item} pageWidth={width} />}
        {item.id === 'deliver' && <DeliverSlide slide={item} pageWidth={width} />}
        {item.id === 'repeat' && <RepeatSlide slide={item} pageWidth={width} pageHeight={height} />}
      </ScrollView>
    </View>
  );

  const firstPage = currentIndex === 0;
  const finalPage = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        key={`${width}-${height}`}
        ref={listRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        snapToInterval={width}
        decelerationRate="fast"
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.slideList}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      <View style={[styles.navigation, firstPage && styles.navigationFirst]}>
        {!firstPage && (
          <TouchableOpacity style={styles.backButton} onPress={() => moveTo(currentIndex - 1)} accessibilityRole="button" accessibilityLabel="Previous step">
            <Ionicons name="arrow-back-outline" size={25} color={COLORS.navy} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.nextButton, firstPage && styles.nextButtonFull]} onPress={next} accessibilityRole="button">
          <Text style={styles.nextLabel}>{firstPage ? 'PROCEED' : finalPage ? 'GET STARTED' : 'NEXT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  slideList: { flex: 1 },
  page: { backgroundColor: COLORS.navy, overflow: 'hidden' },
  slideScroll: { flex: 1 },
  slideContent: { position: 'relative', paddingBottom: 115 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30, paddingTop: 42 },
  step: { color: COLORS.muted, fontSize: 16 },
  skip: { color: COLORS.muted, fontSize: 16, fontWeight: '600' },
  shopArt: { position: 'absolute', top: 57, left: 30, width: 370, height: 370, alignItems: 'center', justifyContent: 'center' },
  ringOuter: { position: 'absolute', width: 370, height: 370, borderRadius: 185, backgroundColor: 'rgba(255,255,255,0.12)' },
  ringInner: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,255,255,0.12)' },
  artIcon: { position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(18,58,77,0.55)', alignItems: 'center', justifyContent: 'center' },
  starCenter: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  artFood: { top: 35, right: 0 }, artStore: { bottom: 5, left: 28 }, artService: { bottom: 5, right: 30 },
  standardContent: { position: 'absolute', top: 486, left: 30, width: 370 },
  indicator: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  indicatorActive: { width: 46, height: 7, borderRadius: 4, backgroundColor: COLORS.mint },
  indicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(104,236,203,0.4)' },
  word: { color: COLORS.mint, fontSize: 20, fontWeight: '600', lineHeight: 24, marginBottom: 8 },
  heading: { color: COLORS.cream, fontSize: 20, fontWeight: '600', lineHeight: 24, width: 280, marginBottom: 10 },
  body: { color: COLORS.muted, fontSize: 16, lineHeight: 19, width: 315, marginBottom: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', marginBottom: 15 },
  pill: { height: 31, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 16, backgroundColor: 'rgba(104,236,203,0.2)' },
  pillLabel: { color: COLORS.mint, fontSize: 15 },
  tagline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  taglineWord: { fontSize: 20, fontWeight: '600', lineHeight: 24 },
  cardGrid: { position: 'absolute', top: 107, left: 30, width: 370, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sellCard: { width: 181.5, height: 161, padding: 12, borderRadius: 8, backgroundColor: 'rgba(217,217,217,0.5)' },
  cardTitle: { color: COLORS.cream, fontSize: 19, fontWeight: '600', lineHeight: 24, marginTop: 8 },
  cardBody: { color: COLORS.white, fontSize: 13, lineHeight: 17, marginTop: 5 },
  deliveryList: { position: 'absolute', top: 73, left: 69, width: 292 },
  deliveryCard: { height: 91, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  deliveryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(18,58,77,0.4)', alignItems: 'center', justifyContent: 'center' },
  deliveryCopy: { flex: 1 }, deliveryLabel: { color: COLORS.muted, fontSize: 16, fontWeight: '600', marginBottom: 5 },
  deliveryDetail: { color: COLORS.white, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  deliveryLine: { width: 1, height: 56, backgroundColor: 'rgba(160,160,160,0.7)', alignSelf: 'center' },
  repeatHeader: { position: 'absolute', top: 45, left: 30, width: 305 },
  repeatHeading: { color: COLORS.cream, fontSize: 24, lineHeight: 29, fontWeight: '600', width: 160, marginBottom: 8 },
  repeatBody: { color: COLORS.muted, fontSize: 16, lineHeight: 19 },
  permissions: { position: 'absolute', top: 288, left: 23, width: 381 },
  permissionRow: { minHeight: 79, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  permissionIcon: { width: 50, height: 50, borderWidth: 1, borderRadius: 15, backgroundColor: '#11334B', alignItems: 'center', justifyContent: 'center' },
  permissionCopy: { flex: 1 }, permissionTitle: { color: COLORS.cream, fontSize: 16, fontWeight: '600', marginBottom: 3 },
  permissionDetail: { color: COLORS.muted, fontSize: 15 }, permissionDivider: { height: 1, backgroundColor: 'rgba(160,160,160,0.5)' },
  repeatBottom: { position: 'absolute', top: 600, left: 28, width: 370 },
  navigation: { position: 'absolute', left: 21, right: 35, bottom: 21, height: 69, flexDirection: 'row', gap: 4 },
  navigationFirst: { left: 34 },
  backButton: { width: 96, height: 55, borderRadius: 8, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  nextButton: { flex: 1, height: 55, borderRadius: 8, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  nextButtonFull: { width: '100%' },
  nextLabel: { color: COLORS.navy, fontSize: 20, lineHeight: 24, fontWeight: '800' },
});
