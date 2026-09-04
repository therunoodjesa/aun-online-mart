import * as webpush from 'jsr:@negrel/webpush@^0.5.0';
import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type PushSubscription = { endpoint?: string; p256dh?: string; auth?: string; user_agent?: string };
type PushRequest = { action?: 'register'; subscription?: PushSubscription; user_ids?: string[]; title?: string; body?: string; url?: string; tag?: string; test?: boolean };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json() as PushRequest;
    const expectedSecret = Deno.env.get('PORTAL_PUSH_INTERNAL_SECRET');
    const internalRequest = Boolean(expectedSecret && request.headers.get('X-Internal-Secret') === expectedSecret);
    const user = internalRequest ? null : await getUser(request);
    if (!internalRequest && !user) return json({ error: 'Please sign in before testing device alerts.' }, 401);
    if (!internalRequest && body.action !== 'register' && body.test !== true) return json({ error: 'This endpoint only accepts device registration or a personal device-alert test.' }, 403);
    const db = admin();
    if (body.action === 'register') {
      if (!user) return json({ error: 'Please sign in again before enabling alerts.' }, 401);
      const subscription = body.subscription;
      if (!subscription?.endpoint || !subscription.p256dh || !subscription.auth) return json({ error: 'This browser did not provide a valid device subscription.' }, 400);
      const { error } = await db.from('web_push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: subscription.user_agent ?? null,
        enabled: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message);
      return json({ status: 'registered' });
    }
    const userIds = internalRequest
      ? [...new Set((body.user_ids ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0))]
      : [user!.id];
    if (!userIds.length) return json({ status: 'skipped', reason: 'No recipient users.' });
    const rawKeys = Deno.env.get('WEB_PUSH_VAPID_KEYS_JSON');
    if (!rawKeys) return json({ status: 'skipped', reason: 'Web Push is not configured.' });

    const { data: subscriptions, error } = await db.from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .eq('enabled', true);
    if (error) throw new Error(error.message);
    if (!subscriptions?.length) return json({ status: 'skipped', reason: 'No installed devices have enabled alerts.' });

    const keys = await webpush.importVapidKeys(JSON.parse(rawKeys), { extractable: false });
    const contact = Deno.env.get('WEB_PUSH_CONTACT_EMAIL') ?? 'aunonlinemart@gmail.com';
    const applicationServer = await webpush.ApplicationServer.new({
      contactInformation: contact.startsWith('mailto:') ? contact : `mailto:${contact}`,
      vapidKeys: keys,
    });
    const payload = JSON.stringify({
      title: (internalRequest ? body.title : 'AOM alerts are ready').slice(0, 90),
      body: (internalRequest ? body.body : 'This device will receive order updates from AUN Online Mart.').slice(0, 240),
      url: internalRequest && body.url?.startsWith('/') ? body.url : '/vendor-portal',
      tag: (internalRequest ? body.tag : 'aom-push-test').slice(0, 100),
    });
    let sent = 0;
    const expiredIds: string[] = [];
    for (const subscription of subscriptions) {
      try {
        const recipient = applicationServer.subscribe({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
        await recipient.pushTextMessage(payload, {});
        sent += 1;
        await db.from('web_push_subscriptions').update({ last_sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', subscription.id);
      } catch (pushError) {
        const message = pushError instanceof Error ? pushError.message : 'Unable to send the alert.';
        if (pushError instanceof webpush.PushMessageError && pushError.isGone()) expiredIds.push(subscription.id);
        else await db.from('web_push_subscriptions').update({ last_error: message, updated_at: new Date().toISOString() }).eq('id', subscription.id);
      }
    }
    if (expiredIds.length) await db.from('web_push_subscriptions').delete().in('id', expiredIds);
    return json({ status: 'complete', sent, devices: subscriptions.length, removed_expired: expiredIds.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not send device alerts.' }, 400);
  }
});
