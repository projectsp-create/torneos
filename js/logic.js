// Lógica del torneo: puntos, posiciones, fixture y llave.
// Funciones puras (sin acceso a red), usadas por la página pública y el panel.

export const DEFAULT_CONFIG = {
  bestOf: 3,               // mejor de 3 sets
  groupSetPoints: 15,      // sets de fase de grupos a 15
  koSetPoints: 21,         // sets de eliminatorias a 21
  lastSetPoints: 15,       // set decisivo a 15
  tablePoints: { winClean: 3, winClose: 2, lossClose: 1, lossClean: 0 },
  qualifiers: 8,
  thirdPlace: true,
  courts: ["Cancha 1", "Cancha 2"],
  days: [
    { date: "", start: "17:00", end: "22:00" },
    { date: "", start: "08:00", end: "22:00" },
  ],
  groupMatchMin: 35,
  koMatchMin: 50,
  koBreakMin: 60,
  fee: 130000,
  prizes: [50, 30, 20],
  playersPerTeam: 5,
  playersOnCourt: 4,
  rules: "",
  color: "#0f4c5c",
};

export function cfg(t) {
  const c = { ...DEFAULT_CONFIG, ...(t?.config || {}) };
  c.tablePoints = { ...DEFAULT_CONFIG.tablePoints, ...(t?.config?.tablePoints || {}) };
  return c;
}

export const PHASE_LABEL = {
  grupos: "Fase de grupos", octavos: "Octavos", cuartos: "Cuartos de final",
  semifinal: "Semifinal", tercero: "Tercer puesto", final: "Final",
};
export const KO_PHASES = ["octavos", "cuartos", "semifinal", "tercero", "final"];

// ---------------------------------------------------------------- sets
export function setsWon(sets) {
  let h = 0, a = 0, ph = 0, pa = 0;
  for (const s of sets || []) {
    const x = Number(s?.[0]), y = Number(s?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) continue;
    ph += x; pa += y;
    if (x > y) h++; else if (y > x) a++;
  }
  return { h, a, ph, pa };
}
export function isDone(m) { return m.status === "finalizado" || m.status === "wo"; }

export function winnerSide(m, c) {
  if (!isDone(m)) return null;
  const { h, a } = setsWon(m.sets);
  const need = Math.ceil((c?.bestOf || 3) / 2);
  if (h >= need && h > a) return "home";
  if (a >= need && a > h) return "away";
  if (h > a) return "home";
  if (a > h) return "away";
  return null;
}

// Valida un marcador. Devuelve texto de advertencia o "" si está bien.
export function validateSets(sets, c, phase) {
  const need = Math.ceil(c.bestOf / 2);
  let h = 0, a = 0;
  const target = phase === "grupos" ? c.groupSetPoints : c.koSetPoints;
  for (let i = 0; i < sets.length; i++) {
    const [x, y] = sets[i];
    if (x == null && y == null) continue;
    if (h === need || a === need) return `Sobra el set ${i + 1}: el partido ya estaba definido.`;
    const isLast = i === c.bestOf - 1 && c.bestOf > 1;
    const tgt = isLast ? c.lastSetPoints : target;
    const hi = Math.max(x, y), lo = Math.min(x, y);
    if (hi < tgt) return `Set ${i + 1}: nadie llegó a ${tgt}.`;
    if (hi - lo < 2) return `Set ${i + 1}: debe ganarse por 2 puntos de diferencia.`;
    if (hi > tgt && hi - lo !== 2) return `Set ${i + 1}: pasado de ${tgt}, la diferencia debe ser exactamente 2.`;
    if (x > y) h++; else a++;
  }
  if (h < need && a < need) return `Falta definir el partido (alguien debe ganar ${need} sets).`;
  return "";
}

// ---------------------------------------------------------------- posiciones
export function tablePointsFor(m, side, c) {
  const { h, a } = setsWon(m.sets);
  const mine = side === "home" ? h : a, theirs = side === "home" ? a : h;
  const tp = c.tablePoints;
  if (mine > theirs) return theirs === 0 ? tp.winClean : tp.winClose;
  return mine === 0 ? tp.lossClean : tp.lossClose;
}

export function standings(teams, matches, c) {
  const rows = new Map();
  for (const t of teams) rows.set(t.id, {
    team: t, group: t.group_label || "", pj: 0, pg: 0, pp: 0,
    sf: 0, sc: 0, pf: 0, pc: 0, pts: 0,
  });
  const gm = matches.filter(m => m.phase === "grupos" && isDone(m));
  for (const m of gm) {
    const H = rows.get(m.home_team_id), A = rows.get(m.away_team_id);
    if (!H || !A) continue;
    const { h, a, ph, pa } = setsWon(m.sets);
    H.pj++; A.pj++;
    H.sf += h; H.sc += a; A.sf += a; A.sc += h;
    H.pf += ph; H.pc += pa; A.pf += pa; A.pc += ph;
    if (h > a) { H.pg++; A.pp++; } else { A.pg++; H.pp++; }
    H.pts += tablePointsFor(m, "home", c);
    A.pts += tablePointsFor(m, "away", c);
  }
  const byGroup = {};
  for (const r of rows.values()) {
    r.ds = r.sf - r.sc; r.dp = r.pf - r.pc;
    (byGroup[r.group] ||= []).push(r);
  }
  const h2h = (x, y) => {
    const m = gm.find(m => (m.home_team_id === x.team.id && m.away_team_id === y.team.id) ||
                           (m.home_team_id === y.team.id && m.away_team_id === x.team.id));
    if (!m) return 0;
    const w = winnerSide(m, c);
    const winnerId = w === "home" ? m.home_team_id : m.away_team_id;
    return winnerId === x.team.id ? -1 : 1;
  };
  const groups = Object.keys(byGroup).sort();
  for (const g of groups) {
    byGroup[g].sort((x, y) =>
      y.pts - x.pts || y.ds - x.ds || y.dp - x.dp || h2h(x, y) ||
      (x.team.sort_order - y.team.sort_order) || x.team.name.localeCompare(y.team.name));
    byGroup[g].forEach((r, i) => (r.pos = i + 1));
  }
  return { groups, byGroup };
}

export function groupsComplete(matches) {
  const g = matches.filter(m => m.phase === "grupos");
  return g.length > 0 && g.every(isDone);
}

// Clasificados: los k primeros de cada grupo + mejores (k+1)-ésimos hasta completar Q.
export function qualifiers(st, Q) {
  const G = st.groups.length;
  if (!G) return [];
  const k = Math.min(Math.floor(Q / G), Math.max(...st.groups.map(g => st.byGroup[g].length)));
  const direct = [], extra = [];
  for (const g of st.groups) {
    st.byGroup[g].forEach(r => {
      if (r.pos <= k) direct.push(r);
      else if (r.pos === k + 1) extra.push(r);
    });
  }
  const cmp = (x, y) => x.pos - y.pos || y.pts - x.pts || y.ds - x.ds || y.dp - x.dp ||
    x.team.name.localeCompare(y.team.name);
  extra.sort(cmp);
  const list = direct.concat(extra.slice(0, Math.max(0, Q - direct.length)));
  list.sort(cmp);
  return list.map((r, i) => ({ ...r, seed: i + 1 }));
}

// ---------------------------------------------------------------- fixture
// Round robin (método del círculo). Devuelve rondas con pares de índices.
export function roundRobin(n) {
  const t = [...Array(n).keys()];
  if (n % 2) t.push(-1);
  const N = t.length, rounds = [];
  for (let r = 0; r < N - 1; r++) {
    const pairs = [];
    for (let i = 0; i < N / 2; i++) {
      let a = t[i], b = t[N - 1 - i];
      if (a === -1 || b === -1) continue;
      if (r % 2 === 1 && i === 0) [a, b] = [b, a];
      pairs.push([a, b]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}

function toMin(hhmm) { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return h * 60 + (m || 0); }

// Genera los turnos (fecha+minuto) disponibles según los días configurados.
export function buildSlots(c, durMin, fromIndex = 0, afterTs = null) {
  const out = [];
  c.days.forEach((d, di) => {
    if (!d.date) return;
    const s = toMin(d.start), e = toMin(d.end || "23:59");
    for (let t = s; t + durMin <= e; t += durMin) out.push({ day: di, date: d.date, min: t });
  });
  return out;
}

export function slotISO(date, min, tz) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0"), mm = String(min % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00${tz}`;
}

// Genera partidos de fase de grupos con horario y cancha.
export function generateGroupFixture(teams, c, tz) {
  const groups = {};
  teams.forEach(t => { if (t.group_label) (groups[t.group_label] ||= []).push(t); });
  const gl = Object.keys(groups).sort();
  gl.forEach(g => groups[g].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
  const queue = [];
  const rr = Object.fromEntries(gl.map(g => [g, roundRobin(groups[g].length)]));
  const maxR = Math.max(0, ...gl.map(g => rr[g].length));
  for (let r = 0; r < maxR; r++)
    for (const g of gl)
      for (const [a, b] of rr[g][r] || [])
        queue.push({ group: g, round: r + 1, home: groups[g][a], away: groups[g][b] });

  const C = c.courts.length || 1;
  const slots = buildSlots(c, c.groupMatchMin);
  const out = [];
  let prev = new Set(), si = 0, n = 0;
  while (queue.length) {
    const slot = slots[si] || null;
    const busy = new Set(), picked = [];
    for (const relax of [false, true]) {
      for (let i = 0; i < queue.length && picked.length < C; i++) {
        const q = queue[i];
        const ids = [q.home.id, q.away.id];
        if (ids.some(x => busy.has(x))) continue;
        if (!relax && ids.some(x => prev.has(x))) continue;
        picked.push(q); ids.forEach(x => busy.add(x));
        queue.splice(i, 1); i--;
      }
      if (picked.length) break;
    }
    picked.forEach((q, ci) => {
      n++;
      out.push({
        code: `G${n}`, phase: "grupos", group_label: q.group, round: q.round,
        court: c.courts[ci] || `Cancha ${ci + 1}`,
        scheduled_at: slot ? slotISO(slot.date, slot.min, tz) : null,
        home_team_id: q.home.id, away_team_id: q.away.id,
        sets: [], status: "pendiente", sort_order: n,
      });
    });
    prev = busy; si++;
  }
  return out;
}

const SEED_ORDER = {
  2: [1, 2], 4: [1, 4, 2, 3], 8: [1, 8, 4, 5, 2, 7, 3, 6],
  16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
};
const PHASE_BY_SIZE = { 16: "octavos", 8: "cuartos", 4: "semifinal", 2: "final" };
const CODE_PREFIX = { octavos: "O", cuartos: "C", semifinal: "S" };

// Genera la llave de eliminación a partir de los clasificados sembrados.
export function generateKnockout(quals, c, tz, startISO) {
  const Q = quals.length;
  const order = SEED_ORDER[Q];
  if (!order) throw new Error("La llave debe tener 2, 4, 8 o 16 equipos.");
  const bySeed = Object.fromEntries(quals.map(q => [q.seed, q.team]));
  const C = c.courts.length || 1;
  const out = [];
  let size = Q, prevCodes = null, n = 0;
  let cursor = startISO ? new Date(startISO) : null;
  const iso = d => d ? toLocalISO(d, tz) : null;
  const addMin = (d, m) => d ? new Date(d.getTime() + m * 60000) : null;

  while (size >= 2) {
    const phase = PHASE_BY_SIZE[size];
    const games = size / 2;
    const codes = [];
    const roundMatches = [];
    for (let i = 0; i < games; i++) {
      const code = phase === "final" ? "F" : `${CODE_PREFIX[phase]}${i + 1}`;
      codes.push(code);
      const m = { code, phase, sets: [], status: "pendiente", court: null, scheduled_at: null };
      if (!prevCodes) {
        m.home_team_id = bySeed[order[2 * i]].id; m.away_team_id = bySeed[order[2 * i + 1]].id;
      } else {
        m.home_source = `W:${prevCodes[2 * i]}`; m.away_source = `W:${prevCodes[2 * i + 1]}`;
      }
      roundMatches.push(m);
    }
    if (phase === "final" && c.thirdPlace && prevCodes) {
      roundMatches.unshift({ code: "3P", phase: "tercero", sets: [], status: "pendiente",
        home_source: `L:${prevCodes[0]}`, away_source: `L:${prevCodes[1]}` });
    }
    // horario: tercer puesto y final van solos, uno tras otro
    if (phase === "final") {
      for (const m of roundMatches) {
        m.court = c.courts[0]; m.scheduled_at = iso(cursor); cursor = addMin(cursor, c.koMatchMin);
      }
    } else {
      roundMatches.forEach((m, i) => {
        const slot = Math.floor(i / C);
        m.court = c.courts[i % C];
        m.scheduled_at = iso(addMin(cursor, slot * c.koMatchMin));
      });
      cursor = addMin(cursor, Math.ceil(games / C) * c.koMatchMin);
    }
    roundMatches.forEach(m => { n++; m.sort_order = 1000 + n; out.push(m); });
    prevCodes = codes;
    size /= 2;
  }
  return out;
}

export function toLocalISO(d, tz) {
  const sign = tz.startsWith("-") ? -1 : 1;
  const [oh, om] = tz.slice(1).split(":").map(Number);
  const off = sign * (oh * 60 + om);
  const local = new Date(d.getTime() + off * 60000);
  return local.toISOString().slice(0, 19) + tz;
}

// Resuelve equipos de partidos que dependen de otros (W:C1 / L:S1).
export function resolveTeams(matches, c) {
  const byCode = Object.fromEntries(matches.filter(m => m.code).map(m => [m.code, m]));
  const memo = new Map();
  const teamOf = (src, depth = 0) => {
    if (!src || depth > 10) return null;
    const [kind, code] = src.split(":");
    const m = byCode[code];
    if (!m) return null;
    const { home, away } = sides(m, depth + 1);
    const w = winnerSide(m, c);
    if (!w || !home || !away) return null;
    if (kind === "W") return w === "home" ? home : away;
    return w === "home" ? away : home;
  };
  const sides = (m, depth = 0) => {
    if (memo.has(m)) return memo.get(m);
    const r = { home: m.home_team_id || teamOf(m.home_source, depth), away: m.away_team_id || teamOf(m.away_source, depth) };
    memo.set(m, r);
    return r;
  };
  return matches.map(m => { const s = sides(m); return { ...m, _home: s.home, _away: s.away }; });
}

export function sourceLabel(src) {
  if (!src) return "Por definir";
  const [k, code] = src.split(":");
  return `${k === "W" ? "Ganador" : "Perdedor"} ${code}`;
}

// Podio
export function podium(resolved, c) {
  const f = resolved.find(m => m.phase === "final");
  const t = resolved.find(m => m.phase === "tercero");
  const out = { first: null, second: null, third: null };
  if (f && winnerSide(f, c)) {
    const w = winnerSide(f, c);
    out.first = w === "home" ? f._home : f._away;
    out.second = w === "home" ? f._away : f._home;
  }
  if (t && winnerSide(t, c)) out.third = winnerSide(t, c) === "home" ? t._home : t._away;
  return out;
}

export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
