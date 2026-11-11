# Torneos Tesalia

Plataforma para organizar torneos (fixture, resultados en vivo, posiciones, llave) con página pública.

- `index.html` — lista pública de torneos
- `torneo.html?t=<slug>` — página pública del torneo (se actualiza sola cada 20 s)
- `admin.html` — panel del organizador (requiere usuario de Supabase autorizado)
- `supabase/schema.sql` — base de datos y reglas de seguridad (ejecutar una vez)
- `supabase/seed_voley_2026.sql` — carga el torneo de vóley playa 2026
- `js/config.js` — URL y llave pública de Supabase (vacías = modo demo)

Datos privados (jugadores, documentos, celulares, pagos) solo los ve el organizador.
