import { supabase } from './supabase';

export type FavouriteType = 'product' | 'cafeteria_product' | 'vendor';

export async function isFavourited(entityType: FavouriteType, entityId: string) {
  const { data, error } = await supabase.rpc('favourite_status', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw error;
  return data === true;
}

export async function toggleFavourite(entityType: FavouriteType, entityId: string) {
  const { data, error } = await supabase.rpc('toggle_favourite', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw error;
  return data === true;
}
