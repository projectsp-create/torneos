// Capa de datos: Supabase en producción, o almacenamiento local en MODO DEMO.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=20261111c";

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
let sb = null;

export async function client() {
  if (DEMO) return null;
  if (!sb) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } });
  }
  return sb;
}

// ------------------------------------------------------------- modo demo
const KEY = "torneos_demo_v1";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function demoLoad() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch {}
  return { tournaments: [], teams: [], team_private: [], players: [], matches: [], session: null };
}
function demoSave(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
let demo = null;
const D = () => (demo ||= demoLoad());

function check(res) { if (res.error) throw new Error(res.error.message); return res.data; }

// ------------------------------------------------------------- lectura pública
export async function listTournaments() {
  if (DEMO) return [...D().tournaments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const c = await client();
  return check(await c.from("tournaments").select("*").order("created_at", { ascending: false }));
}
export async function getTournament(slug) {
  if (DEMO) return D().tournaments.find(t => t.slug === slug) || null;
  const c = await client();
  return check(await c.from("tournaments").select("*").eq("slug", slug).maybeSingle());
}
export async function getTeams(tid) {
  if (DEMO) return D().teams.filter(t => t.tournament_id === tid);
  const c = await client();
  return check(await c.from("teams").select("*").eq("tournament_id", tid).order("sort_order"));
}
export async function getMatches(tid) {
  if (DEMO) return D().matches.filter(m => m.tournament_id === tid).sort((a, b) => a.sort_order - b.sort_order);
  const c = await client();
  return check(await c.from("matches").select("*").eq("tournament_id", tid).order("sort_order"));
}

// ------------------------------------------------------------- autenticación
export async function signIn(email, password) {
  if (DEMO) { D().session = { email }; demoSave(D()); return true; }
  const c = await client();
  check(await c.auth.signInWithPassword({ email, password }));
  return true;
}
export async function signOut() {
  if (DEMO) { D().session = null; demoSave(D()); return; }
  const c = await client(); await c.auth.signOut();
}
export async function currentUser() {
  if (DEMO) return D().session;
  const c = await client();
  const { data } = await c.auth.getSession();
  return data.session ? { email: data.session.user.email } : null;
}
export async function isAdmin() {
  if (DEMO) return !!D().session;
  const c = await client();
  const { data, error } = await c.from("admins").select("email").limit(1);
  return !error && data && data.length > 0;
}

// ------------------------------------------------------------- escritura genérica
async function insert(table, rows) {
  rows = Array.isArray(rows) ? rows : [rows];
  if (DEMO) {
    const now = new Date().toISOString();
    const out = rows.map(r => ({ id: uid(), created_at: now, updated_at: now, ...r }));
    D()[table].push(...out); demoSave(D()); return out;
  }
  const c = await client();
  return check(await c.from(table).insert(rows).select());
}
async function update(table, id, patch, key = "id") {
  if (DEMO) {
    const r = D()[table].find(x => x[key] === id);
    if (r) Object.assign(r, patch, { updated_at: new Date().toISOString() });
    demoSave(D()); return r;
  }
  const c = await client();
  return check(await c.from(table).update(patch).eq(key, id).select().maybeSingle());
}
async function remove(table, field, value) {
  if (DEMO) { D()[table] = D()[table].filter(x => x[field] !== value); demoSave(D()); return; }
  const c = await client();
  check(await c.from(table).delete().eq(field, value));
}

// ------------------------------------------------------------- torneos
export const createTournament = t => insert("tournaments", t).then(r => r[0]);
export const updateTournament = (id, p) => update("tournaments", id, p);
export async function deleteTournament(id) {
  if (DEMO) {
    const teamIds = D().teams.filter(t => t.tournament_id === id).map(t => t.id);
    D().players = D().players.filter(p => !teamIds.includes(p.team_id));
    D().team_private = D().team_private.filter(p => !teamIds.includes(p.team_id));
    D().teams = D().teams.filter(t => t.tournament_id !== id);
    D().matches = D().matches.filter(m => m.tournament_id !== id);
  }
  return remove("tournaments", "id", id);
}

// ------------------------------------------------------------- equipos
export const createTeams = rows => insert("teams", rows);
export const updateTeam = (id, p) => update("teams", id, p);
export async function deleteTeam(id) {
  if (DEMO) {
    D().players = D().players.filter(p => p.team_id !== id);
    D().team_private = D().team_private.filter(p => p.team_id !== id);
  }
  return remove("teams", "id", id);
}
export async function getPrivate(teamIds) {
  if (!teamIds.length) return [];
  if (DEMO) return D().team_private.filter(p => teamIds.includes(p.team_id));
  const c = await client();
  return check(await c.from("team_private").select("*").in("team_id", teamIds));
}
export async function savePrivate(row) {
  if (DEMO) {
    const r = D().team_private.find(x => x.team_id === row.team_id);
    if (r) Object.assign(r, row); else D().team_private.push({ ...row });
    demoSave(D()); return;
  }
  const c = await client();
  check(await c.from("team_private").upsert(row));
}

// ------------------------------------------------------------- jugadores
export async function getPlayers(teamIds) {
  if (!teamIds.length) return [];
  if (DEMO) return D().players.filter(p => teamIds.includes(p.team_id));
  const c = await client();
  return check(await c.from("players").select("*").in("team_id", teamIds).order("created_at"));
}
export const createPlayer = p => insert("players", p).then(r => r[0]);
export const updatePlayer = (id, p) => update("players", id, p);
export const deletePlayer = id => remove("players", "id", id);

// ------------------------------------------------------------- partidos
export const createMatches = rows => rows.length ? insert("matches", rows) : [];
export const updateMatch = (id, p) => update("matches", id, p);
export const deleteMatch = id => remove("matches", "id", id);
export async function deleteMatchesByPhase(tid, phases) {
  if (DEMO) {
    D().matches = D().matches.filter(m => !(m.tournament_id === tid && phases.includes(m.phase)));
    demoSave(D()); return;
  }
  const c = await client();
  check(await c.from("matches").delete().eq("tournament_id", tid).in("phase", phases));
}

// Suscripción en vivo (solo con Supabase). Devuelve función para cancelar.
export async function subscribeMatches(tid, cb) {
  if (DEMO) {
    const h = e => { if (e.key === KEY) { demo = null; cb(); } };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }
  const c = await client();
  const ch = c.channel(`m-${tid}`).on("postgres_changes",
    { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tid}` }, () => cb()).subscribe();
  return () => c.removeChannel(ch);
}

export function reloadDemo() { demo = null; }
export function demoReset() { localStorage.removeItem(KEY); demo = null; }
export function demoHasData() { return DEMO && D().tournaments.length > 0; }
