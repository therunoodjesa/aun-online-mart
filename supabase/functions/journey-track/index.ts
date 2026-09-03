import { admin, getUser, json } from '../_shared/paystack.ts';

type JourneyRequest = {
  session_id?: unknown;
  anonymous_id?: unknown;
  event_name?: unknown;
  route?: unknown;
  properties?: unknown;
  heartbeat?: unknown;
};

const safeText = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const safeProperties = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 12)
    .flatMap(([key, item]) => {
      const field = safeText(key, 48);
      if (!field || !['string', 'number', 'boolean'].includes(typeof item)) return [];
      const clean = typeof item === 'string' ? item.trim().slice(0, 140) : item;
      return [[field, clean]];
    }));
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await request.json() as JourneyRequest;
    const sessionId = safeText(body.session_id, 120);
    const anonymousId = safeText(body.anonymous_id, 120);
    const eventName = safeText(body.event_name, 80);
    const route = safeText(body.route, 180) || null;
    const heartbeat = body.heartbeat === true;
    if (!sessionId || (!heartbeat && !eventName)) return json({ error: 'A valid activity event is required.' }, 400);

    const user = await getUser(request);
    const db = admin();
    const now = new Date().toISOString();
    const { data: existing, error: lookupError } = await db.from('customer_journey_sessions').select('session_id').eq('session_id', sessionId).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    const session = {
      user_id: user?.id ?? null,
      anonymous_id: anonymousId || null,
      current_route: route,
      last_event_name: heartbeat ? 'session_active' : eventName,
      last_event_at: now,
      updated_at: now,
    };
    const { error: sessionError } = existing
      ? await db.from('customer_journey_sessions').update(session).eq('session_id', sessionId)
      : await db.from('customer_journey_sessions').insert({ session_id: sessionId, ...session, started_at: now });
    if (sessionError) throw new Error(sessionError.message);

    if (!heartbeat) {
      const { error: eventError } = await db.from('customer_journey_events').insert({
        session_id: sessionId,
        user_id: user?.id ?? null,
        event_name: eventName,
        route,
        properties: safeProperties(body.properties),
      });
      if (eventError) throw new Error(eventError.message);
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Activity could not be recorded.' }, 400);
  }
});
