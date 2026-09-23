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
 * Genera (o regenera) el checklist de cumplimiento de un establecimiento:
 * un documento en `cumplimiento` por cada trámite que le corresponde,
 * en estado "pendiente" si es la primera vez que se detecta.
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

  // Traemos el checklist existente para no pisar estados ya cargados por el usuario.
  const existQ = query(
    collection(db, "cumplimiento"),
    where("establecimiento_ref", "==", establecimientoId)
  );
  const existSnap = await getDocs(existQ);
  const existentesPorTramite = new Map(
    existSnap.docs.map((d) => [d.data().tramite_ref, { id: d.id, ...d.data() }])
  );

  const batch = writeBatch(db);
  const idsVigentes = new Set(tramites.map((t) => t.id));

  tramites.forEach((tramite) => {
    const previo = existentesPorTramite.get(tramite.id);
    if (previo) return; // ya existe, no lo tocamos (conserva estado cargado)
    const ref = doc(collection(db, "cumplimiento"));
    batch.set(ref, {
      establecimiento_ref: establecimientoId,
      tramite_ref: tramite.id,
      estado: "pendiente",
      fecha_vencimiento: null,
      observaciones: "",
      creado: serverTimestamp(),
    });
  });

  // Marca como "no aplica" los que existían pero ya no corresponden
  // (por ejemplo si el establecimiento actualizó sus respuestas).
  existSnap.docs.forEach((d) => {
    const data = d.data();
    if (!idsVigentes.has(data.tramite_ref) && data.estado !== "no aplica") {
      batch.update(d.ref, { estado: "no aplica" });
    }
  });

  await batch.commit();
  return temas;
}
