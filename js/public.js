import { SITE_NAME } from "./config.js";
import * as db from "./data.js";
import { cfg, standings, qualifiers, generalTable, byeTeams, resolveTeams, isDone, groupsComplete } from "./logic.js";
import { esc, fmtDay, dayKey, matchCard, standingsTable, generalTableHTML, bracketView, money, STATUS_LABEL } from "./ui.js";
import { seedDemoIfEmpty } from "./demo.js";

const params = new URLSearchParams(location.search);
const slug = params.get("t");
const REFRESH_MS = 20000;
let T = null, teams = [], matches = [], tab = location.hash.slice(1) || "partidos", filter = "proximos", tableView = "general", lastLoad = 0;

document.getElementById("site").textContent = SITE_NAME;
document.getElementById("site2").textContent = SITE_NAME;
if (db.DEMO) document.body.insertAdjacentHTML("beforeend", `<div class="demo-flag">MODO DEMO</div>`);

async function load(full = false) {
  try {
    if (!T || full) {
      T = await db.getTournament(slug);
      if (!T) { document.getElementById("view").innerHTML = `<div class="empty">Torneo no encontrado. <a href="./">Ver torneos</a></div>`; document.getElementById("tname").textContent = "Torneo no encontrado"; return; }
      teams = await db.getTeams(T.id);
    }
    matches = await db.getMatches(T.id);
    lastLoad = Date.now();
    render();
  } catch (e) {
    document.getElementById("upd").textContent = "Sin conexión, reintentando…";
  }
}

function header() {
  const c = cfg(T);
  document.title = `${T.name} · En vivo`;
  document.getElementById("tname").textContent = T.name;
  const played = matches.filter(isDone).length;
  document.getElementById("tmeta").innerHTML = [
    `<span class="chip">${esc(T.sport || "")}</span>`,
    T.location ? `<span>📍 ${esc(T.location)}</span>` : "",
    `<span>${teams.length} equipos</span>`,
    matches.length ? `<span>${played}/${matches.length} partidos jugados</span>` : "",
    `<span class="chip">${esc(STATUS_LABEL[T.status] || "")}</span>`,
  ].join("");
}

function render() {
  header();
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  const c = cfg(T);
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  const resolved = resolveTeams(matches, c);
  const v = document.getElementById("view");
  if (tab === "partidos") v.innerHTML = viewMatches(resolved, byId, c);
  else if (tab === "posiciones") v.innerHTML = viewStandings(c);
  else if (tab === "llave") v.innerHTML = viewBracket(resolved, byId, c);
  else if (tab === "equipos") v.innerHTML = viewTeams();
  else v.innerHTML = viewInfo(c);
  v.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { filter = b.dataset.filter; render(); });
  v.querySelectorAll("[data-tv]").forEach(b => b.onclick = () => { tableView = b.dataset.tv; render(); });
}

function viewMatches(resolved, byId, c) {
  if (!resolved.length) return `<div class="card empty" style="margin-top:18px">La programación se publicará pronto.</div>`;
  const live = resolved.filter(m => m.status === "en_juego");
  let list = filter === "proximos" ? resolved.filter(m => !isDone(m) && m.status !== "en_juego")
    : filter === "resultados" ? resolved.filter(isDone).reverse() : resolved;
  const pills = [["proximos", "Próximos"], ["resultados", "Resultados"], ["todos", "Todos"]]
    .map(([k, l]) => `<button class="pill" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join("");
  let html = "";
  if (live.length) html += `<div class="section-title"><h2>En juego</h2></div><div class="grid two">${live.map(m => matchCard(m, byId, c)).join("")}</div>`;
  html += `<div class="section-title"><h2>Partidos</h2><div class="filters">${pills}</div></div>`;
  if (!list.length) return html + `<div class="card empty">${filter === "resultados" ? "Aún no hay resultados." : "No hay partidos pendientes."}</div>`;
  const groups = [];
  for (const m of list) {
    const k = dayKey(m.scheduled_at);
    let g = groups.find(x => x.k === k);
    if (!g) groups.push(g = { k, label: fmtDay(m.scheduled_at), items: [] });
    g.items.push(m);
  }
  return html + groups.map(g => `<div class="day-label">${esc(g.label)}</div>
    <div class="grid two">${g.items.map(m => matchCard(m, byId, c, { showTime: true })).join("")}</div>`).join("");
}

function viewStandings(c) {
  const st = standings(teams, matches, c);
  if (!st.groups.length || st.groups.every(g => !g)) return `<div class="card empty" style="margin-top:18px">Los grupos se publicarán pronto.</div>`;
  const quals = qualifiers(st, c);
  const q = new Set(quals.map(r => r.team.id));
  const byes = byeTeams(quals);
  const done = groupsComplete(matches);
  const seg = `<div class="seg">${[["general", "Tabla general"], ["grupos", "Por grupos"]].map(([k, l]) => `<button data-tv="${k}" aria-pressed="${tableView === k}">${l}</button>`).join("")}</div>`;
  const body = tableView === "general"
    ? `<section class="card group-card"><h3>Tabla general</h3>${generalTableHTML(generalTable(st), q, byes)}</section>`
    : `<div class="grid two">${st.groups.map(g => `<section class="card group-card"><h3>Grupo ${esc(g)}</h3>${standingsTable(st.byGroup[g], q)}</section>`).join("")}</div>`;
  return `<div class="section-title" style="margin-top:6px">${seg}</div>
    ${done ? `<div class="banner ok">✔ Fase de grupos terminada</div>` : `<div class="banner">Posiciones provisionales: la fase de grupos sigue en juego.</div>`}
    ${body}
    <div class="legend"><i></i> Clasifica a la llave · PTS: gana 2-0 = ${c.tablePoints.winClean}, gana 2-1 = ${c.tablePoints.winClose}, pierde 1-2 = ${c.tablePoints.lossClose}, pierde 0-2 = ${c.tablePoints.lossClean} · Orden: PTS → DS → DP</div>`;
}

function viewBracket(resolved, byId, c) {
  const b = bracketView(resolved, byId, c);
  if (!b) {
    const st = standings(teams, matches, c);
    const q = qualifiers(st, c);
    return `<div class="section-title"><h2>Clasificados hoy</h2><span class="sub">Así quedaría la llave si los grupos terminaran ahora</span></div>
      <div class="card">${q.length ? `<table class="st"><thead><tr><th>Siembra</th><th class="team">Equipo</th><th>Grupo</th><th>Pos. grupo</th><th>PTS</th></tr></thead><tbody>
      ${q.map(r => `<tr><td><span class="pos">${r.seed}</span></td><td class="team">${esc(r.team.name)}</td><td>${esc(r.group)}</td><td>${r.pos}.º</td><td class="pts">${r.pts}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Sin datos todavía</div>`}</div>`;
  }
  return `<div class="section-title"><h2>Eliminatorias</h2><span class="sub">Desliza para ver todas las fases →</span></div>${b}`;
}

function viewTeams() {
  const g = {};
  teams.forEach(t => (g[t.group_label || "Sin grupo"] ||= []).push(t));
  return `<div class="grid two" style="margin-top:18px">${Object.keys(g).sort().map(k => `<section class="card group-card"><h3>${k === "Sin grupo" ? k : "Grupo " + esc(k)}</h3>
    <ul class="team-list">${g[k].map(t => `<li>${esc(t.name)}</li>`).join("")}</ul></section>`).join("")}</div>`;
}

function viewInfo(c) {
  const tp = c.tablePoints;
  const fmtSets = `Mejor de ${c.bestOf} sets`;
  return `<div class="section-title"><h2>Formato</h2></div>
  <dl class="card kv">
    <dt>Fase de grupos</dt><dd>${fmtSets} a ${c.groupSetPoints} puntos${c.bestOf > 1 ? ` (set decisivo a ${c.lastSetPoints})` : ""}</dd>
    <dt>Eliminatorias</dt><dd>${fmtSets} a ${c.koSetPoints} puntos${c.bestOf > 1 ? ` (set decisivo a ${c.lastSetPoints})` : ""}</dd>
    <dt>Puntos en tabla</dt><dd>Gana ${c.bestOf > 1 ? `sin ceder set ${tp.winClean} · gana cediendo set ${tp.winClose} · pierde ganando set ${tp.lossClose} · ` : ""}pierde ${tp.lossClean}</dd>
    <dt>Desempate</dt><dd>Puntos → dif. de sets → dif. de puntos → resultado entre ellos</dd>
    <dt>Clasifican</dt><dd>${c.koMode === "general" ? `Los ${c.qualifiers} primeros de la tabla general (1 vs ${c.qualifiers}, 2 vs ${c.qualifiers - 1}…; si no completan llave, los mejores pasan directo)` : `${c.qualifiers} equipos (mejores de cada grupo)`}${c.thirdPlace ? " · hay partido por el 3.er puesto" : ""}</dd>
    <dt>Jugadores</dt><dd>${c.playersPerTeam} inscritos, ${c.playersOnCourt} en cancha</dd>
    ${c.fee ? `<dt>Inscripción</dt><dd>${money(c.fee)} por equipo</dd>` : ""}
    ${c.prizes?.length ? `<dt>Premiación</dt><dd>${c.prizes.map((p, i) => `${["🏆", "🥈", "🥉"][i] || ""} ${p}%`).join(" · ")} de la bolsa</dd>` : ""}
  </dl>
  ${c.rules ? `<div class="section-title"><h2>Reglamento</h2></div><div class="card prose">${esc(c.rules)}</div>` : ""}`;
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
document.getElementById("refresh").onclick = () => load(true);
setInterval(() => {
  const s = Math.round((Date.now() - lastLoad) / 1000);
  if (lastLoad) document.getElementById("upd").textContent = s < 5 ? "Actualizado ahora" : `Actualizado hace ${s} s`;
}, 1000);
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS * 6);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });

(async () => {
  if (db.DEMO) await seedDemoIfEmpty();
  if (!slug) { location.replace("./"); return; }
  await load(true);
})();
