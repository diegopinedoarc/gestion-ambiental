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
import { alertaVencimiento, sugerirVencimiento } from "@/lib/vencimientos";

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
    const item = items.find((it) => it.cumplimiento.id === cumplimientoId);
    const cambios = { estado: nuevoEstado };

    // Al marcar un trámite como vigente, si todavía no tiene fechas
    // cargadas le sugerimos una fecha de obtención (hoy) y, según la
    // periodicidad del trámite, una fecha de vencimiento tentativa. La
    // empresa puede corregirlas si el organismo le dio otro plazo.
    if (nuevoEstado === "vigente" && item) {
      if (!item.cumplimiento.fecha_obtencion) {
        cambios.fecha_obtencion = new Date().toISOString().slice(0, 10);
      }
      if (!item.cumplimiento.fecha_vencimiento) {
        const sugerida = sugerirVencimiento(item.tramite?.periodicidad);
        if (sugerida) cambios.fecha_vencimiento = sugerida;
      }
    }

    await updateDoc(doc(db, "cumplimiento", cumplimientoId), cambios);
    setItems((prev) =>
      prev.map((it) =>
        it.cumplimiento.id === cumplimientoId
          ? { ...it, cumplimiento: { ...it.cumplimiento, ...cambios } }
          : it
      )
    );
  }

  async function cambiarFecha(cumplimientoId, campo, fecha) {
    await updateDoc(doc(db, "cumplimiento", cumplimientoId), {
      [campo]: fecha || null,
    });
    setItems((prev) =>
      prev.map((it) =>
        it.cumplimiento.id === cumplimientoId
          ? { ...it, cumplimiento: { ...it.cumplimiento, [campo]: fecha } }
          : it
      )
    );
  }

  const resumen = useMemo(() => {
    const activos = items.filter((i) => i.cumplimiento.estado !== "no aplica");
    const conteo = { pendiente: 0, "en trámite": 0, vigente: 0, vencido: 0 };
    let vencenPronto = 0;
    let vencidos = 0;
    activos.forEach((i) => {
      if (conteo[i.cumplimiento.estado] !== undefined) conteo[i.cumplimiento.estado]++;
      const alerta = alertaVencimiento(i.cumplimiento.fecha_vencimiento);
      if (alerta?.tono === "porVencer") vencenPronto++;
      if (alerta?.tono === "vencido") vencidos++;
    });
    return { total: activos.length, ...conteo, vencenPronto, vencidos };
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

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Tarjeta titulo="Trámites aplicables" valor={resumen.total} />
        <Tarjeta titulo="Pendientes" valor={resumen.pendiente} tono="amber" />
        <Tarjeta titulo="En trámite" valor={resumen["en trámite"]} tono="blue" />
        <Tarjeta titulo="Vigentes" valor={resumen.vigente} tono="emerald" />
        <Tarjeta titulo="Vencen pronto" valor={resumen.vencenPronto} tono="amber" />
        <Tarjeta titulo="Vencidos" valor={resumen.vencidos} tono="red" />
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
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_COLOR[cumplimiento.estado]}`}
                  >
                    {cumplimiento.estado}
                  </span>
                  {(() => {
                    const alerta = alertaVencimiento(cumplimiento.fecha_vencimiento);
                    if (!alerta) return null;
                    const tonoClase =
                      alerta.tono === "vencido"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
                    return (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${tonoClase}`}>
                        ⚠ {alerta.texto}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                {tramite.descripcion}
              </p>

              {normativas.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-neutral-500">
                  <span>Base legal:</span>
                  {normativas.map((n, i) => (
                    <span key={n.id}>
                      {n.url_fuente ? (
                        <a
                          href={n.url_fuente}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline"
                        >
                          {n.tipo} {n.numero}
                        </a>
                      ) : (
                        `${n.tipo} ${n.numero}`
                      )}
                      {i < normativas.length - 1 ? "," : ""}
                    </span>
                  ))}
                </p>
              )}

              {tramite.requisitos?.length > 0 && (
                <div className="mt-4 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900/60">
                  <p className="text-xs font-medium text-neutral-500">
                    Qué tenés que hacer para cumplir
                  </p>
                  <ul className="mt-3 space-y-3 text-sm">
                    {tramite.requisitos.map((r, i) => {
                      const req = typeof r === "string" ? { tarea: r } : r;
                      return (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 text-neutral-400">•</span>
                          <div>
                            <p className="font-medium">{req.tarea}</p>
                            {req.detalle && (
                              <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                                {req.detalle}
                              </p>
                            )}
                            {(req.plazo || req.link) && (
                              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                                {req.plazo && <span>⏱ {req.plazo}</span>}
                                {req.link && (
                                  <a
                                    href={req.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-600 hover:underline"
                                  >
                                    Ver más ↗
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
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
                  Obtenido:
                  <input
                    type="date"
                    className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                    value={cumplimiento.fecha_obtencion || ""}
                    onChange={(e) =>
                      cambiarFecha(cumplimiento.id, "fecha_obtencion", e.target.value)
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  Vencimiento:
                  <input
                    type="date"
                    className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                    value={cumplimiento.fecha_vencimiento || ""}
                    onChange={(e) =>
                      cambiarFecha(cumplimiento.id, "fecha_vencimiento", e.target.value)
                    }
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                La fecha de vencimiento se sugiere sola al marcar el trámite como
                &ldquo;vigente&rdquo;, tomando la periodicidad del trámite — corregila si el
                organismo te dio un plazo distinto.
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}

const TONO_TEXTO = {
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
};

function Tarjeta({ titulo, valor, tono }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${TONO_TEXTO[tono] || ""}`}>{valor}</p>
    </div>
  );
}
