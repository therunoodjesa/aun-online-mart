import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const SESSION_KEY = 'aom:journey-session-id';
const ANONYMOUS_KEY = 'aom:journey-anonymous-id';

const makeId = () => `aom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const getIdentity = async () => {
  let sessionId = await AsyncStorage.getItem(SESSION_KEY);
  let anonymousId = await AsyncStorage.getItem(ANONYMOUS_KEY);
  if (!sessionId) { sessionId = makeId(); await AsyncStorage.setItem(SESSION_KEY, sessionId); }
  if (!anonymousId) { anonymousId = makeId(); await AsyncStorage.setItem(ANONYMOUS_KEY, anonymousId); }
  return { sessionId, anonymousId };
};

export const recordJourneyEvent = async (eventName: string, route: string, properties: Record<string, string | number | boolean> = {}) => {
  try {
    const { sessionId, anonymousId } = await getIdentity();
    await supabase.functions.invoke('journey-track', { body: { session_id: sessionId, anonymous_id: anonymousId, event_name: eventName, route, properties } });
  } catch { /* Analytics must never interrupt a customer journey. */ }
};

export const touchJourneySession = async (route: string) => {
  try {
    const { sessionId, anonymousId } = await getIdentity();
    await supabase.functions.invoke('journey-track', { body: { session_id: sessionId, anonymous_id: anonymousId, route, heartbeat: true } });
  } catch { /* A missed heartbeat is harmless. */ }
};
