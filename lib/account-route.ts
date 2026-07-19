import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AccountHome = '/admin-portal' | '/cafeteria-portal' | '/vendor-portal' | '/(buyer)/';

/** Resolve the signed-in account's workspace from backend ownership, not the screen it came from. */
export async function resolveAccountHome(user: User): Promise<AccountHome> {
  const [administratorResult, cafeteriaResult, vendorResult] = await Promise.all([
    supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('cafeteria_staff').select('user_id').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    supabase.from('vendors').select('id').eq('owner_id', user.id).maybeSingle(),
  ]);

  if (administratorResult.data) return '/admin-portal';
  if (cafeteriaResult.data) return '/cafeteria-portal';
  if (vendorResult.data || user.user_metadata?.role === 'vendor') return '/vendor-portal';
  return '/(buyer)/';
}
