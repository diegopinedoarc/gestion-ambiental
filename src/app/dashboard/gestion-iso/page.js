"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { buscarRequisitosIso, sincronizarCumplimientoIso } from "@/lib/matching";
import Evidencias from "@/components/Evidencias";

const NORMAS_ISO = [
  {
    id: "14001",
    nombre: "ISO 14001",
    subtitulo: "Gestión ambiental",
    descripcion:
      "Ordena cómo la empresa identifica y controla sus impactos ambientales (residuos, efluentes, emisiones, consumo de recursos) de forma sistemática, no solo reactiva.",
    para_quien:
      "Empresas a las que un cliente grande, una licitación o un banco/asegurador les pide demostrar que gestionan el riesgo ambiental de forma ordenada.",
    beneficio_general:
      "Reduce costos (menos residuos, menos reprocesos), facilita entrar a cadenas de proveedores industriales que la exigen, y deja un historial auditable de lo que ya la app registra para lo legal.",
  },
  {
    id: "9001",
    nombre: "ISO 9001",
    subtitulo: "Gestión de calidad",
    descripcion:
      "Misma lógica que 14001, pero sobre la conformidad del producto/servicio y la satisfacción del cliente, en vez de los aspectos ambientales.",
    para_quien:
      "Empresas que quieren demostrarle a sus clientes procesos de calidad consistentes, o que lo necesitan como requisito de una licitación o de un cliente grande.",
    beneficio_general:
      "Menos reprocesos y reclamos, procesos documentados que no dependen de una sola persona, y un antecedente formal para negociar con clientes exigentes.",
  },
];

const ESTADOS = ["no_iniciado", "en_progreso", "implementado"];
const ESTADO_LABEL = {
  no_iniciado: "No iniciado",
  en_progreso: "En progreso",
  implementado: "Implementado",
};
const ESTADO_COLOR = {
  no_iniciado: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  en_progreso: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  implementado: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
};

/**
 * Gestión ISO 14001 / ISO 9001 (Etapa A del plan: diagnóstico inicial).
 * Vive separada del checklist legal a propósito — es voluntario, no una
 * obligación, misma distinción que ya se hizo con Producción Limpia.
 *
 * A diferencia del checklist legal, acá no hay "aplica o no aplica" por
 * tema/jurisdicción: si la empresa elige perseguir una norma, TODOS sus
 * requisitos le corresponden. Por eso el foco de esta pantalla está en
 * explicar, requisito por requisito, "¿por qué aplica?" (qué exige la
 * norma y para qué) y "beneficio" (qué gana la empresa) — es lo que evita
 * que se sienta como un formulario burocrático sin sentido.
 */
export default function GestionIsoPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [establecimiento, setEstablecimiento] = useState(null);
  const [requisitos, setRequisitos] = useState([]);
  const [cumplimientos, setCumplimientos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarSeleccion, setMostrarSeleccion] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && perfil && !perfil.establecimiento_ref) {
      router.push("/onboarding");
    }
  }, [loading, user, perfil, router]);

  async function cargar() {
    if (!perfil?.establecimiento_ref) return;
    setCargando(true);
    const estId = perfil.establecimiento_ref;

    const estSnap = await getDoc(doc(db, "establecimientos", estId));
    const est = estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null;
    setEstablecimiento(est);

    const normasInteres = est?.normas_iso_interes || [];
    if (normasInteres.length > 0) {
      const [reqs, cumplSnap, colabSnap] = await Promise.all([
        buscarRequisitosIso(normasInteres),
        getDocs(query(collection(db, "cumplimiento_iso"), where("establecimiento_ref", "==", estId))),
        getDocs(collection(db, "establecimientos", estId, "colaboradores")),
      ]);
      setRequisitos(reqs);
      setCumplimientos(cumplSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setColaboradores(colabSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } else {
      setRequisitos([]);
      setCumplimientos([]);
      setColaboradores([]);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function onElegirNormas(normas) {
    const estId = perfil.establecimiento_ref;
    await updateDoc(doc(db, "establecimientos", estId), { normas_iso_interes: normas });
    await sincronizarCumplimientoIso(estId, normas);
    setMostrarSeleccion(false);
    await cargar();
  }

  async function cambiarEstado(cumplimientoId, estado) {
    await updateDoc(doc(db, "cumplimiento_iso", cumplimientoId), { estado });
    setCumplimientos((prev) => prev.map((c) => (c.id === cumplimientoId ? { ...c, estado } : c)));
  }

  async function cambiarResponsable(cumplimientoId, uid) {
    const valor = uid || null;
    await updateDoc(doc(db, "cumplimiento_iso", cumplimientoId), { responsable_uid: valor });
    setCumplimientos((prev) =>
      prev.map((c) => (c.id === cumplimientoId ? { ...c, responsable_uid: valor } : c))
    );
  }

  const items = useMemo(() => {
    const cumplPorRequisito = new Map(cumplimientos.map((c) => [c.requisito_ref, c]));
    return requisitos
      .map((requisito) => ({ requisito, cumplimiento: cumplPorRequisito.get(requisito.id) }))
      .filter((x) => x.cumplimiento);
  }, [requisitos, cumplimientos]);

  const porNorma = useMemo(() => {
    const mapa = new Map();
    items.forEach((item) => {
      const arr = mapa.get(item.requisito.norma) || [];
      arr.push(item);
      mapa.set(item.requisito.norma, arr);
    });
    for (const arr of mapa.values()) {
      arr.sort((a, b) => {
        const ca = Number(a.requisito.clausula) || 0;
        const cb = Number(b.requisito.clausula) || 0;
        return ca - cb;
      });
    }
    return mapa;
  }, [items]);

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!establecimiento) return null;

  const normasInteres = establecimiento.normas_iso_interes || [];
  const sinNormas = normasInteres.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold" style={{ color: "#173A34" }}>
        Gestión ISO
      </h1>
      <p className="mt-2 text-sm" style={{ color: "#587168" }}>
        Certificaciones <strong>voluntarias</strong> (no las exige la ley): preparan a la
        empresa para el sistema de gestión que pide ISO 14001 y/o ISO 9001, de cara a una
        futura auditoría de certificación. La app no certifica — eso siempre lo hace un
        organismo externo — pero ayuda a ordenar el camino hasta ahí.
      </p>

      {sinNormas || mostrarSeleccion ? (
        <SeleccionNormas
          seleccionInicial={normasInteres}
          onConfirmar={onElegirNormas}
          onCancelar={sinNormas ? null : () => setMostrarSeleccion(false)}
        />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              {normasInteres.map((n) => {
                const arr = porNorma.get(n) || [];
                const implementados = arr.filter((x) => x.cumplimiento.estado === "implementado").length;
                const pct = arr.length ? Math.round((implementados / arr.length) * 100) : 0;
                const info = NORMAS_ISO.find((x) => x.id === n);
                return (
                  <div
                    key={n}
                    className="rounded-lg px-4 py-3"
                    style={{ background: "#fff", border: "1px solid #DDE6DF" }}
                  >
                    <p className="text-sm font-medium" style={{ color: "#173A34" }}>
                      ISO {n} — {info?.subtitulo}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "#587168" }}>
                      {implementados}/{arr.length} requisitos implementados ({pct}%)
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setMostrarSeleccion(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: "#087E69" }}
            >
              Sumar otra norma
            </button>
          </div>

          {Array.from(porNorma.entries()).map(([norma, arr]) => (
            <BloqueNorma
              key={norma}
              norma={norma}
              items={arr}
              colaboradores={colaboradores}
              establecimientoId={establecimiento.id}
              onCambiarEstado={cambiarEstado}
              onCambiarResponsable={cambiarResponsable}
            />
          ))}

          {items.length === 0 && (
            <p className="mt-8 text-sm" style={{ color: "#587168" }}>
              Todavía no hay requisitos cargados para {normasInteres.join(" / ")}. Se cargan
              desde el panel de administración.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SeleccionNormas({ seleccionInicial, onConfirmar, onCancelar }) {
  const [seleccion, setSeleccion] = useState(new Set(seleccionInicial));
  const [guardando, setGuardando] = useState(false);

  function toggle(id) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  async function confirmar() {
    setGuardando(true);
    try {
      await onConfirmar(Array.from(seleccion));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-8">
      <p className="text-sm font-medium" style={{ color: "#173A34" }}>
        ¿Qué norma(s) te interesa implementar?
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {NORMAS_ISO.map((n) => {
          const activa = seleccion.has(n.id);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => toggle(n.id)}
              className="rounded-lg p-4 text-left"
              style={{
                background: activa ? "#F5F7F3" : "#fff",
                border: activa ? "2px solid #087E69" : "1px solid #DDE6DF",
              }}
            >
              <p className="font-medium" style={{ color: "#173A34" }}>
                {n.nombre} — {n.subtitulo}
              </p>
              <p className="mt-2 text-xs" style={{ color: "#40544c" }}>
                {n.descripcion}
              </p>
              <p className="mt-2 text-xs" style={{ color: "#587168" }}>
                <strong>¿Para quién es?</strong> {n.para_quien}
              </p>
              <p className="mt-2 text-xs" style={{ color: "#587168" }}>
                <strong>Beneficio:</strong> {n.beneficio_general}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={confirmar}
          disabled={seleccion.size === 0 || guardando}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Empezar diagnóstico"}
        </button>
        {onCancelar && (
          <button
            onClick={onCancelar}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ border: "1px solid #DDE6DF", color: "#587168" }}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function BloqueNorma({ norma, items, colaboradores, establecimientoId, onCambiarEstado, onCambiarResponsable }) {
  const clausulas = useMemo(() => {
    const mapa = new Map();
    items.forEach((item) => {
      const key = `${item.requisito.clausula}. ${item.requisito.clausula_nombre}`;
      const arr = mapa.get(key) || [];
      arr.push(item);
      mapa.set(key, arr);
    });
    return Array.from(mapa.entries());
  }, [items]);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold" style={{ color: "#173A34" }}>
        ISO {norma}
      </h2>
      <div className="mt-3 space-y-6">
        {clausulas.map(([clausula, arr]) => (
          <div key={clausula}>
            <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#587168" }}>
              Cláusula {clausula}
            </p>
            <div className="mt-2 space-y-2">
              {arr.map(({ requisito, cumplimiento }) => (
                <FilaRequisito
                  key={requisito.id}
                  requisito={requisito}
                  cumplimiento={cumplimiento}
                  colaboradores={colaboradores}
                  establecimientoId={establecimientoId}
                  onCambiarEstado={onCambiarEstado}
                  onCambiarResponsable={onCambiarResponsable}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilaRequisito({
  requisito,
  cumplimiento,
  colaboradores,
  establecimientoId,
  onCambiarEstado,
  onCambiarResponsable,
}) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="rounded-lg" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
      <button
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <p className="min-w-0 font-medium" style={{ color: "#173A34" }}>
          {requisito.requisito}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_COLOR[cumplimiento.estado]}`}
          >
            {ESTADO_LABEL[cumplimiento.estado]}
          </span>
          <span className="text-sm font-medium" style={{ color: "#087E69" }}>
            {expandido ? "Ocultar ▴" : "Ver más ▾"}
          </span>
        </div>
      </button>

      {expandido && (
        <div className="border-t px-4 py-4" style={{ borderColor: "#EEF2EE" }}>
          <p className="text-sm" style={{ color: "#40544c" }}>
            {requisito.descripcion}
          </p>

          <div
            className="mt-3 space-y-2 rounded-md p-3 text-xs"
            style={{ background: "#F5F7F3", border: "1px solid #DDE6DF" }}
          >
            <p>
              <span className="font-medium" style={{ color: "#173A34" }}>
                ¿Por qué aplica?
              </span>{" "}
              <span style={{ color: "#40544c" }}>{requisito.por_que_aplica}</span>
            </p>
            <p>
              <span className="font-medium" style={{ color: "#173A34" }}>
                Beneficio de cumplirlo
              </span>{" "}
              <span style={{ color: "#40544c" }}>{requisito.beneficio}</span>
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>

            {colaboradores.length > 0 && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
                  Responsable
                </span>
                <select
                  className="w-full rounded-md px-3 py-2"
                  style={{ border: "1px solid #DDE6DF" }}
                  value={cumplimiento.responsable_uid || ""}
                  onChange={(e) => onCambiarResponsable(cumplimiento.id, e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.email || c.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <Evidencias
            establecimientoId={establecimientoId}
            cumplimientoId={cumplimiento.id}
            coleccion="cumplimiento_iso"
          />
        </div>
      )}
    </div>
  );
}
