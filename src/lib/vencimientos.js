// Utilidades para fechas de vencimiento de trámites.

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * A partir de la periodicidad de un trámite, sugiere una fecha de
 * vencimiento contada desde `desde` (por defecto, hoy).
 * Devuelve un string "YYYY-MM-DD", o null si el trámite es de una sola vez
 * (no tiene sentido sugerirle vencimiento).
 *
 * Es sólo un punto de partida editable: el plazo real lo fija el organismo
 * en el certificado/resolución que le otorga a la empresa.
 */
export function sugerirVencimiento(periodicidad, desde = new Date()) {
  if (!periodicidad) return null;
  const p = periodicidad.toLowerCase();
  if (p.startsWith("única vez") || p.startsWith("unica vez")) return null;

  const fecha = new Date(desde.getTime() + UN_ANIO_MS);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Días que faltan para el vencimiento (negativo si ya venció).
 * Devuelve null si no hay fecha cargada.
 */
export function diasParaVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + "T00:00:00");
  return Math.round((venc - hoy) / (24 * 60 * 60 * 1000));
}

/**
 * Con cuántos días de anticipación avisar del vencimiento de un trámite en
 * particular ("alertas configurables"). Se resuelve en tres niveles, del más
 * específico al más genérico:
 *   1. `cumplimiento.dias_aviso`: la propia empresa lo pisó para su caso.
 *   2. `tramite.dias_aviso_default`: vos (admin) definiste un valor para ese
 *      trámite porque es más o menos crítico que el resto (ej: una
 *      habilitación que si vence te clausuran vs. una renovación de trámite).
 *   3. 30 días, si nadie definió nada — el comportamiento de siempre.
 */
export function resolverDiasAviso(cumplimiento, tramite) {
  if (cumplimiento?.dias_aviso != null) return Number(cumplimiento.dias_aviso);
  if (tramite?.dias_aviso_default != null) return Number(tramite.dias_aviso_default);
  return 30;
}

/**
 * Devuelve { texto, tono } para mostrar como alerta junto a la fecha, o
 * null si no hay nada que avisar (falta la fecha, o falta mucho todavía).
 * tono: "vencido" | "porVencer"
 */
export function alertaVencimiento(fechaVencimiento, diasAviso = 30) {
  const dias = diasParaVencimiento(fechaVencimiento);
  if (dias === null) return null;
  if (dias < 0) {
    const abs = Math.abs(dias);
    return { texto: `Vencido hace ${abs} día${abs === 1 ? "" : "s"}`, tono: "vencido" };
  }
  if (dias <= diasAviso) {
    return {
      texto: dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`,
      tono: "porVencer",
    };
  }
  return null;
}
