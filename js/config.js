// Configuración de conexión a Supabase.
// La URL y la "anon/publishable key" son públicas por diseño: la seguridad
// la dan las reglas (RLS) de la base de datos, no esta llave.
// Si se dejan vacías, la plataforma funciona en MODO DEMO (datos de prueba en el navegador).
export const SUPABASE_URL = "https://ovxkapvoiydqsymthgyo.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Om-PA3oKCU5dVGd7JBJE8A_eD8mX3BH";

export const SITE_NAME = "Torneos Tesalia";
export const TZ_OFFSET = "-05:00"; // Hora de Colombia
