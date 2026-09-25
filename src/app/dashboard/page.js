"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import PorQueAplica from "@/components/PorQueAplica";
import Evidencias from "@/components/Evidencias";

const ESTADOS = ["pendiente", "en trámite", "vigente", "vencido", "no aplica"];

// Ámbar suave con texto oscuro; el rojo queda reservado para alertas reales
// (vencido / vence pronto), no como color decorativo.
const ESTADO_COLOR = {
  pendiente: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  "en trámite": "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  vigente: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  vencido: "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  "no aplica": "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "accion", label: "Requieren acción" },
  { id: "en_tramite", label: "En trámite" },
  { id: "vigentes", label: "Vigentes" },
];

function prioridad(item) {
  const alerta = alertaVencimiento(item.cumplimiento.fecha_vencimiento);
  if (item.cumplimiento.estado === "vencido" || alerta?.tono === "vencido") return 0;
  if (alerta?.tono === "porVencer") return 1;
  if (item.cumplimiento.estado === "pendiente") return 2;
  if (item.cumplimiento.estado === "en trámite") return 3;
  return 4; // vigente
}

export default function DashboardPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimiento, setEstablecimiento] = useState(null);
  const [items, setItems] = useState([]); // { cumplimiento, tramite, normativas }
  const [temasPorId, setTemasPorId] = useState(new Map());
  const [cargando, setCargando] = useState(true);

  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState("prioridad"); // "prioridad" | "vencimiento"
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

      const estSnap = await getDoc(
        doc(db, "establecimientos", perfil.establecimiento_ref)
      );
      setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);

      const [cumplSnap, temasSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "cumplimiento"),
            where("establecimiento_ref", "==", perfil.establecimiento_ref)
          )
        ),
        getDocs(collection(db, "temas_ambientales")),
      ]);
      const cumplimientos = cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTemasPorId(new Map(temasSnap.docs.map((d) => [d.id, d.data()])));

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

  const activos = useMemo(
    () => items.filter((i) => i.cumplimiento.estado !== "no aplica"),
    [items]
  );

  // Estado de cada trámite por su propio id (no el del cumplimiento), para
  // poder resolver dependencias: un trámite puede declarar `depende_de`
  // (array de tramite ids) y acá se arma el mapa que permite saber, para
  // cada uno, si lo que necesita ya está vigente.
  const estadoPorTramiteId = useMemo(() => {
    const map = new Map();
    items.forEach((i) => {
      map.set(i.tramite.id, {
        nombre: i.tramite.nombre,
        estado: i.cumplimiento.estado,
        resultado: i.cumplimiento.resultado,
      });
    });
    return map;
  }, [items]);

  function dependenciasPendientes(tramite) {
    return (tramite.depende_de || [])
      .map((id) => estadoPorTramiteId.get(id))
      // Si la dependencia no le corresponde a esta empresa (no_aplica) o no
      // está en el checklist, no bloquea nada.
      .filter((dep) => dep && dep.resultado !== "no_aplica" && dep.estado !== "vigente");
  }

  const resumen = useMemo(() => {
    const conteo = { pendiente: 0, "en trámite": 0, vigente: 0, vencido: 0 };
    let vencenPronto = 0;
    let vencidos = 0;
    activos.forEach((i) => {
      if (conteo[i.cumplimiento.estado] !== undefined) conteo[i.cumplimiento.estado]++;
      const alerta = alertaVencimiento(i.cumplimiento.fecha_vencimiento);
      if (alerta?.tono === "porVencer") vencenPronto++;
      if (alerta?.tono === "vencido") vencidos++;
    });
    const requierenAccion = activos.length - conteo.vigente;
    return { total: activos.length, ...conteo, vencenPronto, vencidos, requierenAccion };
  }, [activos]);

  const visibles = useMemo(() => {
    let lista = activos;

    if (filtro === "accion") {
      lista = lista.filter((i) => i.cumplimiento.estado !== "vigente");
    } else if (filtro === "en_tramite") {
      lista = lista.filter((i) => i.cumplimiento.estado === "en trámite");
    } else if (filtro === "vigentes") {
      lista = lista.filter((i) => i.cumplimiento.estado === "vigente");
    }

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter(
        (i) =>
          i.tramite.nombre?.toLowerCase().includes(q) ||
          i.tramite.organismo?.toLowerCase().includes(q)
      );
    }

    lista = [...lista].sort((a, b) => {
      if (orden === "vencimiento") {
        const fa = a.cumplimiento.fecha_vencimiento;
        const fb = b.cumplimiento.fecha_vencimiento;
        if (!fa && !fb) return prioridad(a) - prioridad(b);
        if (!fa) return 1;
        if (!fb) return -1;
        return fa.localeCompare(fb);
      }
      return prioridad(a) - prioridad(b);
    });

    return lista;
  }, [activos, filtro, busqueda, orden]);

  if (loading || cargando) {
    return (
      <div
        className="min-h-[calc(100vh-57px)]"
        style={{ background: "#F5F7F3" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-neutral-500">
          Cargando...
        </div>
      </div>
    );
  }

  if (!establecimiento) return null;

  return (
    <div className="min-h-[calc(100vh-57px)]" style={{ background: "#F5F7F3" }}>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "#173A34" }}>
              {establecimiento.nombre}
            </h1>
            <p className="text-sm" style={{ color: "#587168" }}>
              {establecimiento.direccion} · CUIT {establecimiento.cuit || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/huella-carbono"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Huella de carbono
            </Link>
            <Link
              href="/dashboard/produccion-limpia"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Producción Limpia
            </Link>
            <Link
              href="/dashboard/reporte-gri"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Reporte GRI
            </Link>
            <Link
              href="/dashboard/equipo"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Compartir acceso
            </Link>
            <Link
              href="/dashboard/informe"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Descargar informe
            </Link>
            <Link
              href="/dashboard/editar"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #DDE6DF", color: "#173A34" }}
            >
              Editar datos del establecimiento
            </Link>
          </div>
        </div>

        <Resumen resumen={resumen} />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className="rounded-full px-3 py-1.5 text-sm font-medium transition"
                style={
                  filtro === f.id
                    ? { background: "#173A34", color: "#fff" }
                    : { background: "#fff", color: "#587168", border: "1px solid #DDE6DF" }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar trámite u organismo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="rounded-md px-3 py-1.5 text-sm"
              style={{ border: "1px solid #DDE6DF", background: "#fff", color: "#173A34" }}
            />
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              className="rounded-md px-3 py-1.5 text-sm"
              style={{ border: "1px solid #DDE6DF", background: "#fff", color: "#173A34" }}
            >
              <option value="prioridad">Ordenar por prioridad</option>
              <option value="vencimiento">Ordenar por vencimiento</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {visibles.map((item) => (
            <FilaTramite
              key={item.cumplimiento.id}
              item={item}
              establecimientoId={establecimiento.id}
              dependenciasPendientes={dependenciasPendientes(item.tramite)}
              temaNombre={temasPorId.get(item.tramite.tema_ref)?.nombre}
              expandido={expandidoId === item.cumplimiento.id}
              onToggle={() =>
                setExpandidoId((prev) =>
                  prev === item.cumplimiento.id ? null : item.cumplimiento.id
                )
              }
              onCambiarEstado={cambiarEstado}
              onCambiarFecha={cambiarFecha}
            />
          ))}
          {visibles.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: "#587168" }}>
              No hay trámites que coincidan con este filtro o búsqueda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Resumen({ resumen }) {
  const total = resumen.total || 0;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-[1.2fr_1fr]">
      {/* Tarjeta principal: cuántos trámites aplican y cuántos requieren acción */}
      <div className="rounded-lg p-5" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
        <p className="text-sm" style={{ color: "#587168" }}>
          Trámites aplicables
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-semibold" style={{ color: "#173A34" }}>
            {total}
          </span>
          {resumen.requierenAccion > 0 && (
            <span className="text-sm font-medium" style={{ color: "#b45309" }}>
              {resumen.requierenAccion} requieren acción
            </span>
          )}
        </div>

        {/* Barra de progreso: pendiente / en trámite / vigente */}
        {total > 0 && (
          <div className="mt-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "#EEF2EE" }}>
              {resumen.pendiente > 0 && (
                <div style={{ width: `${pct(resumen.pendiente)}%`, background: "#f0b429" }} />
              )}
              {resumen["en trámite"] > 0 && (
                <div style={{ width: `${pct(resumen["en trámite"])}%`, background: "#3b82f6" }} />
              )}
              {resumen.vigente > 0 && (
                <div style={{ width: `${pct(resumen.vigente)}%`, background: "#087E69" }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "#587168" }}>
              <span>{resumen.pendiente} pendientes</span>
              <span>{resumen["en trámite"]} en trámite</span>
              <span>{resumen.vigente} vigentes</span>
            </div>
          </div>
        )}
      </div>

      {/* Indicadores secundarios: solo destacan si son distintos de cero */}
      <div className="grid grid-cols-2 gap-4">
        <IndicadorSecundario
          titulo="Vencen pronto"
          valor={resumen.vencenPronto}
          activo={resumen.vencenPronto > 0}
          color="#b45309"
        />
        <IndicadorSecundario
          titulo="Vencidos"
          valor={resumen.vencidos}
          activo={resumen.vencidos > 0}
          color="#b91c1c"
        />
      </div>
    </div>
  );
}

function IndicadorSecundario({ titulo, valor, activo, color }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "#fff",
        border: activo ? `1px solid ${color}40` : "1px solid #DDE6DF",
      }}
    >
      <p className="text-xs" style={{ color: "#587168" }}>
        {titulo}
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ color: activo ? color : "#9ba8a2" }}
      >
        {valor}
      </p>
    </div>
  );
}

function FilaTramite({
  item,
  establecimientoId,
  dependenciasPendientes,
  temaNombre,
  expandido,
  onToggle,
  onCambiarEstado,
  onCambiarFecha,
}) {
  const { cumplimiento, tramite, normativas } = item;
  const alerta = alertaVencimiento(cumplimiento.fecha_vencimiento);
  const primerRequisito = tramite.requisitos?.[0];
  const primerRequisitoTarea =
    typeof primerRequisito === "string" ? primerRequisito : primerRequisito?.tarea;

  return (
    <div className="rounded-lg" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h3 className="font-medium" style={{ color: "#173A34" }}>
            {tramite.nombre}
          </h3>
          <p className="mt-0.5 text-sm" style={{ color: "#587168" }}>
            {temaNombre || tramite.tema_ref} · {tramite.organismo}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_COLOR[cumplimiento.estado]}`}
            >
              {cumplimiento.estado}
            </span>
            {cumplimiento.resultado === "requiere_revision" && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: "#FEF3E2", color: "#b45309" }}
              >
                ⚠ Alcance por verificar
              </span>
            )}
            {dependenciasPendientes.length > 0 ? (
              <span style={{ color: "#8a978f" }}>
                🔒 Depende de: {dependenciasPendientes.map((d) => d.nombre).join(", ")}
              </span>
            ) : (
              cumplimiento.estado !== "vigente" &&
              primerRequisitoTarea && (
                <span style={{ color: "#587168" }}>Próxima acción: {primerRequisitoTarea}</span>
              )
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {alerta && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                alerta.tono === "vencido"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              ⚠ {alerta.texto}
            </span>
          )}
          <span
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ color: "#087E69" }}
          >
            {expandido ? "Ocultar ▴" : "Ver requisitos ▾"}
          </span>
        </div>
      </button>

      {expandido && (
        <div
          className="grid gap-6 border-t px-5 py-5 sm:grid-cols-2"
          style={{ borderColor: "#EEF2EE" }}
        >
          {/* Área 1: qué hacer */}
          <div>
            <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#587168" }}>
              Requisitos
            </p>

            {dependenciasPendientes.length > 0 && (
              <div
                className="mt-2 rounded-md p-3 text-xs"
                style={{ background: "#F5F7F3", border: "1px solid #DDE6DF", color: "#587168" }}
              >
                🔒 Este trámite depende de que primero esté vigente:{" "}
                <strong>{dependenciasPendientes.map((d) => d.nombre).join(", ")}</strong>. Podés
                cargar datos mientras tanto, pero no vas a poder avanzarlo hasta resolver eso.
              </div>
            )}

            <p className="mt-2 text-sm" style={{ color: "#40544c" }}>
              {tramite.descripcion}
            </p>

            {normativas.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs" style={{ color: "#587168" }}>
                <span>Base legal:</span>
                {normativas.map((n, i) => (
                  <span key={n.id}>
                    {n.url_fuente ? (
                      <a
                        href={n.url_fuente}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "#087E69" }}
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
              <ol className="mt-4 space-y-3 text-sm">
                {tramite.requisitos.map((r, i) => {
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
                        <p className="font-medium" style={{ color: "#173A34" }}>
                          {req.tarea}
                        </p>
                        {req.detalle && (
                          <p className="mt-0.5" style={{ color: "#587168" }}>
                            {req.detalle}
                          </p>
                        )}
                        {(req.plazo || req.link) && (
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "#8a978f" }}>
                            {req.plazo && <span>⏱ {req.plazo}</span>}
                            {req.link && (
                              <a
                                href={req.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                style={{ color: "#087E69" }}
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
              </ol>
            )}

            <PorQueAplica cumplimiento={cumplimiento} normativas={normativas} />
          </div>

          {/* Área 2: gestionar */}
          <div>
            <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#587168" }}>
              Seguimiento
            </p>
            <div className="mt-3 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
                  Estado
                </span>
                <select
                  className="w-full rounded-md px-3 py-2"
                  style={{ border: "1px solid #DDE6DF" }}
                  value={cumplimiento.estado}
                  onChange={(e) => onCambiarEstado(cumplimiento.id, e.target.value)}
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
                    Obtenido
                  </span>
                  <input
                    type="date"
                    className="w-full rounded-md px-3 py-2"
                    style={{ border: "1px solid #DDE6DF" }}
                    value={cumplimiento.fecha_obtencion || ""}
                    onChange={(e) =>
                      onCambiarFecha(cumplimiento.id, "fecha_obtencion", e.target.value)
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
                    Vencimiento
                  </span>
                  <input
                    type="date"
                    className="w-full rounded-md px-3 py-2"
                    style={{ border: "1px solid #DDE6DF" }}
                    value={cumplimiento.fecha_vencimiento || ""}
                    onChange={(e) =>
                      onCambiarFecha(cumplimiento.id, "fecha_vencimiento", e.target.value)
                    }
                  />
                </label>
              </div>
              <p className="text-xs" style={{ color: "#8a978f" }}>
                Se sugiere sola al marcar el trámite como &ldquo;vigente&rdquo;, según la
                periodicidad del trámite — corregila si el organismo te dio otro
                plazo.
              </p>

              <Evidencias
                establecimientoId={establecimientoId}
                cumplimientoId={cumplimiento.id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

