// Datos de prueba para MODO DEMO (solo si no hay Supabase configurado).
import * as db from "./data.js?v=20261111c";
import { DEFAULT_CONFIG, generateGroupFixture } from "./logic.js?v=20261111c";
import { TZ_OFFSET } from "./config.js?v=20261111c";

export const VOLEY_2026_TEAMS = [
  ["GALACTICOS", "A"], ["TEAM ELITE", "A"], ["COLPAI VOLEY", "A"], ["FLEX ZONE", "A"], ["LOS MISMOS", "A"],
  ["TEAM PALMA", "B"], ["FENIX VOLEY", "B"], ["LOS AMIGOS DE CHAPA", "B"], ["LA ESQUINA BISTRO", "B"], ["KIRK VAN VOLEY", "B"],
  ["TALENTO EN PAUSA", "C"], ["TINA VOLEY", "C"], ["LOS CUMBES", "C"], ["PONYS SALVAJES", "C"], ["MALAS RODILLAS", "C"],
];

export async function seedDemoIfEmpty() {
  if (!db.DEMO || db.demoHasData()) return;
  const config = {
    ...DEFAULT_CONFIG,
    days: [{ date: "2026-11-14", start: "17:00", end: "22:00" }, { date: "2026-11-15", start: "08:00", end: "22:00" }],
    rules: "Cada equipo inscribe 5 jugadores y juegan 4.\nEn todo momento debe haber en cancha al menos 1 hombre y 1 mujer.\nW.O.: 10 minutos de espera; pierde 2-0 (15-0, 15-0).",
  };
  const t = await db.createTournament({ slug: "voley-playa-2026", name: "Torneo Relámpago Vóley Playa 2026", sport: "Vóley playa", location: "Tesalia, Huila", status: "en_curso", config });
  const teams = await db.createTeams(VOLEY_2026_TEAMS.map(([name, g], i) => ({ tournament_id: t.id, name, group_label: g, sort_order: i + 1 })));
  const fx = generateGroupFixture(teams, config, TZ_OFFSET).map(m => ({ ...m, tournament_id: t.id }));
  // resultados de ejemplo en los primeros 9 partidos, uno en juego
  const sample = [[[15, 11], [15, 9]], [[13, 15], [15, 12], [15, 10]], [[9, 15], [11, 15]], [[15, 13], [17, 15]], [[15, 8], [12, 15], [13, 15]]];
  fx.forEach((m, i) => { if (i < 9) { m.sets = sample[i % sample.length]; m.status = "finalizado"; } if (i === 9 || i === 10) { m.sets = [[15, 12], [6, 4]]; m.status = "en_juego"; } });
  await db.createMatches(fx);
}
