import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_ACCOUNT = Deno.env.get('ADMIN_ACCOUNT') ?? '';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeSave(raw: unknown) {
  const r = plainObject(raw);
  return {
    beans: clampInt(r.beans, 0, 100_000_000),
    chances: clampInt(r.chances, 0, 100_000),
    shuffle: clampInt(r.shuffle, 0, 100_000),
    ad_count: clampInt(r.adCount, 0, 1_000_000),
    prizes: plainObject(r.prizes),
    sign: plainObject(r.sign),
    stats: plainObject(r.stats),
  };
}

function shapeConfig(row: Record<string, unknown>) {
  return {
    winChance: Number(row.win_chance ?? 1),
    weights: Array.isArray(row.weights) ? row.weights : [],
    costs: Array.isArray(row.costs) ? row.costs : [],
    updatedAt: row.updated_at,
  };
}

async function readConfig() {
  const { data, error } = await db.from('game_config').select('*').eq('id', 1).single();
  if (error) throw error;
  return shapeConfig(data as Record<string, unknown>);
}

async function saveEvents(playerId: string, events: unknown) {
  if (!Array.isArray(events) || events.length === 0) return;
  const rows = events.slice(0, 20).map((item) => {
    const e = plainObject(item);
    return {
      player_id: playerId,
      kind: String(e.kind ?? 'event').slice(0, 24),
      payload: plainObject(e.payload),
    };
  });
  const { error } = await db.from('game_events').insert(rows);
  if (error) throw error;
}

function isAdmin(body: Record<string, unknown>): boolean {
  if (!ADMIN_ACCOUNT || !ADMIN_PASSWORD) return false;
  return String(body.account ?? '') === ADMIN_ACCOUNT && String(body.password ?? '') === ADMIN_PASSWORD;
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
  const deviceId = String(body.deviceId ?? '').slice(0, 64);

  try {
    if (action === 'load') {
      if (!deviceId) return json({ ok: false, error: 'missing_device' }, 400);
      const config = await readConfig();
      const { data: player, error } = await db
        .from('players')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();
      if (error) throw error;
      return json({ ok: true, config, player: player ?? null });
    }

    if (action === 'save') {
      if (!deviceId) return json({ ok: false, error: 'missing_device' }, 400);
      const payload = sanitizeSave(body.save);
      const savedAt = Number(body.savedAt) || 0;
      const { data: existing, error: findError } = await db
        .from('players')
        .select('id, updated_at')
        .eq('device_id', deviceId)
        .maybeSingle();
      if (findError) throw findError;

      if (!existing) {
        const { data, error } = await db
          .from('players')
          .insert({ device_id: deviceId, ...payload })
          .select()
          .single();
        if (error) throw error;
        await saveEvents(data.id as string, body.events);
        return json({ ok: true, player: data, created: true });
      }

      const serverTs = new Date(String(existing.updated_at)).getTime();
      if (savedAt > 0 && savedAt + 5000 < serverTs) {
        const { data, error } = await db.from('players').select('*').eq('id', existing.id).single();
        if (error) throw error;
        return json({ ok: true, player: data, stale: true });
      }

      const { data, error } = await db
        .from('players')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      await saveEvents(data.id as string, body.events);
      return json({ ok: true, player: data, stale: false });
    }

    if (action === 'bind') {
      const token = String(body.token ?? '');
      if (!token) return json({ ok: false, error: 'missing_token' }, 400);
      const { data: userData, error: userError } = await db.auth.getUser(token);
      if (userError || !userData?.user) return json({ ok: false, error: 'bad_token' }, 401);
      const userId = userData.user.id;

      const { data: dev, error: devErr } = await db
        .from('players')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();
      if (devErr) throw devErr;
      const { data: usr, error: usrErr } = await db
        .from('players')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (usrErr) throw usrErr;

      let player: Record<string, unknown> | null = null;

      if (!usr && !dev) {
        const { data, error } = await db
          .from('players')
          .insert({ device_id: deviceId, user_id: userId })
          .select()
          .single();
        if (error) throw error;
        player = data;
      } else if (!usr && dev) {
        const { data, error } = await db
          .from('players')
          .update({ user_id: userId })
          .eq('id', dev.id)
          .select()
          .single();
        if (error) throw error;
        player = data;
      } else if (!dev || dev.id === usr.id) {
        const { data, error } = await db
          .from('players')
          .update({ device_id: deviceId })
          .eq('id', usr.id)
          .select()
          .single();
        if (error) throw error;
        player = data;
      } else {
        const prizes: Record<string, number> = {};
        for (const src of [plainObject(usr.prizes), plainObject(dev.prizes)]) {
          for (const [key, value] of Object.entries(src)) {
            prizes[key] = Math.max(prizes[key] ?? 0, Number(value) || 0);
          }
        }
        const signUsr = plainObject(usr.sign);
        const signDev = plainObject(dev.sign);
        const statsUsr = plainObject(usr.stats);
        const statsDev = plainObject(dev.stats);
        const merged = {
          beans: Math.max(Number(usr.beans ?? 0), Number(dev.beans ?? 0)),
          chances: Math.max(Number(usr.chances ?? 0), Number(dev.chances ?? 0)),
          shuffle: Math.max(Number(usr.shuffle ?? 0), Number(dev.shuffle ?? 0)),
          ad_count: Math.max(Number(usr.ad_count ?? 0), Number(dev.ad_count ?? 0)),
          prizes,
          sign: Number(signUsr.total ?? 0) >= Number(signDev.total ?? 0) ? signUsr : signDev,
          stats: {
            spins: Math.max(Number(statsUsr.spins ?? 0), Number(statsDev.spins ?? 0)),
            beans: Math.max(Number(statsUsr.beans ?? 0), Number(statsDev.beans ?? 0)),
          },
        };
        await db.from('players').delete().eq('id', dev.id);
        const { data, error } = await db
          .from('players')
          .update({ ...merged, device_id: deviceId })
          .eq('id', usr.id)
          .select()
          .single();
        if (error) throw error;
        player = data;
      }

      return json({ ok: true, player });
    }

    if (action === 'submit_order') {
      const prizeKey = String(body.prizeKey ?? '').trim().slice(0, 40);
      const prizeName = String(body.prizeName ?? '').trim().slice(0, 80);
      const receiver = String(body.receiver ?? '').trim();
      const phone = String(body.phone ?? '').trim();
      const province = String(body.province ?? '').trim();
      const city = String(body.city ?? '').trim();
      const district = String(body.district ?? '').trim();
      const address = String(body.address ?? '').trim();

      if (!prizeKey || !receiver || !phone || !province || !city || !district || !address) {
        return json({ ok: false, error: 'missing_field' }, 400);
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) return json({ ok: false, error: 'bad_phone' }, 400);
      if (receiver.length > 30) return json({ ok: false, error: 'receiver_too_long' }, 400);
      if (address.length < 4 || address.length > 150) {
        return json({ ok: false, error: 'address_invalid' }, 400);
      }

      let userId: string | null = null;
      const token = String(body.token ?? '');
      if (token) {
        const { data: userData } = await db.auth.getUser(token);
        userId = userData?.user?.id ?? null;
      }

      const { data, error } = await db
        .from('prize_orders')
        .insert({
          prize_key: prizeKey,
          prize_name: prizeName || prizeKey,
          receiver,
          phone,
          province,
          city,
          district,
          address,
          device_id: deviceId,
          user_id: userId,
        })
        .select('id, created_at')
        .single();
      if (error) throw error;
      return json({ ok: true, id: data.id, createdAt: data.created_at });
    }

    if (action === 'admin_orders') {
      if (!isAdmin(body)) return json({ ok: false, error: 'bad_credentials' }, 401);
      const keyword = String(body.keyword ?? '').trim().replace(/[%,()*]/g, '');
      const prizeKey = String(body.prizeKey ?? '').trim();
      const from = String(body.from ?? '').trim();
      const to = String(body.to ?? '').trim();

      let query = db
        .from('prize_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (prizeKey) query = query.eq('prize_key', prizeKey);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('created_at', from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('created_at', to + 'T23:59:59');
      if (keyword) {
        query = query.or(
          'receiver.ilike.%' + keyword + '%,phone.ilike.%' + keyword + '%,address.ilike.%' + keyword + '%'
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return json({ ok: true, orders: data });
    }

    if (action === 'shop_catalog') {
      const { data, error } = await db
        .from('shop_items')
        .select('key, name, icon, tier, cost, stock, kind, amount, sort')
        .eq('active', true)
        .order('sort', { ascending: true });
      if (error) throw error;
      return json({ ok: true, items: data });
    }

    if (action === 'redeem') {
      const itemKey = String(body.itemKey ?? '').trim().slice(0, 40);
      if (!itemKey) return json({ ok: false, error: 'missing_item' }, 400);

      const { data: item, error: iErr } = await db
        .from('shop_items')
        .select('*')
        .eq('key', itemKey)
        .eq('active', true)
        .maybeSingle();
      if (iErr) throw iErr;
      if (!item) return json({ ok: false, error: 'item_not_found' }, 404);
      if (item.stock === 0) return json({ ok: false, error: 'sold_out' }, 409);

      const needShip = item.tier === 'merch' || item.tier === 'prize';
      const ship = (body.ship || {}) as Record<string, unknown>;
      const receiver = String(ship.receiver ?? '').trim();
      const phone = String(ship.phone ?? '').trim();
      const province = String(ship.province ?? '').trim();
      const city = String(ship.city ?? '').trim();
      const district = String(ship.district ?? '').trim();
      const address = String(ship.address ?? '').trim();

      if (needShip) {
        if (!receiver || !phone || !province || !city || !district || !address) {
          return json({ ok: false, error: 'missing_ship' }, 400);
        }
        if (!/^1[3-9]\d{9}$/.test(phone)) return json({ ok: false, error: 'bad_phone' }, 400);
        if (receiver.length > 30 || address.length < 4 || address.length > 150) {
          return json({ ok: false, error: 'bad_address' }, 400);
        }
      }

      let stockLeft = item.stock;
      if (item.stock >= 0) {
        const { data: updated, error: uErr } = await db
          .from('shop_items')
          .update({ stock: item.stock - 1 })
          .eq('key', itemKey)
          .eq('stock', item.stock)
          .select('stock')
          .maybeSingle();
        if (uErr) throw uErr;
        if (!updated) return json({ ok: false, error: 'sold_out' }, 409);
        stockLeft = updated.stock;
      }

      let userId: string | null = null;
      const token = String(body.token ?? '');
      if (token) {
        const { data: userData } = await db.auth.getUser(token);
        userId = userData?.user?.id ?? null;
      }

      const voucher =
        'VL' +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).slice(2, 6).toUpperCase();

      const { data: order, error: oErr } = await db
        .from('redeem_orders')
        .insert({
          voucher,
          item_key: item.key,
          item_name: item.name,
          tier: item.tier,
          cost: item.cost,
          device_id: deviceId,
          user_id: userId,
          receiver: needShip ? receiver : null,
          phone: needShip ? phone : null,
          province: needShip ? province : null,
          city: needShip ? city : null,
          district: needShip ? district : null,
          address: needShip ? address : null,
          status: needShip ? 'pending' : 'issued',
        })
        .select('id, voucher, created_at')
        .single();
      if (oErr) throw oErr;

      return json({
        ok: true,
        voucher: order.voucher,
        orderId: order.id,
        createdAt: order.created_at,
        stock: stockLeft,
        item: { key: item.key, name: item.name, kind: item.kind, amount: item.amount, tier: item.tier },
      });
    }

    if (action === 'redeem_history') {
      const { data: rows, error } = await db
        .from('redeem_orders')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ ok: true, orders: rows });
    }

    if (action === 'ad_event') {
      const slot = String(body.slot ?? '').trim().slice(0, 24);
      const event = String(body.event ?? '').trim().slice(0, 24);
      if (!slot || !event) return json({ ok: false, error: 'missing_field' }, 400);
      const placementId = String(body.placementId ?? '').trim().slice(0, 40);
      const revenueRaw = Number(body.revenue);
      const revenue = Number.isFinite(revenueRaw) && revenueRaw > 0 ? Math.min(revenueRaw, 9999) : 0;
      const extra = body.extra && typeof body.extra === 'object' ? body.extra : null;

      const { error } = await db.from('ad_events').insert({
        slot,
        event,
        placement_id: placementId || null,
        revenue,
        device_id: deviceId,
        extra,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'admin_login') {
      if (!isAdmin(body)) return json({ ok: false, error: 'bad_credentials' }, 401);
      return json({ ok: true });
    }

    if (action === 'admin_stats' || action === 'admin_export') {
      if (!isAdmin(body)) return json({ ok: false, error: 'bad_credentials' }, 401);
      const { data: players, error: pErr } = await db
        .from('players')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (pErr) throw pErr;
      const { data: events, error: eErr } = await db
        .from('game_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (eErr) throw eErr;

      const totals = {
        players: players.length,
        beans: 0,
        chances: 0,
        shuffle: 0,
        adCount: 0,
        spins: 0,
        signs: 0,
      };
      const prizeCounts: Record<string, number> = {};
      for (const p of players) {
        totals.beans += Number(p.beans ?? 0);
        totals.chances += Number(p.chances ?? 0);
        totals.shuffle += Number(p.shuffle ?? 0);
        totals.adCount += Number(p.ad_count ?? 0);
        const stats = plainObject(p.stats);
        totals.spins += Number(stats.spins ?? 0);
        const sign = plainObject(p.sign);
        totals.signs += Number(sign.total ?? 0);
        for (const [key, value] of Object.entries(plainObject(p.prizes))) {
          prizeCounts[key] = (prizeCounts[key] ?? 0) + Number(value ?? 0);
        }
      }

      if (action === 'admin_export') {
        return json({ ok: true, totals, prizeCounts, players, events, exportedAt: new Date().toISOString() });
      }

      const signLogs: { deviceId: string; date: string; bean: number; chance: number }[] = [];
      for (const p of players) {
        const sign = plainObject(p.sign);
        const log = Array.isArray(sign.log) ? sign.log : [];
        for (const entry of log.slice(-10)) {
          const e = plainObject(entry);
          signLogs.push({
            deviceId: String(p.device_id ?? '').slice(-6),
            date: String(e.d ?? ''),
            bean: Number(e.bean ?? 0),
            chance: Number(e.chance ?? 0),
          });
        }
      }
      signLogs.sort((a, b) => (a.date < b.date ? 1 : -1));

      return json({
        ok: true,
        config: await readConfig(),
        totals,
        prizeCounts,
        players: players.slice(0, 30).map((p) => ({
          deviceId: String(p.device_id ?? '').slice(-6),
          beans: Number(p.beans ?? 0),
          chances: Number(p.chances ?? 0),
          shuffle: Number(p.shuffle ?? 0),
          adCount: Number(p.ad_count ?? 0),
          signs: Number(plainObject(p.sign).total ?? 0),
          streak: Number(plainObject(p.sign).streak ?? 0),
          updatedAt: p.updated_at,
        })),
        signLogs: signLogs.slice(0, 40),
        events: events.slice(0, 40).map((e) => ({
          kind: e.kind,
          payload: e.payload,
          createdAt: e.created_at,
        })),
      });
    }

    if (action === 'admin_config') {
      if (!isAdmin(body)) return json({ ok: false, error: 'bad_credentials' }, 401);
      const cfg = plainObject(body.config);
      const weights = Array.isArray(cfg.weights)
        ? cfg.weights.slice(0, 12).map((v) => clampInt(v, 0, 999))
        : [24, 22, 14, 14, 10, 10, 6];
      const costs = Array.isArray(cfg.costs)
        ? cfg.costs.slice(0, 4).map((v) => clampInt(v, 0, 9999))
        : [30, 70, 50, 115];
      if (weights.reduce((a, b) => a + b, 0) <= 0) {
        return json({ ok: false, error: 'zero_weights' }, 400);
      }
      const { data, error } = await db
        .from('game_config')
        .update({
          win_chance: clampInt(cfg.winChance, 0, 10),
          weights,
          costs,
        })
        .eq('id', 1)
        .select()
        .single();
      if (error) throw error;
      return json({ ok: true, config: shapeConfig(data as Record<string, unknown>) });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('game-sync failed', action, err instanceof Error ? err.message : String(err));
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
