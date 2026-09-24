"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { alertaVencimiento } from "@/lib/vencimientos";

const CAMPO_LABELS = {
  generaResiduosPeligrosos: "Genera residuos peligrosos",
  generaResiduosEspeciales: "Genera residuos especiales",
  vuelcaEfluentes: "Vuelca efluentes líquidos",
  consumoAguaM3Dia: "Consumo de agua (m³/día)",
  tieneEmisionesGaseosas: "Tiene emisiones gaseosas",
  tieneHabilitacionVigente: "Tiene habilitación vigente",
};

function valorDeclarado(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sin responder";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return String(valor);
}

/**
 * Informe de diagnóstico, pensado para imprimir o guardar como PDF con el
 * diálogo nativo del navegador (no genera el PDF nosotros: es una vista
 * limpia con su propio CSS de impresión). Sirve tanto para que la empresa
 * lo guarde como constancia como para adjuntar a la tesis un caso real.
 *
 * Por defecto muestra el establecimiento del usuario logueado. Un admin
 * puede pedir el de cualquier empresa con `?id=<establecimientoId>`.
 */
export default function InformePage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");

  const [cargando, setCargando] = useState(true);
  const [establecimiento, setEstablecimiento] = useState(null);
  const [industria, setIndustria] = useState(null);
  const [jurisdiccion, setJurisdiccion] = useState(null);
  const [items, setItems] = useState([]); // { cumplimiento, tramite, normativas }

  const establecimientoId =
    perfil?.role === "admin" && idParam ? idParam : perfil?.establecimiento_ref || null;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    async function cargar() {
      if (!establecimientoId) {
        setCargando(false);
        return;
      }
      setCargando(true);

      const estSnap = await getDoc(doc(db, "establecimientos", establecimientoId));
      const est = estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null;
      setEstablecimiento(est);

      if (est?.industria_ref) {
        const indSnap = await getDoc(doc(db, "industrias", est.industria_ref));
        setIndustria(indSnap.exists() ? indSnap.data() : null);
      }
      if (est?.jurisdiccion_ref) {
        const jurSnap = await getDoc(doc(db, "jurisdicciones", est.jurisdiccion_ref));
        setJurisdiccion(jurSnap.exists() ? jurSnap.data() : null);
      }

      const cumplSnap = await getDocs(
        query(collection(db, "cumplimiento"), where("establecimiento_ref", "==", establecimientoId))
      );
      const cumplimientos = cumplSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.estado !== "no aplica");

      const tramiteIds = Array.from(new Set(cumplimientos.map((c) => c.tramite_ref)));
      const tramitesMap = new Map();
      await Promise.all(
        tramiteIds.map(async (tid) => {
          const s = await getDoc(doc(db, "tramites", tid));
          if (s.exists()) tramitesMap.set(tid, { id: s.id, ...s.data() });
        })
      );

      const normativaIds = Array.from(
        new Set(Array.from(tramitesMap.values()).flatMap((t) => t.normativas_ref || []))
      );
      const normativasMap = new Map();
      await Promise.all(
        normativaIds.map(async (nid) => {
          const s = await getDoc(doc(db, "normativas", nid));
          if (s.exists()) normativasMap.set(nid, { id: s.id, ...s.data() });
        })
      );

      const armado = cumplimientos
        .map((c) => {
          const tramite = tramitesMap.get(c.tramite_ref);
          const normativas = (tramite?.normativas_ref || [])
            .map((nid) => normativasMap.get(nid))
            .filter(Boolean);
          return { cumplimiento: c, tramite, normativas };
        })
        .filter((x) => x.tramite);

      setItems(armado);
      setCargando(false);
    }
    if (!loading) cargar();
  }, [loading, establecimientoId]);

  const identificadas = useMemo(
    () => items.filter((i) => i.cumplimiento.resultado !== "requiere_revision"),
    [items]
  );
  const porConfirmar = useMemo(
    () => items.filter((i) => i.cumplimiento.resultado === "requiere_revision"),
    [items]
  );

  if (loading || cargando) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>;
  }

  if (!establecimientoId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">
        No hay una empresa asociada a esta cuenta todavía.
      </div>
    );
  }

  if (!establecimiento) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">
        No se encontró el establecimiento.
      </div>
    );
  }

  const generado = new Date().toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="no-imprimir mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
          ← Volver al panel
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Descargar / Imprimir
        </button>
      </div>

      <header className="border-b border-neutral-300 pb-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">
          Informe de diagnóstico ambiental
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{establecimiento.nombre}</h1>
        <div className="mt-2 grid gap-1 text-sm text-neutral-600 sm:grid-cols-2">
          <p>CUIT: {establecimiento.cuit || "—"}</p>
          <p>Rubro: {industria?.nombre || "—"}</p>
          <p>Dirección: {establecimiento.direccion || "—"}</p>
          <p>Municipio: {jurisdiccion?.nombre || "—"}</p>
        </div>
        <p className="mt-2 text-xs text-neutral-400">Generado el {generado}</p>
      </header>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Datos declarados</h2>
        <div className="mt-2 grid gap-1 text-sm text-neutral-700 sm:grid-cols-2">
          <p>Situación: {establecimiento.situacion === "nuevo" ? "Nuevo / a instalarse" : "Existente"}</p>
          <p>Empleados: {establecimiento.empleados ?? "Sin responder"}</p>
          <p>Superficie: {establecimiento.superficieM2 ? `${establecimiento.superficieM2} m²` : "Sin responder"}</p>
          {Object.entries(CAMPO_LABELS).map(([campo, label]) => (
            <p key={campo}>
              {label}: {valorDeclarado(establecimiento[campo])}
              {campo === "consumoAguaM3Dia" && establecimiento[campo] != null ? " m³/día" : ""}
            </p>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">
          Obligaciones identificadas ({identificadas.length})
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Trámites con una regla documentada y verificada contra los datos declarados.
        </p>
        {identificadas.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Todavía no hay obligaciones confirmadas.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-2 pr-3 font-medium">Trámite</th>
                <th className="py-2 pr-3 font-medium">Organismo</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 font-medium">Fundamento</th>
              </tr>
            </thead>
            <tbody>
              {identificadas.map(({ cumplimiento, tramite, normativas }) => {
                const alerta = alertaVencimiento(cumplimiento.fecha_vencimiento);
                return (
                  <tr key={cumplimiento.id} className="border-b border-neutral-100 align-top">
                    <td className="py-2 pr-3 font-medium">{tramite.nombre}</td>
                    <td className="py-2 pr-3 text-neutral-600">{tramite.organismo}</td>
                    <td className="py-2 pr-3 text-neutral-600">
                      {cumplimiento.estado}
                      {alerta && ` · ${alerta.texto}`}
                      {cumplimiento.fecha_vencimiento && ` · vence ${cumplimiento.fecha_vencimiento}`}
                    </td>
                    <td className="py-2 text-neutral-600">
                      {normativas.map((n) => `${n.tipo} ${n.numero}`).join(", ") || "—"}
                      {cumplimiento.regla_articulos ? ` — ${cumplimiento.regla_articulos}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Por confirmar ({porConfirmar.length})</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Trámites incluidos por tema y jurisdicción, pero sin una regla documentada con
          fuente verificable, o con datos que todavía faltan para confirmar el alcance.
        </p>
        {porConfirmar.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No hay puntos por confirmar.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-2 pr-3 font-medium">Trámite</th>
                <th className="py-2 pr-3 font-medium">Organismo</th>
                <th className="py-2 font-medium">Falta confirmar</th>
              </tr>
            </thead>
            <tbody>
              {porConfirmar.map(({ cumplimiento, tramite }) => (
                <tr key={cumplimiento.id} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-3 font-medium">{tramite.nombre}</td>
                  <td className="py-2 pr-3 text-neutral-600">{tramite.organismo}</td>
                  <td className="py-2 text-neutral-600">
                    {cumplimiento.condiciones_sin_respuesta?.length > 0
                      ? cumplimiento.condiciones_sin_respuesta.join("; ")
                      : "Todavía no tiene una regla documentada con fuente verificable."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-10 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        Este informe orienta sobre qué normativa suele aplicar según los datos cargados; no
        reemplaza el asesoramiento de un profesional ni constituye una certificación de
        cumplimiento. Generado automáticamente el {generado}.
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
