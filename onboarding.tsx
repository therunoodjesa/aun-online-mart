import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, FlatList, Animated
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');


const SLIDES = [
  {
    word: 'Shop',
    eyebrow: 'Everything on campus',
    headline: 'Your campus,\nall in one place',
    body: 'Food vendors, the supermarket, cafeteria meals, and beauty services — ordered in minutes, delivered to your door.',
    icon: 'storefront-outline' as const,
    pills: [
      { icon: 'restaurant-outline', label: 'Marketplace' },
      { icon: 'basket-outline', label: 'Supermarket' },
      { icon: 'sparkles-outline', label: 'Services' },
      { icon: 'cafe-outline', label: 'Cafeteria' },
    ],
  },
  {
    word: 'Sell',
    eyebrow: 'For vendors',
    headline: 'Reach every\nstudent on campus',
    body: 'Set up your store in minutes. List products, manage orders, and get paid — all from one dashboard.',
    icon: 'cube-outline' as const,
    pills: [
      { icon: 'storefront-outline', label: 'Your storefront' },
      { icon: 'stats-chart-outline', label: 'Analytics' },
      { icon: 'wallet-outline', label: 'Fast payouts' },
      { icon: 'people-outline', label: '1,000+ students' },
    ],
  },
  {
    word: 'Deliver',
    eyebrow: 'Fast and affordable',
    headline: 'Fast, tracked,\nalmost free',
    body: 'Delivery and packaging costs ₦0–80. Track your order live and get notified the moment it arrives.',
    icon: 'bicycle-outline' as const,
    pills: [
      { icon: 'time-outline', label: '~45 min' },
      { icon: 'cash-outline', label: '₦0–80 fee' },
      { icon: 'location-outline', label: 'Live tracking' },
      { icon: 'notifications-outline', label: 'Alerts' },
    ],
  },
  {
    word: 'Repeat',
    eyebrow: 'Built for habit',
    headline: 'Once you order,\nreordering is two taps',
    body: 'AOM remembers your favourites, your usual proteins, your delivery address. Every order gets faster.',
    icon: 'refresh-outline' as const,
    pills: [
      { icon: 'heart-outline', label: 'Favourites' },
      { icon: 'refresh-outline', label: 'Reorder' },
      { icon: 'phone-portrait-outline', label: 'Push alerts' },
      { icon: 'id-card-outline', label: 'Meal plan' },
    ],
  },
];

const TAGLINE = ['Shop.', 'Sell.', 'Deliver.', 'Repeat.'];

export default function Onboarding() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.replace('/(buyer)');
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
      setCurrentIndex(currentIndex - 1);
    }
  };

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => (
    <View style={styles.slide}>

      <View style={styles.artWrap}>
        <View style={styles.artCircle}>
          // Replace the artCircleInner content
<View style={styles.artCircleInner}>
  <Ionicons
    name={item.icon}
    size={52}
    color="rgba(240,234,214,0.9)"
  />
</View>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>{item.eyebrow}</Text>
        <Text style={styles.headline}>{item.headline}</Text>
        <Text style={styles.body}>{item.body}</Text>

        <View style={styles.pillsRow}>
  {item.pills.map((pill) => (
    <View key={pill.label} style={styles.pill}>
      <Ionicons name={pill.icon as any} size={13} color="rgba(255,255,255,0.65)" />
      <Text style={styles.pillText}>{pill.label}</Text>
    </View>
  ))}
</View>

        <View style={styles.taglineRow}>
          {TAGLINE.map((word, i) => (
            <Text
              key={word}
              style={[styles.taglineWord, i === index && styles.taglineWordActive]}
            >
              {word}{i < TAGLINE.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </View>
      </View>

    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <Text style={styles.stepText}>{currentIndex + 1} of {SLIDES.length}</Text>
        <TouchableOpacity onPress={() => router.replace('/(buyer)')}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: width, offset: width * index, index
        })}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && styles.dotActive
              ]}
            />
          ))}
        </View>

        <View style={styles.navRow}>
          {currentIndex > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>←</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}

          <TouchableOpacity
            style={[
              styles.nextBtn,
              currentIndex === SLIDES.length - 1 && styles.nextBtnFinal
            ]}
            onPress={goNext}
          >
            <Text style={[
              styles.nextBtnText,
              currentIndex === SLIDES.length - 1 && styles.nextBtnTextFinal
            ]}>
              {currentIndex === SLIDES.length - 1 ? 'Get started' : 'Next'} →
            </Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#01193D',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  stepText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  skipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  slide: {
    width,
    flex: 1,
    paddingHorizontal: 24,
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  artCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCircleInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artEmoji: {
    fontSize: 48,
  },
  content: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4ecda4',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8F3ED',
    lineHeight: 34,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
    marginBottom: 20,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  pill: {
  backgroundColor: 'rgba(255,255,255,0.07)',
  borderWidth: 0.5,
  borderColor: 'rgba(255,255,255,0.12)',
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 6,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
},
  pillText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  taglineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  taglineWord: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.2)',
  },
  taglineWordActive: {
    color: '#4ecda4',
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 20,
    borderRadius: 3,
    backgroundColor: '#1D9E75',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: {
    width: 48,
  },
  backBtnText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
  },
  nextBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnFinal: {
    backgroundColor: '#F8F3ED',
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  nextBtnTextFinal: {
    color: '#01193D',
  },
});