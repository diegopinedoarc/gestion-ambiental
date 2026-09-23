"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

export default function AdminPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimientos, setEstablecimientos] = useState([]);
  const [cumplimientos, setCumplimientos] = useState([]);
  const [tramites, setTramites] = useState([]);
  const [industrias, setIndustrias] = useState([]);
  const [jurisdicciones, setJurisdicciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil && perfil.role !== "admin") router.push("/dashboard");
  }, [loading, user, perfil, router]);

  useEffect(() => {
    async function cargar() {
      if (!perfil || perfil.role !== "admin") return;
      setCargando(true);
      const [estSnap, cumplSnap, tramSnap, indSnap, jurSnap] = await Promise.all([
        getDocs(collection(db, "establecimientos")),
        getDocs(collection(db, "cumplimiento")),
        getDocs(collection(db, "tramites")),
        getDocs(collection(db, "industrias")),
        getDocs(collection(db, "jurisdicciones")),
      ]);
      setEstablecimientos(estSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCumplimientos(cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTramites(tramSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setIndustrias(indSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setJurisdicciones(jurSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  const tramitesPorId = useMemo(() => {
    const m = new Map();
    tramites.forEach((t) => m.set(t.id, t));
    return m;
  }, [tramites]);

  const industriasPorId = useMemo(() => {
    const m = new Map();
    industrias.forEach((i) => m.set(i.id, i));
    return m;
  }, [industrias]);

  const jurisdiccionesPorId = useMemo(() => {
    const m = new Map();
    jurisdicciones.forEach((j) => m.set(j.id, j));
    return m;
  }, [jurisdicciones]);

  const porEstablecimiento = useMemo(() => {
    const m = new Map();
    cumplimientos.forEach((c) => {
      if (c.estado === "no aplica") return;
      const arr = m.get(c.establecimiento_ref) || [];
      arr.push(c);
      m.set(c.establecimiento_ref, arr);
    });
    return m;
  }, [cumplimientos]);

  const tramitesMasFrecuentes = useMemo(() => {
    const conteo = new Map();
    cumplimientos.forEach((c) => {
      if (c.estado === "no aplica") return;
      conteo.set(c.tramite_ref, (conteo.get(c.tramite_ref) || 0) + 1);
    });
    return Array.from(conteo.entries())
      .map(([tramiteId, cantidad]) => ({
        tramite: tramitesPorId.get(tramiteId),
        cantidad,
      }))
      .filter((x) => x.tramite)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [cumplimientos, tramitesPorId]);

  if (loading || cargando) {
    return <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>;
  }
  if (!perfil || perfil.role !== "admin") return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Panel de administración</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Empresas registradas y estado agregado de cumplimiento.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Tarjeta titulo="Empresas registradas" valor={establecimientos.length} />
        <Tarjeta
          titulo="Trámites activos totales"
          valor={cumplimientos.filter((c) => c.estado !== "no aplica").length}
        />
        <Tarjeta
          titulo="Trámites vencidos"
          valor={cumplimientos.filter((c) => c.estado === "vencido").length}
        />
      </div>

      {tramitesMasFrecuentes.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Trámites más frecuentes</h2>
          <div className="space-y-2">
            {tramitesMasFrecuentes.map(({ tramite, cantidad }) => (
              <div
                key={tramite.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
              >
                <span>{tramite.nombre}</span>
                <span className="font-semibold">{cantidad} empresas</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Empresas</h2>
      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2 font-medium">Empresa</th>
              <th className="px-4 py-2 font-medium">Rubro</th>
              <th className="px-4 py-2 font-medium">Zona</th>
              <th className="px-4 py-2 font-medium">Trámites</th>
              <th className="px-4 py-2 font-medium">Pendientes</th>
              <th className="px-4 py-2 font-medium">Vencidos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {establecimientos.map((e) => {
              const items = porEstablecimiento.get(e.id) || [];
              const pendientes = items.filter((c) => c.estado === "pendiente").length;
              const vencidos = items.filter((c) => c.estado === "vencido").length;
              return (
                <tr key={e.id} className="border-t border-neutral-100 dark:border-neutral-900">
                  <td className="px-4 py-2 font-medium">{e.nombre || "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {industriasPorId.get(e.industria_ref)?.nombre || "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {jurisdiccionesPorId.get(e.jurisdiccion_ref)?.nombre || "—"}
                  </td>
                  <td className="px-4 py-2">{items.length}</td>
                  <td className="px-4 py-2">{pendientes}</td>
                  <td className="px-4 py-2">{vencidos}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/establecimientos/${e.id}`}
                      className="text-emerald-600 hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              );
            })}
            {establecimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Todavía no hay empresas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
