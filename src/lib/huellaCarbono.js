"use client";

import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Cálculo de huella de carbono según la metodología del GHG Protocol:
 * alcance 1 (emisiones directas — combustión de combustibles en el propio
 * establecimiento) y alcance 2 (emisiones indirectas — electricidad
 * comprada a la red). No calcula alcance 3 (cadena de valor: proveedores,
 * transporte de terceros, etc.) — queda fuera de esta primera versión.
 *
 * Los factores de emisión (cuánto CO2 equivalente representa cada litro de
 * combustible o kWh consumido) NO están hardcodeados acá a propósito:
 * cambian con el tiempo (sobre todo el de electricidad, que depende de la
 * matriz energética de cada año) y hace falta una fuente oficial citable
 * para un trabajo de tesis. Se cargan y actualizan en la colección
 * `factores_emision` (mismo patrón que `reglas`/`normativas`: administrados
 * por consola, con su fuente).
 */

/** Trae todos los factores de emisión cargados (`factores_emision`). */
export async function buscarFactoresEmision() {
  const snap = await getDocs(collection(db, "factores_emision"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Calcula las emisiones a partir de las cantidades consumidas.
 * `cantidades`: { [factorId]: cantidadConsumida }
 * `factores`: lista de factores_emision (ver `buscarFactoresEmision`)
 *
 * Devuelve el detalle ítem por ítem (para poder mostrar de dónde sale cada
 * número, igual que el resto de la app hace con "¿por qué aparece?") y los
 * totales por alcance, en toneladas de CO2 equivalente (tCO2e).
 */
export function calcularHuella(cantidades, factores) {
  const detalle = [];
  let scope1Kg = 0;
  let scope2Kg = 0;

  factores.forEach((f) => {
    const cantidad = Number(cantidades[f.id]);
    if (!cantidad || cantidad <= 0) return;
    const factor = Number(f.factor_kgco2_por_unidad) || 0;
    const emisionesKg = cantidad * factor;
    const esElectricidad = f.combustible === "electricidad";

    detalle.push({
      factorId: f.id,
      nombre: f.nombre,
      cantidad,
      unidad: f.unidad,
      factor_kgco2_por_unidad: factor,
      fuente: f.fuente || null,
      alcance: esElectricidad ? 2 : 1,
      emisiones_kg: emisionesKg,
    });

    if (esElectricidad) scope2Kg += emisionesKg;
    else scope1Kg += emisionesKg;
  });

  return {
    scope1_tco2e: scope1Kg / 1000,
    scope2_tco2e: scope2Kg / 1000,
    total_tco2e: (scope1Kg + scope2Kg) / 1000,
    detalle,
  };
}

/**
 * Guarda el cálculo de un período (año) para un establecimiento. Se guarda
 * el `resultado` y el detalle de factores usados como snapshot (no una
 * referencia a `factores_emision`), para que si el factor de electricidad
 * se actualiza el año que viene, los cálculos de años anteriores no
 * cambien retroactivamente.
 */
export async function guardarHuella(establecimientoId, periodo, cantidades, resultado) {
  const ref = doc(db, "establecimientos", establecimientoId, "huella_carbono", periodo);
  await setDoc(ref, {
    periodo,
    cantidades,
    resultado,
    calculado: serverTimestamp(),
  });
}

/** Historial de huellas calculadas de un establecimiento, más reciente primero. */
export async function buscarHuellas(establecimientoId) {
  const snap = await getDocs(
    collection(db, "establecimientos", establecimientoId, "huella_carbono")
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
}
