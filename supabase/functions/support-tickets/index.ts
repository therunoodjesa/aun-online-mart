import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type TicketStatus = 'open' | 'in_progress' | 'resolved';
type RequestBody =
  | { action: 'create'; category?: string; subject?: string; message?: string }
  | { action: 'list' }
  | { action: 'update'; ticket_id?: string; status?: TicketStatus; reply?: string };

const categories = new Set(['order', 'payment', 'delivery', 'account', 'vendor', 'general']);
const statuses = new Set<TicketStatus>(['open', 'in_progress', 'resolved']);

async function isAdmin(db: ReturnType<typeof admin>, userId: string) {
  const { data } = await db.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in before contacting support.' }, 401);
    const body = await request.json() as RequestBody;
    const db = admin();

    if (body.action === 'create') {
      const category = String(body.category ?? 'general').trim().toLowerCase();
      const subject = String(body.subject ?? '').trim();
      const message = String(body.message ?? '').trim();
      if (!categories.has(category)) return json({ error: 'Choose a valid support topic.' }, 400);
      if (subject.length < 3 || subject.length > 120) return json({ error: 'Use a short subject between 3 and 120 characters.' }, 400);
      if (message.length < 5 || message.length > 1200) return json({ error: 'Describe the issue in 5 to 1,200 characters.' }, 400);
      const { data, error } = await db.from('support_tickets').insert({ user_id: user.id, category, subject, message }).select('id, status, created_at').single();
      if (error) throw new Error(error.message);
      return json({ ticket: data });
    }

    if (body.action === 'list') {
      const administrator = await isAdmin(db, user.id);
      const query = db.from('support_tickets').select('id, user_id, category, subject, message, status, admin_reply, replied_at, resolved_at, created_at, updated_at').order('updated_at', { ascending: false }).limit(administrator ? 200 : 50);
      const { data: tickets, error } = administrator ? await query : await query.eq('user_id', user.id);
      if (error) throw new Error(error.message);
      if (!administrator) return json({ tickets: tickets ?? [], administrator: false });
      const userIds = [...new Set((tickets ?? []).map((ticket) => ticket.user_id))];
      // Older AOM profile rows do not always have an email field. Support only
      // needs the customer name and phone, so do not let a missing email block
      // every ticket from loading.
      const { data: profiles, error: profilesError } = userIds.length ? await db.from('profiles').select('id, full_name, phone').in('id', userIds) : { data: [], error: null };
      if (profilesError) throw new Error(profilesError.message);
      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return json({ tickets: (tickets ?? []).map((ticket) => ({ ...ticket, customer: profilesById.get(ticket.user_id) ?? null })), administrator: true });
    }

    if (body.action === 'update') {
      if (!body.ticket_id || !statuses.has(body.status ?? 'open')) return json({ error: 'Choose a valid ticket and status.' }, 400);
      if (!(await isAdmin(db, user.id))) return json({ error: 'Administrator access is required.' }, 403);
      const reply = body.reply?.trim() || null;
      if (reply && reply.length > 1200) return json({ error: 'Keep the reply under 1,200 characters.' }, 400);
      const values = {
        status: body.status,
        admin_reply: reply,
        replied_by: reply ? user.id : null,
        replied_at: reply ? new Date().toISOString() : null,
        resolved_at: body.status === 'resolved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { data: ticket, error } = await db.from('support_tickets').update(values).eq('id', body.ticket_id).select('id, user_id, subject, status, admin_reply').single();
      if (error || !ticket) throw new Error(error?.message ?? 'Support ticket not found.');
      if (reply) await db.from('notifications').insert({ user_id: ticket.user_id, title: 'AOM support replied', body: reply, message: reply, kind: 'general', action_label: 'VIEW SUPPORT', action_href: '/(buyer)/support', is_read: false });
      return json({ ticket });
    }

    return json({ error: 'Choose a valid support action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Support is temporarily unavailable. Please try again.' }, 400);
  }
});
