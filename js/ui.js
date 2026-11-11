import { setsWon, winnerSide, isDone, PHASE_LABEL, sourceLabel, podium } from "./logic.js?v=20261111c";

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

export function generalTableHTML(rows, qualIds, byeIds = new Set()) {
  if (!rows.length) return `<div class="empty">Sin equipos</div>`;
  return `<div class="table-wrap"><table class="st">
    <thead><tr><th>#</th><th class="team">Equipo</th><th class="hide-sm">Gr.</th><th>PJ</th><th>PG</th><th class="hide-sm">PP</th>
    <th class="hide-sm" title="Sets a favor">SF</th><th class="hide-sm" title="Sets en contra">SC</th><th title="Diferencia de sets">DS</th>
    <th class="hide-sm" title="Puntos a favor">PF</th><th class="hide-sm" title="Puntos en contra">PC</th><th title="Diferencia de puntos">DP</th><th>PTS</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${qualIds.has(r.team.id) ? "q" : ""}">
      <td><span class="pos">${r.gpos}</span></td><td class="team">${esc(r.team.name)}${byeIds.has(r.team.id) ? ' <span class="bye">directo</span>' : ""}</td><td class="hide-sm">${esc(r.group)}</td>
      <td>${r.pj}</td><td>${r.pg}</td><td class="hide-sm">${r.pp}</td><td class="hide-sm">${r.sf}</td><td class="hide-sm">${r.sc}</td>
      <td>${r.ds > 0 ? "+" : ""}${r.ds}</td><td class="hide-sm">${r.pf}</td><td class="hide-sm">${r.pc}</td><td>${r.dp > 0 ? "+" : ""}${r.dp}</td>
      <td class="pts">${r.pts}</td></tr>`).join("")}</tbody></table></div>`;
}

// Llave gráfica en forma de árbol (octavos → cuartos → semis → final).
const SHORT = { octavos: "Octavos", cuartos: "Cuartos", semifinal: "Semifinal", tercero: "3.er puesto", final: "Final" };
export function bracketView(resolved, teamsById, c, opts = {}) {
  const ko = resolved.filter(m => m.phase !== "grupos");
  if (!ko.length) return "";
  const seeds = opts.seeds || {};
  const byCode = Object.fromEntries(ko.map(m => [m.code, m]));
  const final = ko.find(m => m.phase === "final");
  const third = ko.find(m => m.phase === "tercero");
  if (!final) return "";

  const teamRow = (id, src, side, m) => {
    const t = id && teamsById[id];
    const w = winnerSide(m, c);
    const { h, a } = setsWon(m.sets);
    const showScore = m.status === "en_juego" || isDone(m);
    const sd = t && seeds[id] ? `<span class="sd">${seeds[id]}</span>` : `<span class="sd"></span>`;
    return `<div class="bt ${w === side ? "win" : w ? "lose" : ""}">${sd}<span class="nm ${t ? "" : "tbd"}">${t ? esc(t.name) : esc(sourceLabel(src))}</span>${showScore ? `<b>${side === "home" ? h : a}</b>` : ""}</div>`;
  };
  const card = m => {
    const live = m.status === "en_juego";
    const sets = (m.sets || []).filter(x => x && (x[0] || x[1])).map(x => `${x[0]}-${x[1]}`).join(" · ");
    return `<div class="bm ${live ? "live" : ""} ${m.phase === "final" ? "fin" : ""}">
      <div class="bh"><span>${esc(m.code)} · ${esc(SHORT[m.phase] || "")}</span><span>${live ? '<span class="live-badge">VIVO</span>' : m.scheduled_at ? esc(fmtTime(m.scheduled_at)) : ""}</span></div>
      ${teamRow(m._home, m.home_source, "home", m)}${teamRow(m._away, m.away_source, "away", m)}
      ${sets ? `<div class="bs">${esc(sets)}</div>` : ""}</div>`;
  };
  const byeCard = id => `<div class="bm bye-card"><div class="bh"><span>Pase directo</span><span></span></div>
      <div class="bt win"><span class="sd">${seeds[id] || ""}</span><span class="nm">${esc(teamsById[id]?.name || "")}</span></div></div>`;
  let depth = 0;
  const node = (m, d) => {
    depth = Math.max(depth, d);
    const kid = (id, src) => {
      if (src && src.startsWith("W:") && byCode[src.slice(2)]) return node(byCode[src.slice(2)], d + 1);
      if (id && !src && m.phase !== firstPhase) return `<div class="bn leaf">${byeCard(id)}</div>`;
      return null;
    };
    const k1 = kid(m.home_team_id, m.home_source), k2 = kid(m.away_team_id, m.away_source);
    const kids = k1 || k2 ? `<div class="bk">${k1 || `<div class="bn leaf"></div>`}${k2 || `<div class="bn leaf"></div>`}</div>` : "";
    return `<div class="bn">${kids}${card(m)}</div>`;
  };
  const phases = ["octavos", "cuartos", "semifinal", "final"].filter(p => ko.some(m => m.phase === p));
  const firstPhase = phases[0];
  const tree = node(final, 0);
  const pd = podium(resolved, c);
  const nm = id => id && teamsById[id] ? esc(teamsById[id].name) : "Por definir";
  return `<div class="tree-scroll"><div class="tree" id="bracket-img">
      ${opts.title ? `<div class="tree-title">${esc(opts.title)}</div>` : ""}
      <div class="tree-heads">${phases.map(p => `<span>${esc(PHASE_LABEL[p])}</span>`).join("")}<span>Campeón</span></div>
      <div class="tree-body">${tree}<div class="champ"><div class="trophy">🏆</div><div class="lbl">Campeón</div><div class="who">${nm(pd.first)}</div></div></div>
      ${third ? `<div class="third"><div class="lbl">Partido por el 3.er puesto</div>${card(third)}</div>` : ""}
    </div></div>
    <div class="podium">
      <div class="p"><div class="medal">🥈</div><div class="lbl">Subcampeón</div><div class="who">${nm(pd.second)}</div></div>
      <div class="p gold"><div class="medal">🏆</div><div class="lbl">Campeón</div><div class="who">${nm(pd.first)}</div></div>
      <div class="p"><div class="medal">🥉</div><div class="lbl">Tercer puesto</div><div class="who">${nm(pd.third)}</div></div>
    </div>`;
}

// Descarga la llave como imagen PNG (para WhatsApp).
export async function downloadBracket(name = "llave") {
  const el = document.getElementById("bracket-img");
  if (!el) return;
  const mod = await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm");
  const h2c = mod.default || mod;
  const bg = getComputedStyle(document.body).backgroundColor;
  const canvas = await h2c(el, { backgroundColor: bg, scale: 2, width: el.scrollWidth, windowWidth: el.scrollWidth + 40 });
  const a = document.createElement("a");
  a.download = `${name}.png`; a.href = canvas.toDataURL("image/png"); a.click();
}

export function toast(msg, kind = "") {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.className = "toast show " + kind; el.textContent = msg;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600);
}
