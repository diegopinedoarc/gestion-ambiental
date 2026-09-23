"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * A partir de las respuestas del wizard de onboarding, devuelve el array
 * de temas_ambientales (ids) que quedaron "activados" para el establecimiento.
 */
export function detectarTemas(datos) {
  const temas = new Set();

  if (datos.generaResiduosPeligrosos) temas.add("residuos_peligrosos");
  if (datos.generaResiduosEspeciales) temas.add("residuos_especiales");
  if (datos.vuelcaEfluentes || Number(datos.consumoAguaM3Dia) >= 50) {
    temas.add("efluentes_liquidos");
  }
  if (datos.tieneEmisionesGaseosas) temas.add("emisiones_gaseosas");
  // Si el establecimiento es nuevo, o no tiene aún su habilitación/categorización,
  // siempre le aplica el tema de habilitación industrial.
  if (datos.situacion === "nuevo" || !datos.tieneHabilitacionVigente) {
    temas.add("habilitacion_industrial");
  }

  return Array.from(temas);
}

/**
 * Busca en Firestore los trámites cuyo tema_ref esté entre los temas detectados.
 * Firestore permite hasta 30 valores en una cláusula "in", así que con 5 temas
 * posibles no hay problema.
 */
export async function buscarTramitesPorTemas(temaIds) {
  if (!temaIds.length) return [];
  const q = query(collection(db, "tramites"), where("tema_ref", "in", temaIds));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Trae todas las normativas relacionadas a una lista de ids de normativa. */
export async function buscarNormativasPorIds(normativaIds) {
  const ids = Array.from(new Set(normativaIds));
  const resultados = [];
  // getDoc individual: simple y suficiente para el volumen actual de normas.
  for (const id of ids) {
    const snap = await getDoc(doc(db, "normativas", id));
    if (snap.exists()) resultados.push({ id: snap.id, ...snap.data() });
  }
  return resultados;
}

/**
 * Dado el municipio (jurisdiccion_ref) de un establecimiento, devuelve todos
 * los ids de jurisdicción que efectivamente le aplican: nación, el municipio
 * mismo, la provincia a la que pertenece, y — si corresponde — una autoridad
 * interjurisdiccional que lo abarque (ej: ACUMAR para los municipios de la
 * Cuenca Matanza-Riachuelo), marcada en el documento del municipio con el
 * campo `cuenca_ref`.
 *
 * Esto es lo que permite que un trámite municipal de Tigre no le aparezca a
 * una empresa de Lanús, y viceversa, aunque ambos trámites compartan el
 * mismo tema ambiental.
 */
export async function jurisdiccionesAplicables(jurisdiccionMunicipioId) {
  const ids = new Set(["nacion"]);
  if (!jurisdiccionMunicipioId) return Array.from(ids);
  ids.add(jurisdiccionMunicipioId);

  const snap = await getDoc(doc(db, "jurisdicciones", jurisdiccionMunicipioId));
  if (snap.exists()) {
    const data = snap.data();
    if (data.provincia_ref) ids.add(data.provincia_ref);
    if (data.cuenca_ref) ids.add(data.cuenca_ref);
  }
  return Array.from(ids);
}

/**
 * Trae las reglas documentadas (colección `reglas`) para un conjunto de
 * trámites, indexadas por `tramite_ref`. No todos los trámites tienen una
 * regla todavía: los que no la tienen usan el comportamiento heredado (ver
 * `generarChecklist`).
 */
export async function buscarReglasPorTramites(tramiteIds) {
  const ids = Array.from(new Set(tramiteIds));
  if (!ids.length) return new Map();
  const CHUNK = 30; // límite de Firestore para cláusulas "in"
  const reglas = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const q = query(collection(db, "reglas"), where("tramite_ref", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => reglas.push({ id: d.id, ...d.data() }));
  }
  return new Map(reglas.map((r) => [r.tramite_ref, r]));
}

function evaluarCondicionSimple(cond, datos) {
  const valor = datos[cond.campo];
  if (valor === undefined || valor === null || valor === "") return "sin_respuesta";
  switch (cond.operador) {
    case "eq":
      return valor === cond.valor ? "cumplida" : "no_cumplida";
    case "neq":
      return valor !== cond.valor ? "cumplida" : "no_cumplida";
    case "gte":
      return Number(valor) >= Number(cond.valor) ? "cumplida" : "no_cumplida";
    case "lte":
      return Number(valor) <= Number(cond.valor) ? "cumplida" : "no_cumplida";
    default:
      return "no_cumplida";
  }
}

// Una condición puede ser simple (un campo) o del tipo "or" (alguna de
// varias opciones alcanza). El "or" se resuelve como cumplida en cuanto una
// opción se cumple, incluso si las demás no tienen respuesta todavía.
function evaluarCondicion(cond, datos) {
  if (cond.tipo === "or") {
    const estados = cond.opciones.map((o) => evaluarCondicionSimple(o, datos));
    if (estados.some((e) => e === "cumplida")) return "cumplida";
    if (estados.every((e) => e === "no_cumplida")) return "no_cumplida";
    return "sin_respuesta";
  }
  return evaluarCondicionSimple(cond, datos);
}

/**
 * Evalúa una regla documentada contra los datos declarados por el
 * establecimiento.
 *  - "aplica": todas las condiciones se cumplen.
 *  - "no_aplica": alguna condición está definitivamente incumplida (aunque
 *    falten otros datos, ya no puede terminar en "aplica").
 *  - "requiere_revision": ninguna condición falla, pero falta algún dato
 *    para confirmar que todas se cumplen (ej: preguntas de alcance nacional
 *    que el cuestionario todavía no hace).
 */
export function evaluarRegla(regla, datos) {
  const condiciones_cumplidas = [];
  const condiciones_sin_respuesta = [];
  let algunaNoCumplida = false;

  for (const cond of regla.condiciones) {
    const estado = evaluarCondicion(cond, datos);
    if (estado === "cumplida") {
      condiciones_cumplidas.push(cond.descripcion);
    } else if (estado === "no_cumplida") {
      algunaNoCumplida = true;
    } else {
      condiciones_sin_respuesta.push(cond.descripcion);
    }
  }

  let resultado;
  if (algunaNoCumplida) resultado = "no_aplica";
  else if (condiciones_sin_respuesta.length > 0) resultado = "requiere_revision";
  else resultado = "aplica";

  return { resultado, condiciones_cumplidas, condiciones_sin_respuesta };
}

// Campos de `datos` que efectivamente participan de las condiciones de una
// regla, para guardar solo eso como snapshot en `datos_evaluados` (y no el
// establecimiento entero).
function camposDeRegla(regla) {
  const campos = new Set();
  regla.condiciones.forEach((cond) => {
    if (cond.tipo === "or") {
      cond.opciones.forEach((o) => campos.add(o.campo));
    } else {
      campos.add(cond.campo);
    }
  });
  return Array.from(campos);
}

/**
 * Genera (o regenera) el checklist de cumplimiento de un establecimiento:
 * un documento en `cumplimiento` por cada trámite que le corresponde.
 *
 * Separa dos cosas que antes estaban mezcladas: `resultado` (aplica /
 * no_aplica / requiere_revision, lo que dice la evaluación normativa) y
 * `estado` (pendiente / en trámite / vigente, lo que hizo la empresa). Cada
 * corrida recalcula `resultado` y guarda de qué regla y con qué datos salió,
 * pero nunca pisa el `estado` de gestión que ya haya cargado la empresa
 * (salvo para reactivar un trámite que había quedado en "no aplica" y ahora
 * vuelve a corresponder).
 */
export async function generarChecklist(establecimientoId, datosEstablecimiento) {
  const temas = detectarTemas(datosEstablecimiento);
  const candidatos = await buscarTramitesPorTemas(temas);

  // Filtramos por jurisdicción: un trámite sólo aplica si es nacional, de la
  // provincia del municipio, del municipio mismo, o de una autoridad
  // interjurisdiccional (ACUMAR, etc.) que abarque a ese municipio.
  const jurisdiccionesOk = await jurisdiccionesAplicables(
    datosEstablecimiento.jurisdiccion_ref
  );
  const tramites = candidatos.filter((t) =>
    jurisdiccionesOk.includes(t.jurisdiccion_ref)
  );

  const reglasPorTramite = await buscarReglasPorTramites(tramites.map((t) => t.id));

  // Traemos el checklist existente para no pisar estados ya cargados por el usuario.
  const existQ = query(
    collection(db, "cumplimiento"),
    where("establecimiento_ref", "==", establecimientoId)
  );
  const existSnap = await getDocs(existQ);
  const existentesPorTramite = new Map(
    existSnap.docs.map((d) => [d.data().tramite_ref, { id: d.id, ref: d.ref, ...d.data() }])
  );

  const batch = writeBatch(db);
  const idsEvaluados = new Set();

  tramites.forEach((tramite) => {
    idsEvaluados.add(tramite.id);
    const regla = reglasPorTramite.get(tramite.id);

    // Trámites sin regla documentada todavía: se conserva el comportamiento
    // previo (tema + jurisdicción coinciden → aplica). `regla_id: null`
    // deja explícito en el dato cuál resultado está respaldado por una
    // regla verificable y cuál todavía no.
    const evaluacion = regla
      ? evaluarRegla(regla, datosEstablecimiento)
      : { resultado: "aplica", condiciones_cumplidas: [], condiciones_sin_respuesta: [] };

    const datos_evaluados = {};
    if (regla) {
      camposDeRegla(regla).forEach((campo) => {
        datos_evaluados[campo] = datosEstablecimiento[campo] ?? null;
      });
    }

    const camposResultado = {
      resultado: evaluacion.resultado,
      regla_id: regla?.id || null,
      version_regla: regla?.version || null,
      datos_evaluados,
      condiciones_cumplidas: evaluacion.condiciones_cumplidas,
      condiciones_sin_respuesta: evaluacion.condiciones_sin_respuesta,
      fecha_evaluacion: serverTimestamp(),
    };

    const previo = existentesPorTramite.get(tramite.id);

    if (evaluacion.resultado === "no_aplica") {
      // No corresponde: si ya había un ítem de gestión se marca "no aplica"
      // conservando su historial; si no existía, no se crea nada nuevo.
      if (previo) {
        const cambios = { ...camposResultado };
        if (previo.estado !== "no aplica") cambios.estado = "no aplica";
        batch.update(previo.ref, cambios);
      }
      return;
    }

    if (previo) {
      const cambios = { ...camposResultado };
      // Si había quedado "no aplica" en una evaluación anterior y ahora
      // vuelve a corresponder, se reabre como pendiente.
      if (previo.estado === "no aplica") cambios.estado = "pendiente";
      batch.update(previo.ref, cambios);
    } else {
      const ref = doc(collection(db, "cumplimiento"));
      batch.set(ref, {
        establecimiento_ref: establecimientoId,
        tramite_ref: tramite.id,
        estado: "pendiente",
        fecha_obtencion: null,
        fecha_vencimiento: null,
        observaciones: "",
        creado: serverTimestamp(),
        ...camposResultado,
      });
    }
  });

  // Marca como "no aplica" los que existían pero el trámite ya ni siquiera
  // es candidato (cambió el tema o la jurisdicción del establecimiento).
  existSnap.docs.forEach((d) => {
    const data = d.data();
    if (!idsEvaluados.has(data.tramite_ref) && data.estado !== "no aplica") {
      batch.update(d.ref, { estado: "no aplica", resultado: "no_aplica" });
    }
  });

  await batch.commit();
  return temas;
}
