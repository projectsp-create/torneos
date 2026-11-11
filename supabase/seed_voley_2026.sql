-- Carga el torneo actual (ejecutar después de schema.sql)
with t as (
  insert into public.tournaments(slug,name,sport,location,status,config)
  values ('voley-playa-2026','Torneo Relámpago Vóley Playa 2026','Vóley playa','Tesalia, Huila','inscripciones',
  $cfg${"bestOf": 3, "groupSetPoints": 15, "koSetPoints": 21, "lastSetPoints": 15, "tablePoints": {"winClean": 3, "winClose": 2, "lossClose": 1, "lossClean": 0}, "qualifiers": 8, "thirdPlace": true, "courts": ["Cancha 1", "Cancha 2"], "days": [{"date": "2026-11-14", "start": "17:00", "end": "22:00"}, {"date": "2026-11-15", "start": "08:00", "end": "22:00"}], "groupMatchMin": 35, "koMatchMin": 50, "koBreakMin": 60, "fee": 130000, "prizes": [50, 30, 20], "playersPerTeam": 5, "playersOnCourt": 4, "rules": "Cada equipo inscribe 5 jugadores; juegan 4 en cancha.\nEn todo momento debe haber en cancha al menos 1 hombre y al menos 1 mujer.\nCambios libres entre sets y en tiempo muerto, respetando la regla de género.\nFase de grupos: mejor de 3 sets a 15 (2 puntos de diferencia).\nEliminatorias: mejor de 3 sets, 21 - 21 - 15.\nDesempate: puntos, diferencia de sets, diferencia de puntos, resultado entre ellos, sorteo.\nW.O.: 10 minutos de espera; pierde 2-0 (15-0, 15-0).\nSi por lesión o expulsión no se cumple la regla de género o quedan menos de 4, el equipo pierde el set en curso."}$cfg$::jsonb)
  on conflict (slug) do update set name=excluded.name
  returning id)
insert into public.teams(tournament_id,name,group_label,sort_order)
select t.id, v.name, v.g, v.o from t, (values
  ('GALACTICOS','A',1),
  ('TEAM ELITE','A',2),
  ('COLPAI VOLEY','A',3),
  ('FLEX ZOOM','A',4),
  ('LOS MISMOS','A',5),
  ('TEAM PALMA','B',6),
  ('FENIX VOLEY','B',7),
  ('LOS AMIGOS DE CHAPA','B',8),
  ('LA ESQUINA BISTRO','B',9),
  ('KIRK VAN VOLEY','B',10),
  ('TALENTO EN PAUSA','C',11),
  ('TINA VOLEY','C',12),
  ('LOS CUMBES','C',13),
  ('PONYS SALVAJES','C',14),
  ('MALAS RODILLAS','C',15)
) as v(name,g,o)
on conflict (tournament_id,name) do nothing;
