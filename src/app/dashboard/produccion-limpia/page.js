"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const ESTADOS = ["candidato", "interesado", "en_curso", "adherido", "descartado"];

const ESTADO_LABEL = {
  candidato: "Sin revisar",
  interesado: "Interesa",
  en_curso: "En curso",
  adherido: "Adherido",
  descartado: "Descartado",
};

const ESTADO_COLOR = {
  candidato: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  interesado: "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  en_curso: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  adherido: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  descartado: "bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600",
};

// Orden en el que conviene mostrarlos: primero lo que necesita una decisión,
// "adherido" y "descartado" quedan al final porque ya están resueltos.
const PRIORIDAD_ESTADO = { candidato: 0, interesado: 1, en_curso: 2, adherido: 3, descartado: 4 };

/**
 * Programas de Producción Limpia (voluntarios, no una obligación legal) que
 * le corresponden a este establecimiento por tema y jurisdicción, calculados
 * por `sincronizarProgramasPL`. A diferencia del checklist legal, acá no hay
 * "aplica/no aplica": es la empresa la que decide si le interesa sumarse.
 */
export default function ProduccionLimpiaPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [establecimiento, setEstablecimiento] = useState(null);
  const [items, setItems] = useState([]); // { adhesion, programa }
  const [cargando, setCargando] = useState(true);
  const [expandidoId, setExpandidoId] = useState(null);

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

      const estSnap = await getDoc(doc(db, "establecimientos", perfil.establecimiento_ref));
      setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);

      const adhSnap = await getDocs(
        query(
          collection(db, "adhesiones_pl"),
          where("establecimiento_ref", "==", perfil.establecimiento_ref)
        )
      );
      const adhesiones = adhSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const programaIds = Array.from(new Set(adhesiones.map((a) => a.programa_ref)));
      const programasMap = new Map();
      await Promise.all(
        programaIds.map(async (id) => {
          const s = await getDoc(doc(db, "programas_produccion_limpia", id));
          if (s.exists()) programasMap.set(id, { id: s.id, ...s.data() });
        })
      );

      const armado = adhesiones
        .map((adhesion) => ({ adhesion, programa: programasMap.get(adhesion.programa_ref) }))
        .filter((x) => x.programa);

      setItems(armado);
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  async function cambiarEstado(adhesionId, nuevoEstado) {
    await updateDoc(doc(db, "adhesiones_pl", adhesionId), { estado: nuevoEstado });
    setItems((prev) =>
      prev.map((it) =>
        it.adhesion.id === adhesionId
          ? { ...it, adhesion: { ...it.adhesion, estado: nuevoEstado } }
          : it
      )
    );
  }

  const visibles = useMemo(
    () =>
      [...items].sort(
        (a, b) => PRIORIDAD_ESTADO[a.adhesion.estado] - PRIORIDAD_ESTADO[b.adhesion.estado]
      ),
    [items]
  );

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!establecimiento) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold" style={{ color: "#173A34" }}>
        Producción Limpia
      </h1>
      <p className="mt-2 text-sm" style={{ color: "#587168" }}>
        Programas voluntarios (no son una obligación legal) para reducir residuos y consumo en
        el proceso productivo, que te corresponden por tu rubro y municipio. Vos decidís si te
        interesa sumarte a cada uno.
      </p>

      <div className="mt-8 space-y-3">
        {visibles.map(({ adhesion, programa }) => (
          <FilaPrograma
            key={adhesion.id}
            adhesion={adhesion}
            programa={programa}
            expandido={expandidoId === adhesion.id}
            onToggle={() =>
              setExpandidoId((prev) => (prev === adhesion.id ? null : adhesion.id))
            }
            onCambiarEstado={cambiarEstado}
          />
        ))}
        {visibles.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "#587168" }}>
            Todavía no hay programas de Producción Limpia identificados para tu empresa. Se
            calculan a partir del rubro, los residuos/efluentes declarados y el municipio, igual
            que el checklist de trámites.
          </p>
        )}
      </div>
    </div>
  );
}

function FilaPrograma({ adhesion, programa, expandido, onToggle, onCambiarEstado }) {
  return (
    <div className="rounded-lg" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h3 className="font-medium" style={{ color: "#173A34" }}>
            {programa.nombre}
          </h3>
          <p className="mt-0.5 text-sm" style={{ color: "#587168" }}>
            {programa.organismo}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_COLOR[adhesion.estado]}`}
          >
            {ESTADO_LABEL[adhesion.estado]}
          </span>
          <span className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "#087E69" }}>
            {expandido ? "Ocultar ▴" : "Ver más ▾"}
          </span>
        </div>
      </button>

      {expandido && (
        <div className="border-t px-5 py-5" style={{ borderColor: "#EEF2EE" }}>
          <p className="text-sm" style={{ color: "#40544c" }}>
            {programa.descripcion}
          </p>

          {programa.beneficios && (
            <div className="mt-3">
              <p
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: "#587168" }}
              >
                Qué gana la empresa
              </p>
              <p className="mt-1 text-sm" style={{ color: "#40544c" }}>
                {programa.beneficios}
              </p>
            </div>
          )}

          {programa.requisitos?.length > 0 && (
            <div className="mt-3">
              <p
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: "#587168" }}
              >
                Cómo sumarse
              </p>
              <ol className="mt-2 space-y-2 text-sm">
                {programa.requisitos.map((r, i) => {
                  const req = typeof r === "string" ? { tarea: r } : r;
                  return (
                    <li key={i} className="flex gap-2">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                        style={{ background: "#EEF2EE", color: "#173A34" }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p style={{ color: "#173A34" }}>{req.tarea}</p>
                        {req.detalle && (
                          <p className="mt-0.5" style={{ color: "#587168" }}>
                            {req.detalle}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {programa.url_fuente && (
            <a
              href={programa.url_fuente}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs hover:underline"
              style={{ color: "#087E69" }}
            >
              Más información ↗
            </a>
          )}

          <label className="mt-5 block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Estado
            </span>
            <select
              className="w-full max-w-xs rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
              value={adhesion.estado}
              onChange={(e) => onCambiarEstado(adhesion.id, e.target.value)}
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
