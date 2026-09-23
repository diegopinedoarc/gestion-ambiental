"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const ESTADOS = ["pendiente", "en trámite", "vigente", "vencido", "no aplica"];

const ESTADO_COLOR = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "en trámite": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  vigente: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  vencido: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "no aplica": "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function DashboardPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimiento, setEstablecimiento] = useState(null);
  const [items, setItems] = useState([]); // { cumplimiento, tramite, normativas }
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

      const estSnap = await getDoc(
        doc(db, "establecimientos", perfil.establecimiento_ref)
      );
      setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);

      const cumplQ = query(
        collection(db, "cumplimiento"),
        where("establecimiento_ref", "==", perfil.establecimiento_ref)
      );
      const cumplSnap = await getDocs(cumplQ);
      const cumplimientos = cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const tramiteIds = Array.from(new Set(cumplimientos.map((c) => c.tramite_ref)));
      const tramitesMap = new Map();
      await Promise.all(
        tramiteIds.map(async (id) => {
          const s = await getDoc(doc(db, "tramites", id));
          if (s.exists()) tramitesMap.set(id, { id: s.id, ...s.data() });
        })
      );

      const normativaIds = Array.from(
        new Set(
          Array.from(tramitesMap.values()).flatMap((t) => t.normativas_ref || [])
        )
      );
      const normativasMap = new Map();
      await Promise.all(
        normativaIds.map(async (id) => {
          const s = await getDoc(doc(db, "normativas", id));
          if (s.exists()) normativasMap.set(id, { id: s.id, ...s.data() });
        })
      );

      const armado = cumplimientos
        .map((c) => {
          const tramite = tramitesMap.get(c.tramite_ref);
          const normativas = (tramite?.normativas_ref || [])
            .map((id) => normativasMap.get(id))
            .filter(Boolean);
          return { cumplimiento: c, tramite, normativas };
        })
        .filter((x) => x.tramite); // descarta huérfanos

      setItems(armado);
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  async function cambiarEstado(cumplimientoId, nuevoEstado) {
    await updateDoc(doc(db, "cumplimiento", cumplimientoId), {
      estado: nuevoEstado,
    });
    setItems((prev) =>
      prev.map((it) =>
        it.cumplimiento.id === cumplimientoId
          ? { ...it, cumplimiento: { ...it.cumplimiento, estado: nuevoEstado } }
          : it
      )
    );
  }

  async function cambiarVencimiento(cumplimientoId, fecha) {
    await updateDoc(doc(db, "cumplimiento", cumplimientoId), {
      fecha_vencimiento: fecha || null,
    });
    setItems((prev) =>
      prev.map((it) =>
        it.cumplimiento.id === cumplimientoId
          ? { ...it, cumplimiento: { ...it.cumplimiento, fecha_vencimiento: fecha } }
          : it
      )
    );
  }

  const resumen = useMemo(() => {
    const activos = items.filter((i) => i.cumplimiento.estado !== "no aplica");
    const conteo = { pendiente: 0, "en trámite": 0, vigente: 0, vencido: 0 };
    activos.forEach((i) => {
      if (conteo[i.cumplimiento.estado] !== undefined) conteo[i.cumplimiento.estado]++;
    });
    return { total: activos.length, ...conteo };
  }, [items]);

  if (loading || cargando) {
    return <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>;
  }

  if (!establecimiento) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{establecimiento.nombre}</h1>
          <p className="text-sm text-neutral-500">
            {establecimiento.direccion} · CUIT {establecimiento.cuit || "—"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tarjeta titulo="Trámites aplicables" valor={resumen.total} />
        <Tarjeta titulo="Pendientes" valor={resumen.pendiente} tono="amber" />
        <Tarjeta titulo="En trámite" valor={resumen["en trámite"]} tono="blue" />
        <Tarjeta titulo="Vigentes" valor={resumen.vigente} tono="emerald" />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Checklist de cumplimiento</h2>

      <div className="space-y-4">
        {items
          .filter((i) => i.cumplimiento.estado !== "no aplica")
          .map(({ cumplimiento, tramite, normativas }) => (
            <div
              key={cumplimiento.id}
              className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{tramite.nombre}</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    {tramite.organismo} · {tramite.periodicidad}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_COLOR[cumplimiento.estado]}`}
                >
                  {cumplimiento.estado}
                </span>
              </div>

              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                {tramite.descripcion}
              </p>

              {normativas.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Base legal:{" "}
                  {normativas
                    .map((n) => `${n.tipo} ${n.numero}`)
                    .join(", ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
                <label className="flex items-center gap-2">
                  Estado:
                  <select
                    className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                    value={cumplimiento.estado}
                    onChange={(e) => cambiarEstado(cumplimiento.id, e.target.value)}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Vencimiento:
                  <input
                    type="date"
                    className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                    value={cumplimiento.fecha_vencimiento || ""}
                    onChange={(e) => cambiarVencimiento(cumplimiento.id, e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Tarjeta({ titulo, valor }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
}
