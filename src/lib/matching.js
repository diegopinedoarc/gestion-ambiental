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

// Guarda un snapshot de la evaluación en la subcolección
// `cumplimiento/{id}/evaluaciones`, sin pisar nada: cada recálculo agrega un
// documento nuevo. Es lo que permite reconstruir después qué cambió entre
// una corrida y la siguiente (ver historial en el detalle del trámite).
function registrarEvaluacion(batch, cumplimientoRef, snapshot) {
  const evRef = doc(collection(cumplimientoRef, "evaluaciones"));
  batch.set(evRef, { ...snapshot, fecha: serverTimestamp() });
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
 * Corazón del matching, sin escribir nada todavía: para cada trámite
 * candidato (tema + jurisdicción) calcula su evaluación y la compara contra
 * el `cumplimiento` que ya existiera para ese trámite. `generarChecklist` y
 * `simularCambios` parten de acá — uno para aplicar los cambios, el otro
 * para mostrarlos antes de confirmar (ver componente de comparación en
 * `dashboard/editar`).
 */
async function calcularEvaluaciones(establecimientoId, datosEstablecimiento) {
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

  const idsEvaluados = new Set();
  const evaluados = [];

  tramites.forEach((tramite) => {
    idsEvaluados.add(tramite.id);
    const regla = reglasPorTramite.get(tramite.id);

    // Trámites sin regla documentada todavía: sin una condición verificable
    // no hay fundamento para publicarlos como obligación confirmada, así que
    // quedan en "requiere_revision" (se muestran como "por confirmar", no
    // como un trámite ya identificado) hasta que se documente y apruebe la
    // regla correspondiente. `regla_id: null` deja explícito en el dato que
    // ese resultado todavía no está respaldado por una regla verificable.
    const evaluacion = regla
      ? evaluarRegla(regla, datosEstablecimiento)
      : { resultado: "requiere_revision", condiciones_cumplidas: [], condiciones_sin_respuesta: [] };

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
      // Copiados de la regla al momento de evaluar (no solo la referencia):
      // así el panel "¿por qué aparece?" no depende de leer `reglas` de
      // nuevo, y conserva el texto que estaba vigente en ese momento aunque
      // la regla se edite después.
      regla_descripcion: regla?.descripcion || null,
      regla_articulos: regla?.articulos || null,
      regla_norma_ref: regla?.norma_ref || null,
      datos_evaluados,
      condiciones_cumplidas: evaluacion.condiciones_cumplidas,
      condiciones_sin_respuesta: evaluacion.condiciones_sin_respuesta,
    };

    evaluados.push({ tramite, camposResultado, previo: existentesPorTramite.get(tramite.id) || null });
  });

  // Los que existían pero el trámite ya ni siquiera es candidato (cambió el
  // tema o la jurisdicción del establecimiento) — se marcan "no aplica".
  const huerfanos = existSnap.docs
    .filter((d) => !idsEvaluados.has(d.data().tramite_ref) && d.data().estado !== "no aplica")
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

  return { temas, evaluados, huerfanos };
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
  const { temas, evaluados, huerfanos } = await calcularEvaluaciones(
    establecimientoId,
    datosEstablecimiento
  );

  const batch = writeBatch(db);

  evaluados.forEach(({ tramite, camposResultado, previo }) => {
    const conFecha = { ...camposResultado, fecha_evaluacion: serverTimestamp() };

    if (camposResultado.resultado === "no_aplica") {
      // No corresponde: si ya había un ítem de gestión se marca "no aplica"
      // conservando su historial; si no existía, no se crea nada nuevo.
      if (previo) {
        const cambios = { ...conFecha };
        if (previo.estado !== "no aplica") cambios.estado = "no aplica";
        batch.update(previo.ref, cambios);
        registrarEvaluacion(batch, previo.ref, conFecha);
      }
      return;
    }

    if (previo) {
      const cambios = { ...conFecha };
      // Si había quedado "no aplica" en una evaluación anterior y ahora
      // vuelve a corresponder, se reabre como pendiente.
      if (previo.estado === "no aplica") cambios.estado = "pendiente";
      batch.update(previo.ref, cambios);
      registrarEvaluacion(batch, previo.ref, conFecha);
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
        ...conFecha,
      });
      registrarEvaluacion(batch, ref, conFecha);
    }
  });

  huerfanos.forEach((h) => {
    const camposResultado = { resultado: "no_aplica" };
    batch.update(h.ref, { estado: "no aplica", ...camposResultado });
    registrarEvaluacion(batch, h.ref, {
      ...camposResultado,
      regla_id: h.regla_id || null,
      condiciones_cumplidas: [],
      condiciones_sin_respuesta: [],
      datos_evaluados: {},
      fecha_evaluacion: serverTimestamp(),
    });
  });

  await batch.commit();
  return temas;
}

// Etiqueta corta y legible para una fila de la vista de comparación:
// distingue "no identificado" (resultado no_aplica), "por confirmar"
// (requiere_revision) y el estado de gestión normal (pendiente / en trámite
// / vigente / vencido) cuando la regla sí está documentada y se cumple.
function etiquetaCumplimiento(resultado, estado) {
  if (resultado === "no_aplica") return "No identificado";
  if (resultado === "requiere_revision") return `${estado} · por confirmar`;
  return estado;
}

/**
 * Simula qué cambiaría si se confirmaran estos `datosEstablecimiento`, sin
 * escribir nada en Firestore. Devuelve solo las filas donde algo realmente
 * cambia (mismo criterio que después aplica `generarChecklist`), para
 * mostrar una tabla Antes → Después → Acción antes de que la empresa
 * confirme una edición.
 */
export async function simularCambios(establecimientoId, datosEstablecimiento) {
  const { evaluados, huerfanos } = await calcularEvaluaciones(
    establecimientoId,
    datosEstablecimiento
  );

  const filas = [];

  evaluados.forEach(({ tramite, camposResultado, previo }) => {
    const antes = previo ? etiquetaCumplimiento(previo.resultado, previo.estado) : "No existía";

    let estadoDespues;
    if (camposResultado.resultado === "no_aplica") {
      estadoDespues = "no aplica";
    } else if (!previo || previo.estado === "no aplica") {
      estadoDespues = "pendiente";
    } else {
      estadoDespues = previo.estado;
    }
    const despues = etiquetaCumplimiento(camposResultado.resultado, estadoDespues);

    if (antes === despues) return; // sin cambios: no vale la pena mostrarlo

    let accion;
    if (!previo) {
      accion = "Se agrega al checklist.";
    } else if (camposResultado.resultado === "no_aplica") {
      accion = "Deja de corresponder: se marca \"no aplica\"; conserva certificado, fechas e historial.";
    } else if (previo.estado === "no aplica") {
      accion = "Vuelve a corresponder: se reabre como pendiente, conserva el historial.";
    } else {
      accion = "Cambia el resultado de la evaluación; conserva el estado de gestión.";
    }

    filas.push({ tramiteId: tramite.id, tramiteNombre: tramite.nombre, antes, despues, accion });
  });

  for (const h of huerfanos) {
    const tSnap = await getDoc(doc(db, "tramites", h.tramite_ref));
    const nombre = tSnap.exists() ? tSnap.data().nombre : h.tramite_ref;
    filas.push({
      tramiteId: h.tramite_ref,
      tramiteNombre: nombre,
      antes: etiquetaCumplimiento(h.resultado, h.estado),
      despues: "No identificado",
      accion: "Ya no es candidato (cambió tema o jurisdicción): se marca \"no aplica\", conserva el historial.",
    });
  }

  return filas;
}

// ---------------------------------------------------------------------------
// Producción Limpia: a diferencia de los trámites, acá no hay una obligación
// legal que "aplica" o "no aplica" — son programas voluntarios (típicamente
// provinciales/municipales) a los que una empresa puede sumarse. Por eso el
// matching es más simple (solo tema + jurisdicción, sin evaluar reglas) y el
// seguimiento es de interés/adhesión, no de cumplimiento normativo. Se
// mantiene deliberadamente como un dominio aparte de `cumplimiento` para no
// mezclar "obligatorio por ley" con "voluntario" en la misma colección.
// ---------------------------------------------------------------------------

/**
 * Busca en Firestore los programas de Producción Limpia cuyo tema_ref esté
 * entre los temas detectados. Mismo patrón que `buscarTramitesPorTemas`.
 */
export async function buscarProgramasPLPorTemas(temaIds) {
  if (!temaIds.length) return [];
  const q = query(
    collection(db, "programas_produccion_limpia"),
    where("tema_ref", "in", temaIds)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Genera (o regenera) las "adhesiones" candidatas de un establecimiento a
 * programas de Producción Limpia, con el mismo criterio de tema+jurisdicción
 * que ya usa `calcularEvaluaciones` para trámites. Nunca pisa el `estado`
 * que la empresa ya haya elegido (interesado/en_curso/adherido/descartado);
 * solo agrega programas nuevos como "candidato" y marca como "descartado"
 * (conservando el historial) los que dejaron de corresponder.
 */
export async function sincronizarProgramasPL(establecimientoId, datosEstablecimiento) {
  const temas = detectarTemas(datosEstablecimiento);
  const candidatos = await buscarProgramasPLPorTemas(temas);

  const jurisdiccionesOk = await jurisdiccionesAplicables(
    datosEstablecimiento.jurisdiccion_ref
  );
  const programas = candidatos.filter((p) => jurisdiccionesOk.includes(p.jurisdiccion_ref));

  const existQ = query(
    collection(db, "adhesiones_pl"),
    where("establecimiento_ref", "==", establecimientoId)
  );
  const existSnap = await getDocs(existQ);
  const existentesPorPrograma = new Map(
    existSnap.docs.map((d) => [d.data().programa_ref, { id: d.id, ref: d.ref, ...d.data() }])
  );

  const idsCandidatos = new Set();
  const batch = writeBatch(db);

  programas.forEach((programa) => {
    idsCandidatos.add(programa.id);
    const previo = existentesPorPrograma.get(programa.id);
    if (previo) {
      // Si había quedado "descartado" y el programa vuelve a corresponder
      // (cambió algo del establecimiento), se reabre como candidato.
      if (previo.estado === "descartado") {
        batch.update(previo.ref, { estado: "candidato" });
      }
      return;
    }
    const ref = doc(collection(db, "adhesiones_pl"));
    batch.set(ref, {
      establecimiento_ref: establecimientoId,
      programa_ref: programa.id,
      estado: "candidato",
      observaciones: "",
      creado: serverTimestamp(),
    });
  });

  // Los que ya no son candidatos (cambió tema o jurisdicción) se marcan
  // "descartado" en vez de borrarse, salvo que la empresa ya los haya
  // descartado ella misma.
  existSnap.docs.forEach((d) => {
    const data = d.data();
    if (!idsCandidatos.has(data.programa_ref) && data.estado !== "descartado") {
      batch.update(d.ref, { estado: "descartado" });
    }
  });

  await batch.commit();
}
