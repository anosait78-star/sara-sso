// Push dispatcher (PROJECT_PLAN §12, D10 = Expo push only).
// Poked every minute by pg_cron (app.kick_push_dispatch) while pushes are queued. It takes no input and
// only sends what the database already queued (rendered + filtered by templates and preferences), so
// calling it is harmless; it needs the service role to read device tokens and to mark results.
import { adminClient, handle, json } from '../_shared/http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo accepts up to 100 messages per request

interface Queued {
  id: string; title: string | null; body: string | null; link: string | null; entity_type: string | null; entity_id: string | null; tokens: string[];
}
interface Ticket { status: 'ok' | 'error'; message?: string; details?: { error?: string } }
interface Result { id: string; status: 'sent' | 'failed'; error: string | null; invalid_tokens: string[] }

Deno.serve((req) =>
  handle(req, async () => {
    const db = adminClient();
    let sent = 0;
    let failed = 0;
    for (let round = 0; round < 5; round++) {
      const { data, error } = await db.rpc('claim_push_batch', { p_limit: CHUNK });
      if (error) throw error;
      const batch = (data ?? []) as Queued[];
      if (batch.length === 0) break;

      const messages = batch.flatMap((n) => n.tokens.map((to) => ({
        id: n.id, to,
        msg: {
          to, title: n.title ?? 'SSO', body: n.body ?? '', sound: 'default', priority: 'high', channelId: 'default',
          data: { link: n.link, entity_type: n.entity_type, entity_id: n.entity_id, notification_id: n.id },
        },
      })));
      const outcome = new Map<string, Result>(batch.map((n) => [n.id, {
        id: n.id, status: 'failed', error: n.tokens.length ? null : 'no device', invalid_tokens: [],
      }]));

      for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        let tickets: Ticket[] = [];
        let requestError: string | null = null;
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(chunk.map((m) => m.msg)),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) requestError = `expo ${res.status}: ${JSON.stringify(payload?.errors ?? payload).slice(0, 300)}`;
          tickets = (payload?.data ?? []) as Ticket[];
        } catch (e) {
          requestError = `expo unreachable: ${(e as Error).message}`;
        }
        chunk.forEach((m, k) => {
          const r = outcome.get(m.id)!;
          const t = tickets[k];
          if (t?.status === 'ok') {
            r.status = 'sent';
            r.error = null;
          } else if (r.status !== 'sent') {
            r.error = requestError ?? t?.message ?? 'unknown error';
          }
          if (t?.details?.error === 'DeviceNotRegistered') r.invalid_tokens.push(m.to);
        });
      }

      const results = [...outcome.values()];
      sent += results.filter((r) => r.status === 'sent').length;
      failed += results.filter((r) => r.status === 'failed').length;
      const { error: finishError } = await db.rpc('finish_push_batch', { p_results: results });
      if (finishError) throw finishError;
      if (batch.length < CHUNK) break;
    }
    return json({ sent, failed });
  }),
);
