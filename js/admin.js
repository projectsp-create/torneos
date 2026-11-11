import { SITE_NAME, TZ_OFFSET } from "./config.js?v=20261111c";
import * as db from "./data.js?v=20261111c";
import {
  cfg, DEFAULT_CONFIG, standings, qualifiers, generalTable, byeTeams, resolveTeams, isDone, groupsComplete, setsWon,
  validateSets, generateGroupFixture, generateKnockout, toLocalISO, slugify, PHASE_LABEL, KO_PHASES, winnerSide,
} from "./logic.js?v=20261111c";
import { esc, fmtDay, fmtTime, money, STATUS_LABEL, bracketView, standingsTable, generalTableHTML, toast, teamName } from "./ui.js?v=20261111c";
import { seedDemoIfEmpty } from "./demo.js?v=20261111c";

const app = document.getElementById("app");
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const S = { user: null, tournaments: [], T: null, teams: [], priv: {}, players: [], matches: [], tab: "partidos", mfilter: "pendientes", gfilter: "", playerTeam: "" };
let unsub = null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const toLocalInput = iso => iso ? toLocalISO(new Date(iso), TZ_OFFSET).slice(0, 16) : "";
const fromLocalInput = v => v ? `${v}:00${TZ_OFFSET}` : null;
const publicURL = t => new URL(`torneo.html?t=${encodeURIComponent(t.slug)}`, location.href).href;
const byId = () => Object.fromEntries(S.teams.map(t => [t.id, t]));

async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast("Error: " + (e.message || e), "err"); throw e; }
}

// ================================================================ arranque
async function boot() {
  document.title = `Organizador · ${SITE_NAME}`;
  if (db.DEMO) { await seedDemoIfEmpty(); document.body.insertAdjacentHTML("beforeend", `<div class="demo-flag">MODO DEMO · sin base de datos</div>`); }
  S.user = await db.currentUser();
  if (!S.user) return renderLogin();
  if (!(await db.isAdmin())) {
    app.innerHTML = `<div class="card login form"><h2>Sin permiso</h2><p>El correo <b>${esc(S.user.email)}</b> no está autorizado como organizador.</p><button class="btn" id="out">Salir</button></div>`;
    $("#out").onclick = async () => { await db.signOut(); location.reload(); };
    return;
  }
  await loadTournaments();
  const last = localStorage.getItem("adm_t");
  const pick = S.tournaments.find(t => t.id === last) || S.tournaments[0];
  if (pick) await selectTournament(pick.id); else render();
}

function renderLogin() {
  app.innerHTML = `<div class="hero" style="padding-bottom:40px"><div class="wrap"><span class="brand"><span class="brand-dot"></span>${esc(SITE_NAME)}</span><h1>Panel del organizador</h1></div></div>
  <div class="wrap"><form class="card login form" id="lf">
    <h2 style="font-size:24px">Ingresar</h2>
    <label class="f">Correo<input class="i" type="email" name="email" required autocomplete="username"></label>
    <label class="f">Contraseña<input class="i" type="password" name="pw" required autocomplete="current-password" ${db.DEMO ? 'placeholder="(en demo cualquiera)"' : ""}></label>
    <button class="btn primary" type="submit">Entrar</button>
    <a class="note" href="./">← Ver torneos públicos</a>
  </form></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await db.signIn(f.get("email").trim(), f.get("pw")); location.reload(); }
    catch (err) { toast("No se pudo ingresar: revisa correo y contraseña", "err"); }
  };
}

async function loadTournaments() { S.tournaments = await db.listTournaments(); }

async function selectTournament(id) {
  S.T = S.tournaments.find(t => t.id === id) || null;
  localStorage.setItem("adm_t", id || "");
  if (unsub) { unsub(); unsub = null; }
  await reload();
  if (S.T) unsub = await db.subscribeMatches(S.T.id, async () => { S.matches = await db.getMatches(S.T.id); if (S.tab === "partidos" && !document.activeElement?.closest(".medit")) render(); });
}

async function reload() {
  if (!S.T) { render(); return; }
  S.teams = await db.getTeams(S.T.id);
  const ids = S.teams.map(t => t.id);
  const [priv, players, matches] = await Promise.all([db.getPrivate(ids), db.getPlayers(ids), db.getMatches(S.T.id)]);
  S.priv = Object.fromEntries(priv.map(p => [p.team_id, p]));
  S.players = players; S.matches = matches;
  render();
}

// ================================================================ layout
const TABS = [["partidos", "Resultados"], ["programacion", "Programación"], ["equipos", "Equipos y pagos"], ["jugadores", "Jugadores"], ["llave", "Llave"], ["torneo", "Configuración"], ["compartir", "Compartir"]];

function render() {
  const opts = S.tournaments.map(t => `<option value="${t.id}" ${S.T?.id === t.id ? "selected" : ""}>${esc(t.name)} — ${esc(STATUS_LABEL[t.status])}</option>`).join("");
  app.innerHTML = `
  <div class="admin-bar"><div class="wrap">
    <span class="brand"><span class="brand-dot"></span></span>
    <select id="tsel" aria-label="Torneo">${opts || `<option>Sin torneos</option>`}</select>
    <button class="btn sm ghost-light" id="newT">+ Nuevo torneo</button>
    ${S.T ? `<a class="btn sm ghost-light" href="${esc(publicURL(S.T))}" target="_blank">Ver público ↗</a>` : ""}
    <button class="btn sm ghost-light" id="logout">Salir</button>
  </div></div>
  <div class="wrap">
    ${S.T ? `<nav class="atabs">${TABS.map(([k, l]) => `<button class="atab" data-k="${k}" aria-selected="${S.tab === k}">${l}</button>`).join("")}</nav>
    <div id="pane"></div>` : `<div class="card empty" style="margin-top:20px">Crea tu primer torneo con <b>+ Nuevo torneo</b>.</div>`}
  </div>`;
  $("#tsel").onchange = e => selectTournament(e.target.value);
  $("#newT").onclick = newTournamentModal;
  $("#logout").onclick = async () => { await db.signOut(); location.reload(); };
  $$(".atab").forEach(b => b.onclick = () => { S.tab = b.dataset.k; render(); });
  if (!S.T) return;
  const pane = $("#pane");
  ({ partidos: paneMatches, programacion: paneSchedule, equipos: paneTeams, jugadores: panePlayers, llave: paneBracket, torneo: paneConfig, compartir: paneShare })[S.tab](pane);
}

// ================================================================ nuevo torneo
function newTournamentModal() {
  const prev = S.T ? cfg(S.T) : DEFAULT_CONFIG;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="card modal form">
    <h2 style="font-size:24px">Nuevo torneo</h2>
    <label class="f">Nombre<input class="i" name="name" required placeholder="Ej: Torneo Relámpago Vóley Playa 2027"></label>
    <div class="row"><label class="f">Deporte<input class="i" name="sport" value="${esc(S.T?.sport || "Vóley playa")}"></label>
    <label class="f">Lugar<input class="i" name="location" value="${esc(S.T?.location || "Tesalia, Huila")}"></label></div>
    ${S.T ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="copy" checked> Copiar la configuración de "${esc(S.T.name)}" (formato, puntos, horarios, reglamento)</label>` : ""}
    <p class="note">Se crea como <b>Borrador</b> (no se ve en público hasta que cambies el estado).</p>
    <div class="actions"><button class="btn primary" type="submit">Crear</button><button class="btn" type="button" id="cx">Cancelar</button></div>
  </form>`;
  document.body.appendChild(bg);
  $("#cx", bg).onclick = () => bg.remove();
  $("form", bg).onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    let slug = slugify(f.get("name"));
    if (S.tournaments.some(t => t.slug === slug)) slug += "-" + Date.now().toString(36).slice(-4);
    const config = f.get("copy") ? { ...prev, days: prev.days.map(d => ({ ...d, date: "" })) } : { ...DEFAULT_CONFIG };
    const t = await guard(() => db.createTournament({ slug, name: f.get("name").trim(), sport: f.get("sport"), location: f.get("location"), status: "borrador", config }), "Torneo creado");
    bg.remove();
    await loadTournaments(); S.tab = "torneo"; await selectTournament(t.id);
  };
}

// ================================================================ RESULTADOS
function paneMatches(pane) {
  const c = cfg(S.T), teams = byId();
  const resolved = resolveTeams(S.matches, c);
  if (!resolved.length) { pane.innerHTML = `<div class="card empty">Aún no hay partidos. Ve a <b>Programación</b> para generar el fixture.</div>`; return; }
  const counts = { pendientes: resolved.filter(m => !isDone(m)).length, finalizados: resolved.filter(isDone).length };
  let list = S.mfilter === "pendientes" ? resolved.filter(m => !isDone(m)) : S.mfilter === "finalizados" ? resolved.filter(isDone) : resolved;
  if (S.gfilter) list = list.filter(m => S.gfilter === "KO" ? m.phase !== "grupos" : m.group_label === S.gfilter);
  list.sort((a, b) => (b.status === "en_juego") - (a.status === "en_juego") || (a.scheduled_at || "z").localeCompare(b.scheduled_at || "z") || a.sort_order - b.sort_order);
  const groups = [...new Set(S.matches.filter(m => m.group_label).map(m => m.group_label))].sort();
  pane.innerHTML = `
  <div class="actions" style="margin-bottom:10px">
    ${[["pendientes", `Pendientes (${counts.pendientes})`], ["finalizados", `Finalizados (${counts.finalizados})`], ["todos", "Todos"]].map(([k, l]) => `<button class="pill" data-mf="${k}" aria-pressed="${S.mfilter === k}">${l}</button>`).join("")}
    <select class="i" id="gf" style="width:auto"><option value="">Todos los grupos</option>${groups.map(g => `<option ${S.gfilter === g ? "selected" : ""}>${g}</option>`).join("")}<option value="KO" ${S.gfilter === "KO" ? "selected" : ""}>Eliminatorias</option></select>
  </div>
  <p class="note" style="margin:0 0 10px">Escribe el marcador de cada set. <b>En vivo</b> publica el marcador parcial; <b>Finalizar</b> cierra el partido y actualiza la tabla.</p>
  <div class="grid two">${list.map(m => matchEditor(m, teams, c)).join("") || `<div class="card empty">Nada por aquí.</div>`}</div>`;
  $$("[data-mf]", pane).forEach(b => b.onclick = () => { S.mfilter = b.dataset.mf; render(); });
  $("#gf", pane).onchange = e => { S.gfilter = e.target.value; render(); };
  $$(".medit", pane).forEach(el => wireEditor(el, c));
}

function matchEditor(m, teams, c) {
  const H = teamName(teams, m._home, m.home_source), A = teamName(teams, m._away, m.away_source);
  const ready = !H.tbd && !A.tbd;
  const n = c.bestOf;
  const val = (i, s) => m.sets?.[i]?.[s] ?? "";
  const inputs = side => `<div class="setin">${Array.from({ length: n }, (_, i) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-set="${i}" data-side="${side}" value="${val(i, side)}" ${ready ? "" : "disabled"} aria-label="Set ${i + 1}">`).join("")}</div>`;
  const label = m.phase === "grupos" ? `Grupo ${esc(m.group_label)}` : esc(PHASE_LABEL[m.phase]);
  const done = isDone(m);
  return `<article class="card medit ${done ? "done" : ""} ${m.status === "en_juego" ? "is-live match" : ""}" data-id="${m.id}" data-phase="${m.phase}">
    <div class="match-head"><span><span class="tag">${esc(m.code || "")} · ${label}</span> ${esc(m.court || "")} · ${esc(fmtDay(m.scheduled_at).split(",")[0])} ${esc(fmtTime(m.scheduled_at))}</span>
      ${m.status === "en_juego" ? `<span class="live-badge">EN VIVO</span>` : done ? `<span class="ok-txt">${m.status === "wo" ? "W.O." : "FINAL"}</span>` : ""}</div>
    <div class="teams">
      <span></span><div class="set-hdr">${Array.from({ length: n }, (_, i) => `<span>Set ${i + 1}</span>`).join("")}</div>
      <span class="tn ${H.tbd ? "tbd" : ""}">${esc(H.name)}</span>${inputs(0)}
      <span class="tn ${A.tbd ? "tbd" : ""}">${esc(A.name)}</span>${inputs(1)}
    </div>
    <div class="msg-warn" data-msg></div>
    <div class="actions">
      ${ready ? `<button class="btn sm live" data-act="live">● En vivo</button>
      <button class="btn sm primary" data-act="final">✔ Finalizar</button>
      <button class="btn sm" data-act="wo">W.O.</button>
      ${done || m.status === "en_juego" ? `<button class="btn sm danger" data-act="reset">Borrar resultado</button>` : ""}` : `<span class="note">Se habilita cuando se definan los equipos.</span>`}
    </div>
  </article>`;
}

function readSets(el) {
  const sets = [];
  $$("input[data-set]", el).forEach(inp => {
    const i = +inp.dataset.set, s = +inp.dataset.side;
    sets[i] ||= [null, null];
    sets[i][s] = inp.value === "" ? null : Number(inp.value);
  });
  while (sets.length && sets[sets.length - 1].every(v => v == null)) sets.pop();
  return sets.map(s => [s[0] ?? 0, s[1] ?? 0]);
}

function wireEditor(el, c) {
  const id = el.dataset.id, phase = el.dataset.phase;
  const m = S.matches.find(x => x.id === id);
  const msg = $("[data-msg]", el);
  $$("input", el).forEach(inp => inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "");
    const sets = readSets(el);
    msg.textContent = sets.length ? validateSets(sets, c, phase) : "";
  }));
  const save = async patch => {
    await guard(() => db.updateMatch(id, patch), "Guardado ✔");
    Object.assign(m, patch);
    render();
  };
  $$("[data-act]", el).forEach(b => b.onclick = async () => {
    const act = b.dataset.act;
    if (act === "live") return save({ sets: readSets(el), status: "en_juego" });
    if (act === "final") {
      const sets = readSets(el);
      const w = validateSets(sets, c, phase);
      const { h, a } = setsWon(sets);
      if (h === a) return toast("No hay ganador: revisa los sets", "err");
      if (w && !confirm(`Ojo: ${w}\n\n¿Guardar de todas formas?`)) return;
      return save({ sets, status: "finalizado" });
    }
    if (act === "reset") { if (confirm("¿Borrar el resultado de este partido?")) return save({ sets: [], status: "pendiente" }); return; }
    if (act === "wo") return woModal(m, c, save);
  });
}

function woModal(m, c, save) {
  const teams = byId();
  const r = resolveTeams(S.matches, c).find(x => x.id === m.id);
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal form"><h2 style="font-size:22px">W.O. — ¿quién gana?</h2>
    <p class="note">Se registra ${Math.ceil(c.bestOf / 2)}-0 con sets ${m.phase === "grupos" ? c.groupSetPoints : c.koSetPoints}-0.</p>
    <div class="actions"><button class="btn primary" data-w="0">${esc(teams[r._home]?.name)}</button><button class="btn primary" data-w="1">${esc(teams[r._away]?.name)}</button><button class="btn" data-w="x">Cancelar</button></div></div>`;
  document.body.appendChild(bg);
  $$("[data-w]", bg).forEach(b => b.onclick = () => {
    bg.remove();
    if (b.dataset.w === "x") return;
    const p = m.phase === "grupos" ? c.groupSetPoints : c.koSetPoints;
    const sets = Array.from({ length: Math.ceil(c.bestOf / 2) }, () => b.dataset.w === "0" ? [p, 0] : [0, p]);
    save({ sets, status: "wo" });
  });
}

// ================================================================ PROGRAMACIÓN
function paneSchedule(pane) {
  const c = cfg(S.T), teams = byId();
  const gm = S.matches.filter(m => m.phase === "grupos");
  const played = gm.filter(isDone).length;
  const noTime = S.matches.filter(m => !m.scheduled_at).length;
  const lastG = gm.map(m => m.scheduled_at).filter(Boolean).sort().pop();
  const missingDates = c.days.some(d => !d.date);
  const resolved = resolveTeams(S.matches, c);
  const teamOpts = sel => `<option value="">—</option>` + S.teams.map(t => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  pane.innerHTML = `
  <div class="card form">
    <h3>Fase de grupos</h3>
    ${missingDates ? `<div class="banner">Primero pon las fechas de los días en <b>Configuración</b>.</div>` : ""}
    <p class="note">Crea todos los cruces (todos contra todos en cada grupo) con día, hora y cancha según la Configuración. Evita que un equipo juegue dos turnos seguidos.</p>
    <div class="actions"><button class="btn primary" id="gen" ${missingDates ? "disabled" : ""}>${gm.length ? "Volver a generar fase de grupos" : "Generar fase de grupos"}</button>
    ${gm.length ? `<span class="note">${gm.length} partidos · ${played} jugados${lastG ? ` · terminan aprox. ${esc(fmtDay(lastG))} ${esc(fmtTime(new Date(new Date(lastG).getTime() + c.groupMatchMin * 60000).toISOString()))}` : ""}</span>` : ""}</div>
    ${noTime ? `<div class="banner">⚠ ${noTime} partidos sin horario: no alcanzan los turnos configurados. Amplía el horario, agrega canchas o reduce la duración.</div>` : ""}
  </div>
  <div class="section-title"><h2>Todos los partidos</h2><span class="sub">Puedes cambiar hora, cancha o equipos; se guarda al salir del campo</span></div>
  <div class="card table-wrap"><table class="adm"><thead><tr><th>Cód.</th><th>Fase</th><th>Fecha y hora</th><th>Cancha</th><th>Local</th><th>Visitante</th><th></th></tr></thead><tbody>
  ${resolved.map(m => `<tr data-id="${m.id}">
    <td><b>${esc(m.code || "")}</b></td>
    <td>${m.phase === "grupos" ? "Grupo " + esc(m.group_label) : esc(PHASE_LABEL[m.phase])}</td>
    <td><input class="i" type="datetime-local" data-f="scheduled_at" value="${toLocalInput(m.scheduled_at)}"></td>
    <td><select class="i" data-f="court">${c.courts.map(x => `<option ${x === m.court ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></td>
    <td>${m.home_source && !m.home_team_id ? `<span class="note">${esc(teams[m._home]?.name || m.home_source)}</span>` : `<select class="i" data-f="home_team_id">${teamOpts(m.home_team_id)}</select>`}</td>
    <td>${m.away_source && !m.away_team_id ? `<span class="note">${esc(teams[m._away]?.name || m.away_source)}</span>` : `<select class="i" data-f="away_team_id">${teamOpts(m.away_team_id)}</select>`}</td>
    <td>${isDone(m) ? `<span class="ok-txt">Jugado</span>` : `<button class="btn sm danger" data-del>✕</button>`}</td>
  </tr>`).join("") || `<tr><td colspan="7" class="empty">Sin partidos</td></tr>`}
  </tbody></table></div>`;

  $("#gen", pane).onclick = async () => {
    const groups = {}; S.teams.forEach(t => t.group_label && ((groups[t.group_label] ||= []).push(t)));
    const bad = Object.entries(groups).filter(([, l]) => l.length < 2);
    if (!Object.keys(groups).length) return toast("Asigna grupos a los equipos primero", "err");
    if (bad.length) return toast(`El grupo ${bad[0][0]} tiene menos de 2 equipos`, "err");
    if (gm.length && !confirm(`Se borrarán los ${gm.length} partidos de grupos${played ? ` (¡incluye ${played} con resultado!)` : ""} y las eliminatorias. ¿Continuar?`)) return;
    await guard(async () => {
      await db.deleteMatchesByPhase(S.T.id, ["grupos", ...KO_PHASES]);
      const fx = generateGroupFixture(S.teams, c, TZ_OFFSET).map(m => ({ ...m, tournament_id: S.T.id }));
      await db.createMatches(fx);
    }, "Fixture generado");
    await reload();
  };
  $$("tr[data-id]", pane).forEach(tr => {
    const id = tr.dataset.id;
    $$("[data-f]", tr).forEach(inp => inp.onchange = async () => {
      const f = inp.dataset.f;
      const v = f === "scheduled_at" ? fromLocalInput(inp.value) : (inp.value || null);
      await guard(() => db.updateMatch(id, { [f]: v }), "Guardado");
      Object.assign(S.matches.find(m => m.id === id), { [f]: v });
    });
    const del = $("[data-del]", tr);
    if (del) del.onclick = async () => { if (!confirm("¿Eliminar este partido?")) return; await guard(() => db.deleteMatch(id), "Eliminado"); await reload(); };
  });
}

// ================================================================ EQUIPOS
function paneTeams(pane) {
  const c = cfg(S.T);
  const pc = id => S.players.filter(p => p.team_id === id);
  const paid = S.teams.reduce((s, t) => s + Number(S.priv[t.id]?.amount_paid || 0), 0);
  const expected = S.teams.length * c.fee;
  const fullPaid = S.teams.filter(t => Number(S.priv[t.id]?.amount_paid || 0) >= c.fee).length;
  const usedGroups = Math.max(1, ...S.teams.map(t => GROUPS.indexOf(t.group_label) + 1), 4);
  pane.innerHTML = `
  <div class="stats">
    <div class="card stat"><div class="v">${S.teams.length}</div><div class="l">Equipos</div></div>
    <div class="card stat"><div class="v">${fullPaid}/${S.teams.length}</div><div class="l">Pagos completos</div></div>
    <div class="card stat"><div class="v">${money(paid)}</div><div class="l">Recaudado de ${money(expected)}</div></div>
    <div class="card stat"><div class="v">${money(expected - paid)}</div><div class="l">Pendiente por cobrar</div></div>
  </div>
  <div class="card table-wrap"><table class="adm"><thead><tr><th>Equipo</th><th>Grupo</th><th>Abonado</th><th>Medio</th><th>Jugadores</th><th>Estado</th><th></th></tr></thead><tbody>
  ${S.teams.map(t => {
    const ps = pc(t.id), H = ps.filter(p => p.sex === "H").length, M = ps.filter(p => p.sex === "M").length;
    const amt = Number(S.priv[t.id]?.amount_paid || 0);
    const warns = [];
    if (!t.group_label) warns.push("sin grupo");
    if (ps.length < c.playersPerTeam) warns.push(`${ps.length}/${c.playersPerTeam} jug.`);
    if (ps.length && !H) warns.push("sin hombre");
    if (ps.length && !M) warns.push("sin mujer");
    if (amt < c.fee) warns.push(amt ? "abono parcial" : "sin pago");
    return `<tr data-id="${t.id}">
      <td><input class="i" data-f="name" value="${esc(t.name)}" style="min-width:160px"></td>
      <td><select class="i" data-f="group_label"><option value="">—</option>${GROUPS.slice(0, Math.min(8, usedGroups + 1)).map(g => `<option ${t.group_label === g ? "selected" : ""}>${g}</option>`).join("")}</select></td>
      <td><input class="i" data-p="amount_paid" inputmode="numeric" value="${amt || ""}" placeholder="0" style="width:110px"></td>
      <td><select class="i" data-p="payment_method"><option value=""></option>${["Efectivo", "Nequi", "Daviplata", "Transferencia"].map(x => `<option ${S.priv[t.id]?.payment_method === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td>${ps.length} <span class="note">(${H}H/${M}M)</span></td>
      <td>${warns.length ? `<span class="warn-txt">${warns.join(" · ")}</span>` : `<span class="ok-txt">✔ OK</span>`}</td>
      <td><button class="btn sm danger" data-del>✕</button></td></tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">Sin equipos todavía</td></tr>`}
  </tbody></table></div>
  <div class="grid two" style="margin-top:14px">
    <form class="card form" id="addOne"><h3>Agregar equipo</h3>
      <div class="row"><label class="f">Nombre<input class="i" name="name" required></label>
      <label class="f">Grupo<select class="i" name="g"><option value="">—</option>${GROUPS.map(g => `<option>${g}</option>`).join("")}</select></label></div>
      <button class="btn primary">Agregar</button></form>
    <form class="card form" id="addMany"><h3>Pegar lista</h3>
      <label class="f">Un equipo por línea: <code>Nombre;Grupo</code><textarea class="i" name="list" rows="4" placeholder="LOS CUMBES;C&#10;TINA VOLEY;C"></textarea></label>
      <button class="btn">Agregar todos</button></form>
  </div>
  <p class="note">Si cambias grupos o agregas equipos después de generar el fixture, vuelve a generarlo en Programación (antes de anotar resultados).</p>`;

  $$("tr[data-id]", pane).forEach(tr => {
    const id = tr.dataset.id;
    $$("[data-f]", tr).forEach(inp => inp.onchange = async () => {
      await guard(() => db.updateTeam(id, { [inp.dataset.f]: inp.value.trim() || null }), "Guardado");
      Object.assign(S.teams.find(t => t.id === id), { [inp.dataset.f]: inp.value.trim() || null });
    });
    $$("[data-p]", tr).forEach(inp => inp.onchange = async () => {
      const cur = { team_id: id, amount_paid: 0, ...(S.priv[id] || {}) };
      cur[inp.dataset.p] = inp.dataset.p === "amount_paid" ? Number(inp.value.replace(/\D/g, "")) || 0 : inp.value || null;
      if (inp.dataset.p === "amount_paid" && !cur.payment_date) cur.payment_date = new Date().toISOString().slice(0, 10);
      await guard(() => db.savePrivate(cur), "Pago guardado");
      S.priv[id] = cur; render();
    });
    $("[data-del]", tr).onclick = async () => {
      const t = S.teams.find(x => x.id === id);
      if (S.matches.some(m => m.home_team_id === id || m.away_team_id === id) && !confirm("Este equipo ya tiene partidos programados. Si lo borras, esos partidos quedan sin equipo. ¿Continuar?")) return;
      if (!confirm(`¿Eliminar ${t.name} y sus jugadores?`)) return;
      await guard(() => db.deleteTeam(id), "Eliminado"); await reload();
    };
  });
  const add = async rows => {
    const exist = new Set(S.teams.map(t => t.name.toUpperCase()));
    rows = rows.filter(r => r.name && !exist.has(r.name.toUpperCase()));
    if (!rows.length) return toast("Nada nuevo para agregar (¿nombres repetidos?)", "err");
    let n = S.teams.length;
    await guard(() => db.createTeams(rows.map(r => ({ tournament_id: S.T.id, name: r.name, group_label: r.g || null, sort_order: ++n }))), `${rows.length} equipo(s) agregado(s)`);
    await reload();
  };
  $("#addOne", pane).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); add([{ name: f.get("name").trim().toUpperCase(), g: f.get("g") }]); };
  $("#addMany", pane).onsubmit = e => {
    e.preventDefault();
    const rows = new FormData(e.target).get("list").split(/\n+/).map(l => l.split(/[;\t,]/)).map(([n, g]) => ({ name: (n || "").trim().toUpperCase(), g: (g || "").trim().toUpperCase().replace(/^GRUPO\s*/, "") || null }));
    add(rows);
  };
}

// ================================================================ JUGADORES
function panePlayers(pane) {
  const c = cfg(S.T);
  if (!S.teams.length) { pane.innerHTML = `<div class="card empty">Primero agrega equipos.</div>`; return; }
  if (!S.teams.some(t => t.id === S.playerTeam)) S.playerTeam = S.teams[0].id;
  const ps = S.players.filter(p => p.team_id === S.playerTeam);
  const H = ps.filter(p => p.sex === "H").length, M = ps.filter(p => p.sex === "M").length;
  const rows = [...ps, ...Array.from({ length: Math.max(0, c.playersPerTeam - ps.length) }, () => ({}))];
  pane.innerHTML = `
  <div class="card form">
    <label class="f">Equipo<select class="i" id="pt">${S.teams.map(t => { const n = S.players.filter(p => p.team_id === t.id).length; return `<option value="${t.id}" ${t.id === S.playerTeam ? "selected" : ""}>${esc(t.name)} (${n}/${c.playersPerTeam})</option>`; }).join("")}</select></label>
    <div>${ps.length && (!H || !M) ? `<span class="warn-txt">⚠ El equipo necesita al menos 1 hombre y 1 mujer para poder jugar.</span>` : ps.length ? `<span class="ok-txt">✔ ${H} hombre(s), ${M} mujer(es)</span>` : ""}</div>
  </div>
  <div class="card table-wrap" style="margin-top:12px"><table class="adm"><thead><tr><th>#</th><th>Nombre completo</th><th>Documento</th><th>Sexo</th><th>Celular</th><th>Cap.</th><th></th></tr></thead><tbody>
  ${rows.map((p, i) => `<tr data-id="${p.id || ""}">
    <td>${i + 1}</td>
    <td><input class="i" data-f="name" value="${esc(p.name || "")}" style="min-width:170px"></td>
    <td><input class="i" data-f="document" value="${esc(p.document || "")}" inputmode="numeric" style="width:120px"></td>
    <td><select class="i" data-f="sex"><option value=""></option><option ${p.sex === "H" ? "selected" : ""}>H</option><option ${p.sex === "M" ? "selected" : ""}>M</option></select></td>
    <td><input class="i" data-f="phone" value="${esc(p.phone || "")}" inputmode="tel" style="width:120px"></td>
    <td><input type="checkbox" data-f="captain" ${p.captain ? "checked" : ""}></td>
    <td>${p.id ? `<button class="btn sm danger" data-del>✕</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="actions" style="margin-top:10px"><button class="btn" id="addP">+ Fila extra (suplente)</button><span class="note">Los datos de jugadores son privados: no aparecen en la página pública.</span></div>`;
  $("#pt", pane).onchange = e => { S.playerTeam = e.target.value; render(); };
  $("#addP", pane).onclick = async () => { await guard(() => db.createPlayer({ team_id: S.playerTeam, name: "Nuevo jugador" })); await reload(); };
  $$("tr", pane).forEach(tr => {
    if (!tr.querySelector("[data-f]")) return;
    $$("[data-f]", tr).forEach(inp => inp.onchange = async () => {
      const f = inp.dataset.f;
      const v = f === "captain" ? inp.checked : inp.value.trim() || null;
      const id = tr.dataset.id;
      if (id) {
        await guard(() => db.updatePlayer(id, { [f]: v }), "Guardado");
        Object.assign(S.players.find(p => p.id === id), { [f]: v });
        if (f === "sex") render();
      } else {
        if (f !== "name" || !v) return toast("Escribe primero el nombre", "err");
        const p = await guard(() => db.createPlayer({ team_id: S.playerTeam, name: v }), "Jugador agregado");
        S.players.push(p); render();
      }
    });
    const del = $("[data-del]", tr);
    if (del) del.onclick = async () => { if (!confirm("¿Eliminar jugador?")) return; await guard(() => db.deletePlayer(tr.dataset.id), "Eliminado"); await reload(); };
  });
}

// ================================================================ LLAVE
function paneBracket(pane) {
  const c = cfg(S.T), teams = byId();
  const st = standings(S.teams, S.matches, c);
  const q = qualifiers(st, c);
  const byes = byeTeams(q);
  const done = groupsComplete(S.matches);
  const ko = S.matches.filter(m => m.phase !== "grupos");
  const koPlayed = ko.filter(isDone).length;
  const lastG = S.matches.filter(m => m.phase === "grupos" && m.scheduled_at).map(m => m.scheduled_at).sort().pop();
  const defStart = lastG ? new Date(new Date(lastG).getTime() + (c.groupMatchMin + c.koBreakMin) * 60000).toISOString() : null;
  const resolved = resolveTeams(S.matches, c);
  const qs = new Set(q.map(r => r.team.id));
  pane.innerHTML = `
  ${done ? `<div class="banner ok">✔ Fase de grupos terminada: la llave usará las posiciones definitivas.</div>` : `<div class="banner">La fase de grupos no ha terminado: si generas la llave ahora, usará las posiciones provisionales.</div>`}
  <div class="grid two">
    <section class="card"><div class="form" style="padding-bottom:0"><h3>Clasificados (${q.length})</h3></div>
      <table class="st"><thead><tr><th>Siembra</th><th class="team">Equipo</th><th>Grupo</th><th>PTS</th><th>DS</th><th>DP</th></tr></thead><tbody>
      ${q.map(r => `<tr><td><span class="pos">${r.seed}</span></td><td class="team">${esc(r.team.name)}${byes.has(r.team.id) ? ' <span class="bye">directo</span>' : ""}</td><td>${esc(r.group)}</td><td class="pts">${r.pts}</td><td>${r.ds}</td><td>${r.dp}</td></tr>`).join("")}</tbody></table>
      <p class="note" style="padding:0 14px">${c.koMode === "general" ? "Siembra por tabla general" : "Siembra por posición en grupo"}: 1 vs último, 2 vs penúltimo… ${byes.size ? `Pasan directo a la 2.ª ronda: ${byes.size}.` : ""} Si hay empate total, revisa el resultado entre ellos.</p>
    </section>
    <section class="card form"><h3>Generar llave</h3>
      <label class="f">Hora de inicio de eliminatorias<input class="i" type="datetime-local" id="kst" value="${toLocalInput(defStart)}"></label>
      <p class="note">Duración por partido: ${c.koMatchMin} min · ${c.courts.length} cancha(s). El 3.er puesto y la final se juegan solos, uno después del otro.</p>
      <div class="actions"><button class="btn primary" id="gk">${ko.length ? "Regenerar llave" : "Generar llave"}</button></div>
      ${ko.length ? `<p class="note">Los equipos de semifinal y final se llenan solos a medida que registras ganadores.</p>` : ""}
    </section>
  </div>
  ${ko.length ? `<div class="section-title"><h2>Vista previa</h2></div>${bracketView(resolved, teams, c, { seeds: Object.fromEntries(q.map(r => [r.team.id, r.seed])) })}` : ""}
  <div class="section-title"><h2>Tabla general</h2></div>
  <section class="card">${generalTableHTML(generalTable(st), qs, byes)}</section>
  <div class="section-title"><h2>Por grupos</h2></div>
  <div class="grid two">${st.groups.filter(Boolean).map(g => `<section class="card group-card"><h3>Grupo ${esc(g)}</h3>${standingsTable(st.byGroup[g], qs)}</section>`).join("")}</div>`;
  $("#gk", pane).onclick = async () => {
    if (q.length < 2 || q.length > 16) return toast("La llave admite de 2 a 16 equipos", "err");
    if (ko.length && !confirm(`Se reemplazará la llave actual${koPlayed ? ` (¡con ${koPlayed} partidos jugados!)` : ""}. ¿Continuar?`)) return;
    const start = fromLocalInput($("#kst", pane).value);
    await guard(async () => {
      await db.deleteMatchesByPhase(S.T.id, KO_PHASES);
      const ms = generateKnockout(q, c, TZ_OFFSET, start).map(m => ({ ...m, tournament_id: S.T.id }));
      await db.createMatches(ms);
    }, "Llave generada");
    await reload();
  };
}

// ================================================================ CONFIGURACIÓN
function paneConfig(pane) {
  const T = S.T, c = cfg(T), tp = c.tablePoints;
  const num = (name, v, lbl, extra = "") => `<label class="f">${lbl}<input class="i" type="number" name="${name}" value="${v}" ${extra}></label>`;
  pane.innerHTML = `<form class="card form" id="cf">
    <h3>Datos generales</h3>
    <div class="row">
      <label class="f">Nombre del torneo<input class="i" name="name" value="${esc(T.name)}" required></label>
      <label class="f">Estado<select class="i" name="status">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${T.status === k ? "selected" : ""}>${l}${k === "borrador" ? " (oculto al público)" : ""}</option>`).join("")}</select></label>
    </div>
    <div class="row">
      <label class="f">Deporte<input class="i" name="sport" value="${esc(T.sport || "")}"></label>
      <label class="f">Lugar<input class="i" name="location" value="${esc(T.location || "")}"></label>
      <label class="f">Enlace (slug)<input class="i" name="slug" value="${esc(T.slug)}" pattern="[a-z0-9-]+" title="minúsculas, números y guiones"></label>
    </div>

    <h3>Días y horarios</h3>
    <div id="days">${c.days.map((d, i) => dayRow(d, i)).join("")}</div>
    <div class="actions"><button type="button" class="btn sm" id="addDay">+ Agregar día</button></div>
    <div class="row">
      ${num("groupMatchMin", c.groupMatchMin, "Duración partido grupos (min)", 'min="10"')}
      ${num("koMatchMin", c.koMatchMin, "Duración partido eliminatorias (min)", 'min="10"')}
      ${num("koBreakMin", c.koBreakMin, "Pausa antes de eliminatorias (min)", 'min="0"')}
      <label class="f">Canchas (separadas por coma)<input class="i" name="courts" value="${esc(c.courts.join(", "))}"></label>
    </div>

    <h3>Formato de juego</h3>
    <div class="row">
      <label class="f">Sets por partido<select class="i" name="bestOf">${[1, 3, 5].map(n => `<option value="${n}" ${c.bestOf === n ? "selected" : ""}>${n === 1 ? "1 set" : "Mejor de " + n}</option>`).join("")}</select></label>
      ${num("groupSetPoints", c.groupSetPoints, "Puntos por set (grupos)")}
      ${num("koSetPoints", c.koSetPoints, "Puntos por set (eliminatorias)")}
      ${num("lastSetPoints", c.lastSetPoints, "Puntos del set decisivo")}
    </div>
    <div class="row">
      ${num("winClean", tp.winClean, "Pts: gana sin ceder set")}
      ${num("winClose", tp.winClose, "Pts: gana cediendo set")}
      ${num("lossClose", tp.lossClose, "Pts: pierde ganando set")}
      ${num("lossClean", tp.lossClean, "Pts: pierde sin ganar set")}
    </div>
    <div class="row">
      <label class="f">Cómo se arma la llave<select class="i" name="koMode"><option value="general" ${c.koMode === "general" ? "selected" : ""}>Por tabla general</option><option value="grupos" ${c.koMode !== "general" ? "selected" : ""}>Mejores de cada grupo</option></select></label>
      ${num("qualifiers", c.qualifiers, "Equipos que pasan a la llave", 'min="2" max="16"')}
      <label class="f">Partido por 3.er puesto<select class="i" name="thirdPlace"><option value="1" ${c.thirdPlace ? "selected" : ""}>Sí</option><option value="0" ${!c.thirdPlace ? "selected" : ""}>No</option></select></label>
      ${num("playersPerTeam", c.playersPerTeam, "Jugadores inscritos por equipo")}
      ${num("playersOnCourt", c.playersOnCourt, "Jugadores en cancha")}
    </div>

    <h3>Inscripción y premiación</h3>
    <div class="row">
      ${num("fee", c.fee, "Valor inscripción por equipo (COP)")}
      ${num("p1", c.prizes[0] ?? 50, "% bolsa campeón")}
      ${num("p2", c.prizes[1] ?? 30, "% bolsa subcampeón")}
      ${num("p3", c.prizes[2] ?? 20, "% bolsa 3.er puesto")}
    </div>

    <h3>Reglamento</h3>
    <textarea class="i" name="rules" rows="7" placeholder="Reglas que verá el público en la pestaña Info">${esc(c.rules || "")}</textarea>

    <div class="actions"><button class="btn primary" type="submit">Guardar configuración</button>
      <button class="btn danger" type="button" id="delT" style="margin-left:auto">Eliminar torneo</button></div>
  </form>`;

  $("#addDay", pane).onclick = () => { $("#days", pane).insertAdjacentHTML("beforeend", dayRow({ date: "", start: "08:00", end: "18:00" }, $$(".dayrow", pane).length)); wireDays(); };
  const wireDays = () => $$("[data-rmday]", pane).forEach(b => b.onclick = () => b.closest(".dayrow").remove());
  wireDays();

  $("#cf", pane).onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), n = k => Number(f.get(k));
    const days = $$(".dayrow", pane).map(r => ({ date: $("[data-d=date]", r).value, start: $("[data-d=start]", r).value, end: $("[data-d=end]", r).value })).filter(d => d.date || d.start);
    const config = {
      ...c, days,
      courts: f.get("courts").split(",").map(s => s.trim()).filter(Boolean),
      groupMatchMin: n("groupMatchMin"), koMatchMin: n("koMatchMin"), koBreakMin: n("koBreakMin"),
      bestOf: n("bestOf"), groupSetPoints: n("groupSetPoints"), koSetPoints: n("koSetPoints"), lastSetPoints: n("lastSetPoints"),
      tablePoints: { winClean: n("winClean"), winClose: n("winClose"), lossClose: n("lossClose"), lossClean: n("lossClean") },
      koMode: f.get("koMode"), qualifiers: Math.min(16, Math.max(2, n("qualifiers"))), thirdPlace: f.get("thirdPlace") === "1",
      playersPerTeam: n("playersPerTeam"), playersOnCourt: n("playersOnCourt"),
      fee: n("fee"), prizes: [n("p1"), n("p2"), n("p3")], rules: f.get("rules"),
    };
    if (!config.courts.length) config.courts = ["Cancha 1"];
    const slug = slugify(f.get("slug")) || T.slug;
    if (slug !== T.slug && S.tournaments.some(t => t.slug === slug)) return toast("Ese enlace ya lo usa otro torneo", "err");
    const patch = { name: f.get("name").trim(), status: f.get("status"), sport: f.get("sport"), location: f.get("location"), slug, config };
    await guard(() => db.updateTournament(T.id, patch), "Configuración guardada");
    Object.assign(T, patch);
    await loadTournaments(); S.T = S.tournaments.find(t => t.id === T.id) || T; render();
  };
  $("#delT", pane).onclick = async () => {
    const v = prompt(`Esto borra el torneo con equipos, jugadores y resultados. No se puede deshacer.\n\nEscribe ELIMINAR para confirmar:`);
    if (v !== "ELIMINAR") return;
    await guard(() => db.deleteTournament(T.id), "Torneo eliminado");
    await loadTournaments(); S.T = null; localStorage.removeItem("adm_t");
    if (S.tournaments[0]) await selectTournament(S.tournaments[0].id); else render();
  };
}
function dayRow(d, i) {
  return `<div class="row dayrow" style="align-items:end;margin-bottom:8px">
    <label class="f">Día ${i + 1}: fecha<input class="i" type="date" data-d="date" value="${esc(d.date || "")}"></label>
    <label class="f">Desde<input class="i" type="time" data-d="start" value="${esc(d.start || "")}"></label>
    <label class="f">Hasta<input class="i" type="time" data-d="end" value="${esc(d.end || "")}"></label>
    <button type="button" class="btn sm danger" data-rmday style="height:38px">Quitar</button></div>`;
}

// ================================================================ COMPARTIR
function paneShare(pane) {
  const url = publicURL(S.T);
  const msg = `🏐 ${S.T.name}\nSigue resultados, posiciones y llave EN VIVO aquí:\n${url}`;
  pane.innerHTML = `<div class="grid two">
    <section class="card form"><h3>Link público</h3>
      ${S.T.status === "borrador" ? `<div class="banner">El torneo está en <b>Borrador</b>: el público aún no lo puede ver. Cámbialo en Configuración.</div>` : ""}
      <input class="i" readonly value="${esc(url)}" id="url">
      <div class="actions"><button class="btn primary" id="cp">Copiar link</button>
      <a class="btn accent" target="_blank" href="https://wa.me/?text=${encodeURIComponent(msg)}">Compartir por WhatsApp</a>
      <a class="btn" target="_blank" href="${esc(url)}">Abrir ↗</a></div>
    </section>
    <section class="card form" style="text-align:center"><h3>Código QR</h3>
      <div><div class="qr" id="qr">Generando…</div></div>
      <div class="actions" style="justify-content:center"><a class="btn" id="dl" download="qr-${esc(S.T.slug)}.png">Descargar QR</a></div>
      <p class="note">Imprímelo y pégalo en la cancha o en la mesa de planillaje.</p>
    </section></div>`;
  $("#cp", pane).onclick = async () => { try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { $("#url", pane).select(); } };
  import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm").then(async QR => {
    const lib = QR.default || QR;
    const data = await lib.toDataURL(url, { width: 360, margin: 1, color: { dark: "#0f4c5c", light: "#ffffff" } });
    $("#qr", pane).innerHTML = `<img src="${data}" width="240" height="240" alt="QR del torneo">`;
    $("#dl", pane).href = data;
  }).catch(() => { $("#qr", pane).textContent = "No se pudo generar el QR (sin conexión)."; });
}

boot();
