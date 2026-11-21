import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APPID = Deno.env.get('WECHAT_APPID') ?? '';
const SECRET = Deno.env.get('WECHAT_SECRET') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes).map((b) => b.toString(36)).join('').slice(0, 24) + 'Aa1!';
}

async function exchangeCode(code: string) {
  const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  url.searchParams.set('appid', APPID);
  url.searchParams.set('secret', SECRET);
  url.searchParams.set('code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const res = await fetch(url.toString());
  const data = plainObject(await res.json());
  if (!res.ok || !data.openid) {
    throw new Error(String(data.errmsg ?? 'wechat_exchange_failed'));
  }
  return {
    openid: String(data.openid),
    unionid: data.unionid ? String(data.unionid) : null,
  };
}

async function issueSession(userId: string) {
  const { data: profile } = await db.from('profiles').select('username').eq('id', userId).maybeSingle();
  const email = `${profile?.username ?? 'wx'}@miaoda.com`;
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) {
    throw new Error('session_issue_failed');
  }
  return { tokenHash: link.data.properties.hashed_token, username: profile?.username ?? '' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = plainObject(await req.json());
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const action = String(body.action ?? '');

  try {
    if (action === 'start') {
      if (!APPID || !SECRET) {
        return json({ ok: true, configured: false });
      }
      const redirectUri = String(body.redirectUri ?? '');
      if (!/^https?:\/\//.test(redirectUri)) {
        return json({ ok: false, error: 'bad_redirect' }, 400);
      }
      const state = crypto.randomUUID();
      const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize');
      url.searchParams.set('appid', APPID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'snsapi_userinfo');
      url.searchParams.set('state', state);
      return json({ ok: true, configured: true, url: url.toString() + '#wechat_redirect' });
    }

    if (action === 'callback') {
      if (!APPID || !SECRET) return json({ ok: true, configured: false });
      const code = String(body.code ?? '');
      if (!code) return json({ ok: false, error: 'missing_code' }, 400);

      const wx = await exchangeCode(code);
      const { data: bound, error: boundError } = await db
        .from('wechat_accounts')
        .select('user_id')
        .eq('openid', wx.openid)
        .maybeSingle();
      if (boundError) throw boundError;

      if (bound?.user_id) {
        await db
          .from('wechat_accounts')
          .update({ last_login_at: new Date().toISOString() })
          .eq('openid', wx.openid);
        const session = await issueSession(String(bound.user_id));
        return json({ ok: true, configured: true, isNew: false, ...session, userId: bound.user_id });
      }

      const username = `wx_${wx.openid.slice(-10)}`;
      const created = await db.auth.admin.createUser({
        email: `${username}@miaoda.com`,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { username },
      });
      if (created.error || !created.data.user) throw new Error('user_create_failed');

      const userId = created.data.user.id;
      const { error: bindError } = await db.from('wechat_accounts').insert({
        openid: wx.openid,
        unionid: wx.unionid,
        user_id: userId,
      });
      if (bindError) throw bindError;

      const session = await issueSession(userId);
      return json({ ok: true, configured: true, isNew: true, ...session, userId });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('wechat-auth failed', action, err instanceof Error ? err.message : String(err));
    return json({ ok: false, error: 'wechat_failed' }, 500);
  }
});
