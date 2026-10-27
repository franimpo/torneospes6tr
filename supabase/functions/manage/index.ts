import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const str = (v: unknown, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v) ? v : NaN;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function fixture(ids: string[], doubleRound: boolean) {
  const slot: (string | null)[] = [...ids];
  if (slot.length % 2) slot.push(null);
  const rounds: { round_number: number; home_id: string; away_id: string }[] = [];
  const count = slot.length;
  for (let round = 0; round < count - 1; round++) {
    for (let i = 0; i < count / 2; i++) {
      let home = slot[i], away = slot[count - i - 1];
      if (!home || !away) continue;
      if ((round + i) % 2 === 1) [home, away] = [away, home];
      rounds.push({ round_number: round + 1, home_id: home, away_id: away });
    }
    slot.splice(1, 0, slot.pop()!);
  }
  if (doubleRound) {
    const first = [...rounds];
    for (const r of first) rounds.push({ round_number: r.round_number + count - 1, home_id: r.away_id, away_id: r.home_id });
  }
  return rounds;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return fail('Método no permitido', 405);
  const secret = Deno.env.get('EDIT_PASSWORD');
  if (!secret) return fail('Falta configurar EDIT_PASSWORD en Supabase', 503);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail('Solicitud JSON inválida'); }
  if (typeof body.password !== 'string' || body.password !== secret) return fail('Clave incorrecta', 401);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return fail('Configuración de Supabase incompleta', 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const action = body.action;
  const data = (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) ? body.data as Record<string, unknown> : {};

  try {
    if (action === 'verify') return json({ ok: true });

    if (action === 'createTournament') {
      const name = str(data.name), season = str(data.season, 80), max = int(data.max_participants);
      const format = data.format === 'double' ? 'double' : 'single';
      if (!name || !(max >= 2 && max <= 64)) return fail('Ingresá nombre y cantidad de participantes (2 a 64)');
      const { data: item, error } = await db.from('tournaments').insert({ name, season, max_participants: max, format }).select().single();
      if (error) throw error;
      return json({ item });
    }

    if (!uuid(data.tournament_id)) return fail('Torneo inválido');
    const tournament_id = data.tournament_id as string;
    const { data: tournament, error: te } = await db.from('tournaments').select('*').eq('id', tournament_id).single();
    if (te || !tournament) return fail('No se encontró el torneo', 404);

    if (action === 'updateTournament') {
      const patch: Record<string, unknown> = {};
      if ('name' in data) { if (!str(data.name)) return fail('Nombre obligatorio'); patch.name = str(data.name); }
      if ('season' in data) patch.season = str(data.season, 80);
      if ('status' in data) { if (!['active','finished'].includes(String(data.status))) return fail('Estado inválido'); patch.status = data.status; }
      if (!Object.keys(patch).length) return fail('Sin cambios');
      const { error } = await db.from('tournaments').update(patch).eq('id', tournament_id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'deleteTournament') {
      const { error } = await db.from('tournaments').delete().eq('id', tournament_id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'addParticipant') {
      const player_name = str(data.player_name,80), team_name = str(data.team_name,80);
      if (!player_name || !team_name) return fail('Completá nombre del participante y equipo');
      const [{ count, error: ce }, { count: matchCount, error: me }] = await Promise.all([
        db.from('participants').select('*', { count:'exact', head:true }).eq('tournament_id',tournament_id),
        db.from('matches').select('*', { count:'exact', head:true }).eq('tournament_id',tournament_id),
      ]);
      if (ce || me) throw ce || me;
      if ((matchCount || 0) > 0) return fail('No se pueden agregar participantes después de generar el fixture');
      if ((count || 0) >= tournament.max_participants) return fail('Se alcanzó el cupo del torneo');
      const { error } = await db.from('participants').insert({ tournament_id, player_name, team_name });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'updateParticipant' || action === 'deleteParticipant') {
      if (!uuid(data.participant_id)) return fail('Participante inválido');
      const { data: participant } = await db.from('participants').select('id').eq('id',data.participant_id).eq('tournament_id',tournament_id).maybeSingle();
      if (!participant) return fail('Participante no encontrado');
      if (action === 'deleteParticipant') {
        const { count, error: ce } = await db.from('matches').select('*',{count:'exact',head:true}).eq('tournament_id',tournament_id);
        if (ce) throw ce;
        if ((count || 0) > 0) return fail('No se puede eliminar un participante con fixture generado');
        const { error } = await db.from('participants').delete().eq('id',data.participant_id).eq('tournament_id',tournament_id);
        if (error) throw error;
      } else {
        const player_name = str(data.player_name,80), team_name = str(data.team_name,80);
        if (!player_name || !team_name) return fail('Completá ambos nombres');
        const { error } = await db.from('participants').update({player_name,team_name}).eq('id',data.participant_id).eq('tournament_id',tournament_id);
        if (error) throw error;
      }
      return json({ ok:true });
    }
    if (action === 'generateFixture') {
      const { data: players, error: pe } = await db.from('participants').select('id').eq('tournament_id',tournament_id).order('created_at');
      if (pe) throw pe;
      if (players.length !== tournament.max_participants) return fail(`Faltan participantes: ${players.length}/${tournament.max_participants}`);
      const { count, error: me } = await db.from('matches').select('*',{count:'exact',head:true}).eq('tournament_id',tournament_id);
      if (me) throw me;
      if (count) return fail('Ya existe un fixture para este torneo');
      const rows = fixture(players.map(p => p.id), tournament.format === 'double').map(r=>({...r,tournament_id}));
      // Toda la serie se carga en una sola operación, con un cupo máximo de 64 participantes.
      const { error } = await db.from('matches').insert(rows);
      if (error) throw error;
      return json({ ok:true, matches:rows.length });
    }
    if (action === 'setResult') {
      if (!uuid(data.match_id)) return fail('Partido inválido');
      const h = data.home_score, a = data.away_score;
      const clear = h === null && a === null;
      if (!clear && !(Number.isInteger(h) && Number.isInteger(a) && (h as number) >= 0 && (h as number) <= 99 && (a as number) >= 0 && (a as number) <= 99)) return fail('Los goles deben ser enteros entre 0 y 99');
      const { data: match, error } = await db.from('matches').update({home_score:h,away_score:a}).eq('id',data.match_id).eq('tournament_id',tournament_id).select('id').maybeSingle();
      if (error) throw error;
      if (!match) return fail('Partido no encontrado',404);
      return json({ ok:true });
    }
    return fail('Acción no reconocida',404);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Error al guardar cambios';
    return fail(message.includes('participants_tournament_id_player_name_key') ? 'Ese participante ya está cargado' : message, 400);
  }
});
