import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isFavourited, toggleFavourite, type FavouriteType } from '../lib/favourites';

type Props = {
  entityType: FavouriteType;
  entityId: string;
  style?: object;
  onChange?: (saved: boolean) => void;
};

export function FavouriteButton({ entityType, entityId, style, onChange }: Props) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void isFavourited(entityType, entityId).then((value) => { if (active) setSaved(value); }).catch(() => { if (active) setSaved(false); });
    return () => { active = false; };
  }, [entityType, entityId]);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await toggleFavourite(entityType, entityId);
      setSaved(next);
      onChange?.(next);
    } catch (error) {
      Alert.alert('Could not update favourite', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <TouchableOpacity onPress={press} disabled={busy} style={[styles.button, style]} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from favourites' : 'Add to favourites'}>{busy ? <ActivityIndicator size="small" color="#68ECCB" /> : <Ionicons name={saved ? 'heart' : 'heart-outline'} size={23} color="#68ECCB" />}</TouchableOpacity>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.78)', borderWidth: 1, borderColor: 'rgba(248,243,237,0.7)' },
});
