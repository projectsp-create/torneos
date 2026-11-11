import { setsWon, winnerSide, isDone, PHASE_LABEL, sourceLabel, podium } from "./logic.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TZ = "America/Bogota";

export function fmtTime(iso) {
  if (!iso) return "Hora por definir";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
}
export function fmtDay(iso) {
  if (!iso) return "Sin programar";
  const s = new Date(iso).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function dayKey(iso) {
  if (!iso) return "zz";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}
export const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
export const STATUS_LABEL = { borrador: "Borrador", inscripciones: "Inscripciones", en_curso: "En curso", finalizado: "Finalizado" };

export function teamName(teamsById, id, src) {
  if (id && teamsById[id]) return { name: teamsById[id].name, tbd: false };
  return { name: sourceLabel(src), tbd: true };
}

export function matchCard(m, teamsById, c, opts = {}) {
  const live = m.status === "en_juego";
  const done = isDone(m);
  const w = winnerSide(m, c);
  const H = teamName(teamsById, m._home ?? m.home_team_id, m.home_source);
  const A = teamName(teamsById, m._away ?? m.away_team_id, m.away_source);
  const { h, a } = setsWon(m.sets);
  const sets = (m.sets || []).filter(s => s && (s[0] != null || s[1] != null));
  const scoreRow = side => {
    const parts = sets.map(s => {
      const mine = side === "home" ? s[0] : s[1], th = side === "home" ? s[1] : s[0];
      return `<span class="s ${mine > th ? "w" : ""}">${mine ?? ""}</span>`;
    }).join("");
    const tot = (live || done) ? `<span class="tot ${w === side ? "w" : ""}">${side === "home" ? h : a}</span>` : "";
    return `<div class="scores">${parts}${tot}</div>`;
  };
  const label = m.phase === "grupos" ? `Grupo ${esc(m.group_label)}` : esc(PHASE_LABEL[m.phase] || m.phase);
  const right = live ? `<span class="live-badge">EN VIVO</span>`
    : m.status === "wo" ? `<span>W.O.</span>`
    : done ? `<span>Final</span>` : `<span>${esc(fmtTime(m.scheduled_at))}</span>`;
  return `<article class="card match ${live ? "is-live" : ""}">
    <div class="match-head"><span><span class="tag">${label}</span> · ${esc(m.court || "")}${opts.showTime && done ? " · " + esc(fmtTime(m.scheduled_at)) : ""}</span>${right}</div>
    <div class="rowteam"><span class="tname ${w === "home" ? "win" : ""} ${H.tbd ? "tbd" : ""}">${esc(H.name)}</span>${scoreRow("home")}</div>
    <div class="rowteam"><span class="tname ${w === "away" ? "win" : ""} ${A.tbd ? "tbd" : ""}">${esc(A.name)}</span>${scoreRow("away")}</div>
  </article>`;
}

export function standingsTable(rows, qualIds) {
  if (!rows.length) return `<div class="empty">Sin equipos</div>`;
  return `<div class="table-wrap"><table class="st">
    <thead><tr><th>#</th><th class="team">Equipo</th><th>PJ</th><th>PG</th><th class="hide-sm">PP</th>
    <th title="Diferencia de sets">DS</th><th class="hide-sm" title="Diferencia de puntos">DP</th><th>PTS</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${qualIds.has(r.team.id) ? "q" : ""}">
      <td><span class="pos">${r.pos}</span></td><td class="team">${esc(r.team.name)}</td>
      <td>${r.pj}</td><td>${r.pg}</td><td class="hide-sm">${r.pp}</td>
      <td>${r.ds > 0 ? "+" : ""}${r.ds}</td><td class="hide-sm">${r.dp > 0 ? "+" : ""}${r.dp}</td>
      <td class="pts">${r.pts}</td></tr>`).join("")}</tbody></table></div>`;
}

export function bracketView(resolved, teamsById, c) {
  const ko = resolved.filter(m => m.phase !== "grupos");
  if (!ko.length) return "";
  const order = ["octavos", "cuartos", "semifinal", "final"];
  const cols = order.filter(p => ko.some(m => m.phase === p)).map(p => {
    let list = ko.filter(m => m.phase === p);
    if (p === "final") list = list.concat(ko.filter(m => m.phase === "tercero"));
    return `<div class="col"><h3>${esc(PHASE_LABEL[p])}</h3>${list.map(m => matchCard(m, teamsById, c)).join("")}</div>`;
  }).join("");
  const pd = podium(resolved, c);
  const nm = id => id && teamsById[id] ? esc(teamsById[id].name) : "Por definir";
  return `<div class="bracket">${cols}</div>
    <div class="podium">
      <div class="p"><div class="medal">🥈</div><div class="lbl">Subcampeón</div><div class="who">${nm(pd.second)}</div></div>
      <div class="p gold"><div class="medal">🏆</div><div class="lbl">Campeón</div><div class="who">${nm(pd.first)}</div></div>
      <div class="p"><div class="medal">🥉</div><div class="lbl">Tercer puesto</div><div class="who">${nm(pd.third)}</div></div>
    </div>`;
}

export function toast(msg, kind = "") {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.className = "toast show " + kind; el.textContent = msg;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600);
}
