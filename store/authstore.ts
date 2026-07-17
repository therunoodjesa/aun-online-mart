import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';

type AuthStore = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  profile: null,
  isLoading: true,

  setSession: (session) => set({ session, isLoading: false }),
  setProfile: (profile) => set({ profile }),

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) set({ profile: data });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));