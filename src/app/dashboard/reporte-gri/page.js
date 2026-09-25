"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { buscarHuellas } from "@/lib/huellaCarbono";

/**
 * Reporte GRI (Global Reporting Initiative): a diferencia del checklist legal
 * o de Producción Limpia, GRI no es algo que "aplica o no aplica" — es un
 * FORMATO de reporte con una estructura fija de indicadores (Estándares
 * Universales + Estándares Temáticos, acá solo los ambientales: 302 Energía,
 * 303 Agua, 305 Emisiones, 306 Residuos).
 *
 * Esta página arma esos indicadores con datos que la empresa YA cargó en la
 * app (establecimiento, huella de carbono, Producción Limpia, cumplimiento
 * legal) — nunca inventa un número. Un indicador sin dato de base para
 * calcularlo se muestra como "Sin datos suficientes" en vez de omitirse, para
 * que quede claro qué le falta reportar todavía (mismo criterio que ya usa
 * el informe legal con "por confirmar").
 *
 * Igual que /dashboard/informe: se "descarga" con el diálogo de impresión
 * del navegador (Guardar como PDF), no genera el archivo del lado del
 * servidor.
 */
export default function ReporteGriPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [establecimiento, setEstablecimiento] = useState(null);
  const [industria, setIndustria] = useState(null);
  const [huellas, setHuellas] = useState([]);
  const [periodoSel, setPeriodoSel] = useState("");
  const [programasPL, setProgramasPL] = useState([]); // { adhesion, programa }
  const [cumplimientos, setCumplimientos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && perfil && !perfil.establecimiento_ref) {
      router.push("/onboarding");
    }
  }, [loading, user, perfil, router]);

  useEffect(() => {
    async function cargar() {
      if (!perfil?.establecimiento_ref) return;
      setCargando(true);
      const estId = perfil.establecimiento_ref;

      const estSnap = await getDoc(doc(db, "establecimientos", estId));
      const est = estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null;
      setEstablecimiento(est);

      if (est?.industria_ref) {
        const indSnap = await getDoc(doc(db, "industrias", est.industria_ref));
        setIndustria(indSnap.exists() ? indSnap.data() : null);
      }

      const h = await buscarHuellas(estId);
      setHuellas(h);
      setPeriodoSel(h[0]?.periodo || "");

      const adhSnap = await getDocs(
        query(collection(db, "adhesiones_pl"), where("establecimiento_ref", "==", estId))
      );
      const adhesiones = adhSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.estado === "adherido" || a.estado === "en_curso");
      const programasMap = new Map();
      await Promise.all(
        Array.from(new Set(adhesiones.map((a) => a.programa_ref))).map(async (pid) => {
          const s = await getDoc(doc(db, "programas_produccion_limpia", pid));
          if (s.exists()) programasMap.set(pid, { id: s.id, ...s.data() });
        })
      );
      setProgramasPL(
        adhesiones
          .map((adhesion) => ({ adhesion, programa: programasMap.get(adhesion.programa_ref) }))
          .filter((x) => x.programa)
      );

      const cumplSnap = await getDocs(
        query(collection(db, "cumplimiento"), where("establecimiento_ref", "==", estId))
      );
      setCumplimientos(
        cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.estado !== "no aplica")
      );

      setCargando(false);
    }
    if (!loading) cargar();
  }, [loading, perfil]);

  const huella = useMemo(
    () => huellas.find((h) => h.periodo === periodoSel) || null,
    [huellas, periodoSel]
  );

  const cumplimientoResumen = useMemo(() => {
    const vencidos = cumplimientos.filter((c) => c.estado === "vencido").length;
    const total = cumplimientos.length;
    return { vencidos, total };
  }, [cumplimientos]);

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!establecimiento) return null;

  const generado = new Date().toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="no-imprimir mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
          ← Volver al panel
        </Link>
        <div className="flex items-center gap-3">
          {huellas.length > 1 && (
            <label className="flex items-center gap-2 text-sm" style={{ color: "#587168" }}>
              Período de huella:
              <select
                value={periodoSel}
                onChange={(e) => setPeriodoSel(e.target.value)}
                className="rounded-md px-2 py-1"
                style={{ border: "1px solid #DDE6DF" }}
              >
                {huellas.map((h) => (
                  <option key={h.periodo} value={h.periodo}>
                    {h.periodo}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Descargar / Imprimir
          </button>
        </div>
      </div>

      <header className="border-b border-neutral-300 pb-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">
          Reporte de sostenibilidad ambiental — con referencia a los Estándares GRI
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{establecimiento.nombre}</h1>
        <div className="mt-2 grid gap-1 text-sm text-neutral-600 sm:grid-cols-2">
          <p>Rubro: {industria?.nombre || "—"}</p>
          <p>Empleados: {establecimiento.empleados ?? "Sin responder"}</p>
        </div>
        <p className="mt-2 text-xs text-neutral-400">Generado el {generado}</p>
      </header>

      <section className="mt-6 rounded-md p-4 text-xs" style={{ background: "#F5F7F3", color: "#587168" }}>
        Este reporte usa como referencia la estructura de indicadores de los Estándares GRI
        (Global Reporting Initiative), pero <strong>no es un reporte GRI verificado ni conforme</strong>{" "}
        ("in accordance"): eso requiere un proceso de verificación que queda fuera de la app.
        Solo incluye indicadores para los que hay datos reales cargados; el resto figura como
        "Sin datos suficientes".
      </section>

      {/* GRI 2 — Contenidos generales */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">GRI 2 — Contenidos generales</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaIndicador
              codigo="2-1"
              titulo="Detalles de la organización"
              valor={`${establecimiento.nombre} · ${industria?.nombre || "rubro sin especificar"} · ${
                establecimiento.direccion || "dirección sin especificar"
              }`}
            />
            <FilaIndicador
              codigo="2-27"
              titulo="Cumplimiento de leyes y normativas ambientales"
              valor={
                cumplimientoResumen.total === 0
                  ? null
                  : `${cumplimientoResumen.total} obligación(es) identificada(s), ${cumplimientoResumen.vencidos} vencida(s) al momento de este reporte`
              }
            />
          </tbody>
        </table>
      </section>

      {/* GRI 302 — Energía */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">GRI 302 — Energía</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaIndicador
              codigo="302-1"
              titulo={`Consumo de energía dentro de la organización (período ${huella?.periodo || "—"})`}
              valor={
                huella
                  ? huella.resultado?.detalle
                      ?.map((d) => `${d.nombre}: ${d.cantidad} ${d.unidad}`)
                      .join(" · ") || null
                  : null
              }
              nota="Calculado en Huella de carbono."
            />
          </tbody>
        </table>
      </section>

      {/* GRI 303 — Agua */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">GRI 303 — Agua y efluentes</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaIndicador
              codigo="303-5"
              titulo="Consumo de agua"
              valor={
                establecimiento.consumoAguaM3Dia != null
                  ? `${establecimiento.consumoAguaM3Dia} m³/día declarados`
                  : null
              }
            />
            <FilaIndicador
              codigo="303-2"
              titulo="Gestión de impactos por vertido de efluentes"
              valor={
                establecimiento.vuelcaEfluentes
                  ? "La empresa declara volcado de efluentes líquidos, gestionado bajo la normativa identificada en el checklist legal"
                  : "La empresa declara que no vuelca efluentes líquidos"
              }
            />
          </tbody>
        </table>
      </section>

      {/* GRI 305 — Emisiones */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">GRI 305 — Emisiones</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaIndicador
              codigo="305-1"
              titulo={`Emisiones directas de GEI (alcance 1) — período ${huella?.periodo || "—"}`}
              valor={huella ? `${huella.resultado?.scope1_tco2e?.toFixed(2)} tCO2e` : null}
              nota="Calculado según GHG Protocol en Huella de carbono."
            />
            <FilaIndicador
              codigo="305-2"
              titulo={`Emisiones indirectas de GEI por energía (alcance 2) — período ${huella?.periodo || "—"}`}
              valor={huella ? `${huella.resultado?.scope2_tco2e?.toFixed(2)} tCO2e` : null}
              nota="Calculado según GHG Protocol en Huella de carbono."
            />
          </tbody>
        </table>
      </section>

      {/* GRI 306 — Residuos */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">GRI 306 — Residuos</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaIndicador
              codigo="306-1 / 306-2"
              titulo="Generación de residuos e impactos significativos"
              valor={[
                establecimiento.generaResiduosPeligrosos ? "Genera residuos peligrosos" : null,
                establecimiento.generaResiduosEspeciales ? "Genera residuos especiales" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "La empresa declara que no genera residuos peligrosos ni especiales"}
            />
            <FilaIndicador
              codigo="306-2"
              titulo="Acciones para reducir residuos en el proceso productivo"
              valor={
                programasPL.length > 0
                  ? programasPL.map(({ programa }) => programa.nombre).join(" · ")
                  : null
              }
              nota="Programas de Producción Limpia en curso o adheridos."
            />
          </tbody>
        </table>
      </section>

      <footer className="mt-10 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        Reporte generado automáticamente a partir de datos cargados por la empresa en la
        plataforma. No constituye un reporte GRI verificado ni sustituye el proceso formal de
        elaboración de memorias de sostenibilidad. Generado el {generado}.
      </footer>

      <style jsx global>{`
        @media print {
          .no-imprimir {
            display: none !important;
          }
          body {
            background: #fff !important;
          }
        }
      `}</style>
    </div>
  );
}

function FilaIndicador({ codigo, titulo, valor, nota }) {
  const sinDatos = valor === null || valor === undefined || valor === "";
  return (
    <tr className="border-b border-neutral-100 align-top">
      <td className="w-24 py-3 pr-3 font-mono text-xs text-neutral-500">GRI {codigo}</td>
      <td className="py-3 pr-3">
        <p className="font-medium text-neutral-800">{titulo}</p>
        {sinDatos ? (
          <p className="mt-1 text-neutral-400 italic">Sin datos suficientes todavía.</p>
        ) : (
          <p className="mt-1 text-neutral-600">{valor}</p>
        )}
        {nota && !sinDatos && <p className="mt-1 text-xs text-neutral-400">{nota}</p>}
      </td>
    </tr>
  );
}
