"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { buscarHuellas } from "@/lib/huellaCarbono";

/**
 * Reporte con referencia a IFRS S1 (información general de sostenibilidad) e
 * IFRS S2 (información relacionada al clima), los estándares del ISSB
 * pensados para inversores. A diferencia de GRI (que le habla a cualquier
 * stakeholder), acá el destinatario es alguien que evalúa riesgo financiero.
 *
 * Por eso esta página no calza hoy con el perfil de PyME industrial de Tigre
 * (según quedó documentado en el plan): no cotiza en bolsa ni le reporta a un
 * inversor. Se construye igual, "por si aparece el caso", con la misma idea
 * que GRI: nunca inventar un dato. Los cuatro pilares de IFRS S1/S2
 * (Gobernanza, Estrategia, Gestión de riesgos, Métricas y objetivos) se
 * completan con:
 *  - Métricas: se calculan solas a partir de la Huella de carbono (mismo
 *    motor GHG Protocol que ya existe) y del objetivo climático que la
 *    empresa cargue acá.
 *  - Gobernanza/Estrategia/Gestión de riesgos: son descripciones cualitativas
 *    que exige la norma y que solo la empresa puede redactar (no hay forma
 *    de calcularlas de datos existentes), así que quedan como campos de
 *    texto editables en vez de "sin datos" fijo.
 */
export default function ReporteIfrsPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [establecimiento, setEstablecimiento] = useState(null);
  const [huellas, setHuellas] = useState([]);
  const [periodoSel, setPeriodoSel] = useState("");
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
      setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);

      const h = await buscarHuellas(estId);
      setHuellas(h);
      setPeriodoSel(h[0]?.periodo || "");

      setCargando(false);
    }
    if (!loading) cargar();
  }, [loading, perfil]);

  const huella = useMemo(
    () => huellas.find((h) => h.periodo === periodoSel) || null,
    [huellas, periodoSel]
  );

  async function guardarCampo(campo, valor) {
    await updateDoc(doc(db, "establecimientos", establecimiento.id), { [campo]: valor });
    setEstablecimiento((prev) => ({ ...prev, [campo]: valor }));
  }

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
          Información relacionada a sostenibilidad y clima — con referencia a IFRS S1 / S2 (ISSB)
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{establecimiento.nombre}</h1>
        <p className="mt-2 text-xs text-neutral-400">Generado el {generado}</p>
      </header>

      <section className="mt-6 rounded-md p-4 text-xs" style={{ background: "#F5F7F3", color: "#587168" }}>
        Este reporte usa como referencia la estructura de IFRS S1 (información general de
        sostenibilidad) e IFRS S2 (información relacionada al clima), pensados originalmente
        para inversores de empresas que cotizan en bolsa. <strong>No es un reporte conforme a
        IFRS</strong> ni reemplaza el proceso formal de divulgación financiera. Tiene sentido
        armarlo si en algún momento un inversor, banco o cliente grande lo pide; mientras tanto
        queda preparado con lo que la app ya sabe calcular.
      </section>

      <PilarTexto
        titulo="Gobernanza"
        descripcion="Cómo supervisa la dirección de la empresa los riesgos y oportunidades relacionados a sostenibilidad y clima."
        campo="gobernanza_clima"
        valor={establecimiento.gobernanza_clima}
        onGuardar={guardarCampo}
      />

      <PilarTexto
        titulo="Estrategia"
        descripcion="Riesgos y oportunidades de sostenibilidad/clima identificados, y su efecto esperado en el modelo de negocio."
        campo="estrategia_clima"
        valor={establecimiento.estrategia_clima}
        onGuardar={guardarCampo}
      />

      <PilarTexto
        titulo="Gestión de riesgos"
        descripcion="Proceso con el que la empresa identifica, evalúa y gestiona esos riesgos."
        campo="gestion_riesgos_clima"
        valor={establecimiento.gestion_riesgos_clima}
        onGuardar={guardarCampo}
      />

      {/* Métricas y objetivos */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">Métricas y objetivos</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Emisiones de gases de efecto invernadero (calculadas según GHG Protocol en Huella de
          carbono) y el objetivo climático que la empresa se proponga.
        </p>

        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            <FilaMetrica
              titulo={`Emisiones directas — alcance 1 (período ${huella?.periodo || "—"})`}
              valor={huella ? `${huella.resultado?.scope1_tco2e?.toFixed(2)} tCO2e` : null}
            />
            <FilaMetrica
              titulo={`Emisiones indirectas por energía — alcance 2 (período ${huella?.periodo || "—"})`}
              valor={huella ? `${huella.resultado?.scope2_tco2e?.toFixed(2)} tCO2e` : null}
            />
            <FilaMetrica
              titulo="Emisiones de la cadena de valor — alcance 3"
              valor={null}
              nota="No calculado en esta versión de la app."
            />
          </tbody>
        </table>

        {huellas.length === 0 && (
          <p className="mt-3 text-sm" style={{ color: "#587168" }}>
            Todavía no hay ninguna huella de carbono calculada.{" "}
            <Link href="/dashboard/huella-carbono" className="text-emerald-600 hover:underline">
              Calcularla ahora
            </Link>
            .
          </p>
        )}

        <ObjetivoClimatico establecimiento={establecimiento} onGuardar={guardarCampo} />
      </section>

      <footer className="mt-10 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        Reporte generado a partir de datos cargados por la empresa en la plataforma. No
        constituye información conforme a IFRS S1/S2 ni sustituye el proceso formal de
        divulgación financiera relacionada a sostenibilidad. Generado el {generado}.
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

function FilaMetrica({ titulo, valor, nota }) {
  const sinDatos = valor === null || valor === undefined || valor === "";
  return (
    <tr className="border-b border-neutral-100 align-top">
      <td className="py-3 pr-3">
        <p className="font-medium text-neutral-800">{titulo}</p>
        {sinDatos ? (
          <p className="mt-1 text-neutral-400 italic">{nota || "Sin datos suficientes todavía."}</p>
        ) : (
          <p className="mt-1 text-neutral-600">{valor}</p>
        )}
      </td>
    </tr>
  );
}

function PilarTexto({ titulo, descripcion, campo, valor, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor || "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(campo, texto.trim());
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {!editando && (
          <button
            onClick={() => {
              setTexto(valor || "");
              setEditando(true);
            }}
            className="no-imprimir text-xs hover:underline"
            style={{ color: "#087E69" }}
          >
            {valor ? "Editar" : "Completar"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">{descripcion}</p>

      {editando ? (
        <div className="mt-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ border: "1px solid #DDE6DF" }}
            placeholder="Describilo en tus palabras..."
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ border: "1px solid #DDE6DF", color: "#587168" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          {valor || <span className="text-neutral-400 italic">Sin datos suficientes todavía.</span>}
        </p>
      )}
    </section>
  );
}

function ObjetivoClimatico({ establecimiento, onGuardar }) {
  const objetivo = establecimiento.objetivo_climatico || null;
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion || "");
  const [anioBase, setAnioBase] = useState(objetivo?.anio_base || "");
  const [anioObjetivo, setAnioObjetivo] = useState(objetivo?.anio_objetivo || "");
  const [metaPct, setMetaPct] = useState(objetivo?.meta_reduccion_pct ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar("objetivo_climatico", {
        descripcion: descripcion.trim(),
        anio_base: anioBase ? Number(anioBase) : null,
        anio_objetivo: anioObjetivo ? Number(anioObjetivo) : null,
        meta_reduccion_pct: metaPct !== "" ? Number(metaPct) : null,
      });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg p-4" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: "#173A34" }}>
          Objetivo climático
        </p>
        {!editando && (
          <button
            onClick={() => setEditando(true)}
            className="no-imprimir text-xs hover:underline"
            style={{ color: "#087E69" }}
          >
            {objetivo ? "Editar" : "Definir objetivo"}
          </button>
        )}
      </div>

      {editando ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Descripción del objetivo
            </span>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: reducir emisiones alcance 1+2 en un 20% para 2030"
              className="w-full rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Año base
            </span>
            <input
              type="number"
              value={anioBase}
              onChange={(e) => setAnioBase(e.target.value)}
              className="w-full rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Año objetivo
            </span>
            <input
              type="number"
              value={anioObjetivo}
              onChange={(e) => setAnioObjetivo(e.target.value)}
              className="w-full rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Meta de reducción (%)
            </span>
            <input
              type="number"
              value={metaPct}
              onChange={(e) => setMetaPct(e.target.value)}
              className="w-full rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
            />
          </label>

          <div className="flex gap-2 sm:col-span-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => setEditando(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ border: "1px solid #DDE6DF", color: "#587168" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : objetivo ? (
        <p className="mt-2 text-sm text-neutral-600">
          {objetivo.descripcion}
          {objetivo.anio_base && objetivo.anio_objetivo
            ? ` (base ${objetivo.anio_base} → objetivo ${objetivo.anio_objetivo}${
                objetivo.meta_reduccion_pct != null ? `, -${objetivo.meta_reduccion_pct}%` : ""
              })`
            : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-400 italic">Todavía no se definió un objetivo.</p>
      )}
    </div>
  );
}
