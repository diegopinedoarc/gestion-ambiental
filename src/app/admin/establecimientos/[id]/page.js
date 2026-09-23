"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const ESTADO_COLOR = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "en trámite": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  vigente: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  vencido: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "no aplica": "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function DetalleEstablecimiento({ params }) {
  const { id } = usePromise(params);
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimiento, setEstablecimiento] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil && perfil.role !== "admin") router.push("/dashboard");
  }, [loading, user, perfil, router]);

  useEffect(() => {
    async function cargar() {
      if (!perfil || perfil.role !== "admin") return;
      setCargando(true);

      const estSnap = await getDoc(doc(db, "establecimientos", id));
      setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);

      const cumplQ = query(
        collection(db, "cumplimiento"),
        where("establecimiento_ref", "==", id)
      );
      const cumplSnap = await getDocs(cumplQ);
      const cumplimientos = cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const tramiteIds = Array.from(new Set(cumplimientos.map((c) => c.tramite_ref)));
      const tramitesMap = new Map();
      await Promise.all(
        tramiteIds.map(async (tid) => {
          const s = await getDoc(doc(db, "tramites", tid));
          if (s.exists()) tramitesMap.set(tid, { id: s.id, ...s.data() });
        })
      );

      const armado = cumplimientos
        .map((c) => ({ cumplimiento: c, tramite: tramitesMap.get(c.tramite_ref) }))
        .filter((x) => x.tramite && x.cumplimiento.estado !== "no aplica");

      setItems(armado);
      setCargando(false);
    }
    cargar();
  }, [perfil, id]);

  if (loading || cargando) {
    return <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>;
  }
  if (!perfil || perfil.role !== "admin") return null;
  if (!establecimiento) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p>No se encontró el establecimiento.</p>
        <Link href="/admin" className="text-emerald-600 hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/admin" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{establecimiento.nombre}</h1>
      <div className="mt-2 grid gap-1 text-sm text-neutral-500 sm:grid-cols-2">
        <p>CUIT: {establecimiento.cuit || "—"}</p>
        <p>Dirección: {establecimiento.direccion || "—"}</p>
        <p>Empleados: {establecimiento.empleados ?? "—"}</p>
        <p>Superficie: {establecimiento.superficieM2 ? `${establecimiento.superficieM2} m²` : "—"}</p>
        <p>Consumo de agua: {establecimiento.consumoAguaM3Dia ?? 0} m³/día</p>
        <p>Situación: {establecimiento.situacion === "nuevo" ? "Nuevo" : "Existente"}</p>
      </div>
      {establecimiento.procesos && (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">Procesos: </span>
          {establecimiento.procesos}
        </p>
      )}

      <h2 className="mt-8 mb-4 text-lg font-semibold">Checklist de cumplimiento</h2>
      <div className="space-y-3">
        {items.map(({ cumplimiento, tramite }) => (
          <div
            key={cumplimiento.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{tramite.nombre}</p>
                <p className="text-sm text-neutral-500">
                  {tramite.organismo} · {tramite.periodicidad}
                  {cumplimiento.fecha_vencimiento
                    ? ` · vence ${cumplimiento.fecha_vencimiento}`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_COLOR[cumplimiento.estado]}`}
              >
                {cumplimiento.estado}
              </span>
            </div>
            {tramite.requisitos?.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-900">
                {tramite.requisitos.map((r, i) => (
                  <li key={i} className="flex gap-2 text-neutral-600 dark:text-neutral-400">
                    <span className="text-neutral-400">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-neutral-500">
            Esta empresa todavía no tiene trámites detectados.
          </p>
        )}
      </div>
    </div>
  );
}
