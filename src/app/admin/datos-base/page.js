"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const TEMAS = [
  { id: "residuos_peligrosos", label: "Residuos peligrosos" },
  { id: "residuos_especiales", label: "Residuos especiales" },
  { id: "efluentes_liquidos", label: "Efluentes líquidos" },
  { id: "emisiones_gaseosas", label: "Emisiones gaseosas" },
  { id: "habilitacion_industrial", label: "Habilitación industrial" },
];

const FACTOR_VACIO = {
  nombre: "",
  esElectricidad: false,
  combustible: "",
  unidad: "",
  factor_kgco2_por_unidad: "",
  fuente: "",
};

const PROGRAMA_VACIO = {
  nombre: "",
  organismo: "",
  descripcion: "",
  beneficios: "",
  url_fuente: "",
  tema_ref: TEMAS[0].id,
  jurisdiccion_ref: "nacion",
  requisitos: [{ tarea: "", detalle: "" }],
};

/**
 * Panel para cargar directamente en Firestore, con formularios (sin tocar la
 * consola de Firebase), las colecciones de referencia que hoy hay que
 * completar a mano: `factores_emision` (GHG Protocol) y
 * `programas_produccion_limpia`. No auto-genera datos falsos: cada campo lo
 * completa el admin con el valor real, y "Fuente" queda obligatorio para que
 * quede citable en la tesis. `tramites`/`reglas`/`normativas` no están acá
 * todavía porque tienen una estructura más grande; se pueden sumar después
 * con el mismo patrón.
 */
export default function DatosBasePage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [jurisdicciones, setJurisdicciones] = useState([]);
  const [factores, setFactores] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil && perfil.role !== "admin") router.push("/dashboard");
  }, [loading, user, perfil, router]);

  async function recargar() {
    setCargando(true);
    const [jurSnap, facSnap, progSnap] = await Promise.all([
      getDocs(collection(db, "jurisdicciones")),
      getDocs(collection(db, "factores_emision")),
      getDocs(collection(db, "programas_produccion_limpia")),
    ]);
    setJurisdicciones(jurSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setFactores(facSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setProgramas(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => {
    if (!loading && perfil?.role === "admin") recargar();
  }, [loading, perfil]);

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!perfil || perfil.role !== "admin") return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/admin" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel de administración
      </Link>

      <h1 className="mt-4 text-2xl font-semibold" style={{ color: "#173A34" }}>
        Datos base
      </h1>
      <p className="mt-2 text-sm" style={{ color: "#587168" }}>
        Cargá acá los factores de emisión y los programas de Producción Limpia con un
        formulario, en vez de crear los documentos a mano en la consola de Firebase. No
        inventa valores: cada dato lo escribís vos con su fuente.
      </p>

      <SeccionFactores factores={factores} onCambio={recargar} />
      <SeccionProgramas
        programas={programas}
        jurisdicciones={jurisdicciones}
        onCambio={recargar}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Factores de emisión
// ---------------------------------------------------------------------------

function SeccionFactores({ factores, onCambio }) {
  const [form, setForm] = useState(FACTOR_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function actualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function editar(f) {
    setEditandoId(f.id);
    setForm({
      nombre: f.nombre || "",
      esElectricidad: f.combustible === "electricidad",
      combustible: f.combustible === "electricidad" ? "" : f.combustible || "",
      unidad: f.unidad || "",
      factor_kgco2_por_unidad: f.factor_kgco2_por_unidad ?? "",
      fuente: f.fuente || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(FACTOR_VACIO);
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim() || !form.unidad.trim() || !form.fuente.trim()) {
      setError("Nombre, unidad y fuente son obligatorios.");
      return;
    }
    if (!form.esElectricidad && !form.combustible.trim()) {
      setError("Indicá el id del combustible (ej: gas_natural, gasoil).");
      return;
    }
    const factorNum = Number(form.factor_kgco2_por_unidad);
    if (!form.factor_kgco2_por_unidad || Number.isNaN(factorNum) || factorNum <= 0) {
      setError("El factor de emisión tiene que ser un número mayor a 0.");
      return;
    }

    const datos = {
      nombre: form.nombre.trim(),
      combustible: form.esElectricidad ? "electricidad" : form.combustible.trim(),
      unidad: form.unidad.trim(),
      factor_kgco2_por_unidad: factorNum,
      fuente: form.fuente.trim(),
    };

    setGuardando(true);
    try {
      if (editandoId) {
        await updateDoc(doc(db, "factores_emision", editandoId), datos);
      } else {
        await addDoc(collection(db, "factores_emision"), datos);
      }
      cancelar();
      await onCambio();
    } catch (err) {
      console.error("No se pudo guardar el factor de emisión", err);
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    if (!confirm("¿Borrar este factor de emisión?")) return;
    await deleteDoc(doc(db, "factores_emision", id));
    await onCambio();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold" style={{ color: "#173A34" }}>
        Factores de emisión (GHG Protocol)
      </h2>
      <p className="mt-1 text-sm" style={{ color: "#587168" }}>
        Uno por combustible (alcance 1) y uno para electricidad (alcance 2). El factor es en
        kg de CO2 equivalente por unidad consumida.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-4 rounded-lg p-5"
        style={{ background: "#F5F7F3", border: "1px solid #DDE6DF" }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre (se muestra a la empresa)">
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              placeholder="Gas natural de red"
              className="campo"
            />
          </Campo>

          <label className="flex items-center gap-2 text-sm sm:mt-6" style={{ color: "#173A34" }}>
            <input
              type="checkbox"
              checked={form.esElectricidad}
              onChange={(e) => actualizar("esElectricidad", e.target.checked)}
            />
            Es electricidad (alcance 2)
          </label>

          {!form.esElectricidad && (
            <Campo label="Id del combustible (interno)">
              <input
                type="text"
                value={form.combustible}
                onChange={(e) => actualizar("combustible", e.target.value)}
                placeholder="gas_natural"
                className="campo"
              />
            </Campo>
          )}

          <Campo label="Unidad">
            <input
              type="text"
              value={form.unidad}
              onChange={(e) => actualizar("unidad", e.target.value)}
              placeholder="m3, litro, kWh..."
              className="campo"
            />
          </Campo>

          <Campo label="Factor (kg CO2 por unidad)">
            <input
              type="number"
              step="any"
              min="0"
              value={form.factor_kgco2_por_unidad}
              onChange={(e) => actualizar("factor_kgco2_por_unidad", e.target.value)}
              placeholder="2.02"
              className="campo"
            />
          </Campo>

          <Campo label="Fuente (obligatoria)" className="sm:col-span-2">
            <input
              type="text"
              value={form.fuente}
              onChange={(e) => actualizar("fuente", e.target.value)}
              placeholder="Ej: Factores de emisión de CAMMESA 2025, https://..."
              className="campo"
            />
          </Campo>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Agregar factor"}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelar}
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid #DDE6DF", color: "#587168" }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="mt-4 space-y-2">
        {factores.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm"
            style={{ border: "1px solid #DDE6DF" }}
          >
            <div className="min-w-0">
              <p className="font-medium" style={{ color: "#173A34" }}>
                {f.nombre}{" "}
                <span className="font-normal" style={{ color: "#8a978f" }}>
                  ({f.combustible === "electricidad" ? "electricidad — alcance 2" : `${f.combustible} — alcance 1`})
                </span>
              </p>
              <p className="mt-0.5" style={{ color: "#587168" }}>
                {f.factor_kgco2_por_unidad} kgCO2/{f.unidad} · {f.fuente}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => editar(f)} className="hover:underline" style={{ color: "#087E69" }}>
                Editar
              </button>
              <button onClick={() => eliminar(f.id)} className="text-red-600 hover:underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {factores.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "#8a978f" }}>
            Todavía no cargaste ningún factor de emisión.
          </p>
        )}
      </div>

      <style jsx>{`
        .campo {
          width: 100%;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #dde6df;
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Programas de Producción Limpia
// ---------------------------------------------------------------------------

function SeccionProgramas({ programas, jurisdicciones, onCambio }) {
  const [form, setForm] = useState(PROGRAMA_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const opcionesJurisdiccion = useMemo(
    () => [
      { id: "nacion", nombre: "Nación (todo el país)" },
      ...jurisdicciones
        .filter((j) => j.id !== "nacion")
        .map((j) => ({ id: j.id, nombre: j.nombre || j.id })),
    ],
    [jurisdicciones]
  );

  function actualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function actualizarRequisito(i, campo, valor) {
    setForm((prev) => {
      const requisitos = [...prev.requisitos];
      requisitos[i] = { ...requisitos[i], [campo]: valor };
      return { ...prev, requisitos };
    });
  }

  function agregarRequisito() {
    setForm((prev) => ({
      ...prev,
      requisitos: [...prev.requisitos, { tarea: "", detalle: "" }],
    }));
  }

  function quitarRequisito(i) {
    setForm((prev) => ({
      ...prev,
      requisitos: prev.requisitos.filter((_, idx) => idx !== i),
    }));
  }

  function editar(p) {
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre || "",
      organismo: p.organismo || "",
      descripcion: p.descripcion || "",
      beneficios: p.beneficios || "",
      url_fuente: p.url_fuente || "",
      tema_ref: p.tema_ref || TEMAS[0].id,
      jurisdiccion_ref: p.jurisdiccion_ref || "nacion",
      requisitos:
        p.requisitos?.length > 0
          ? p.requisitos.map((r) => (typeof r === "string" ? { tarea: r, detalle: "" } : r))
          : [{ tarea: "", detalle: "" }],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(PROGRAMA_VACIO);
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim() || !form.organismo.trim() || !form.descripcion.trim()) {
      setError("Nombre, organismo y descripción son obligatorios.");
      return;
    }
    const requisitos = form.requisitos
      .map((r) => ({ tarea: r.tarea.trim(), detalle: r.detalle.trim() }))
      .filter((r) => r.tarea);

    const datos = {
      nombre: form.nombre.trim(),
      organismo: form.organismo.trim(),
      descripcion: form.descripcion.trim(),
      beneficios: form.beneficios.trim(),
      url_fuente: form.url_fuente.trim(),
      tema_ref: form.tema_ref,
      jurisdiccion_ref: form.jurisdiccion_ref,
      requisitos,
    };

    setGuardando(true);
    try {
      if (editandoId) {
        await updateDoc(doc(db, "programas_produccion_limpia", editandoId), datos);
      } else {
        await addDoc(collection(db, "programas_produccion_limpia"), datos);
      }
      cancelar();
      await onCambio();
    } catch (err) {
      console.error("No se pudo guardar el programa", err);
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    if (!confirm("¿Borrar este programa? Las empresas que ya lo tengan como candidato lo van a dejar de ver.")) return;
    await deleteDoc(doc(db, "programas_produccion_limpia", id));
    await onCambio();
  }

  return (
    <section className="mt-14">
      <h2 className="text-lg font-semibold" style={{ color: "#173A34" }}>
        Programas de Producción Limpia
      </h2>
      <p className="mt-1 text-sm" style={{ color: "#587168" }}>
        Se le asignan a una empresa por tema ambiental + jurisdicción, igual que los trámites
        obligatorios.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-4 rounded-lg p-5"
        style={{ background: "#F5F7F3", border: "1px solid #DDE6DF" }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre del programa">
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              className="campo"
            />
          </Campo>
          <Campo label="Organismo">
            <input
              type="text"
              value={form.organismo}
              onChange={(e) => actualizar("organismo", e.target.value)}
              placeholder="Ministerio de Ambiente, municipio..."
              className="campo"
            />
          </Campo>

          <Campo label="Tema ambiental">
            <select
              value={form.tema_ref}
              onChange={(e) => actualizar("tema_ref", e.target.value)}
              className="campo"
            >
              {TEMAS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Jurisdicción">
            <select
              value={form.jurisdiccion_ref}
              onChange={(e) => actualizar("jurisdiccion_ref", e.target.value)}
              className="campo"
            >
              {opcionesJurisdiccion.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Descripción" className="sm:col-span-2">
            <textarea
              value={form.descripcion}
              onChange={(e) => actualizar("descripcion", e.target.value)}
              rows={3}
              className="campo"
            />
          </Campo>
          <Campo label="Qué gana la empresa (beneficios)" className="sm:col-span-2">
            <textarea
              value={form.beneficios}
              onChange={(e) => actualizar("beneficios", e.target.value)}
              rows={2}
              className="campo"
            />
          </Campo>
          <Campo label="Link con más información" className="sm:col-span-2">
            <input
              type="text"
              value={form.url_fuente}
              onChange={(e) => actualizar("url_fuente", e.target.value)}
              placeholder="https://..."
              className="campo"
            />
          </Campo>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium" style={{ color: "#173A34" }}>
            Pasos para sumarse
          </p>
          <div className="space-y-2">
            {form.requisitos.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={r.tarea}
                  onChange={(e) => actualizarRequisito(i, "tarea", e.target.value)}
                  placeholder={`Paso ${i + 1}`}
                  className="campo flex-1"
                />
                <input
                  type="text"
                  value={r.detalle}
                  onChange={(e) => actualizarRequisito(i, "detalle", e.target.value)}
                  placeholder="Detalle (opcional)"
                  className="campo flex-1"
                />
                {form.requisitos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarRequisito(i)}
                    className="px-2 text-sm text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={agregarRequisito}
            className="mt-2 text-sm hover:underline"
            style={{ color: "#087E69" }}
          >
            + Agregar paso
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Agregar programa"}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelar}
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid #DDE6DF", color: "#587168" }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="mt-4 space-y-2">
        {programas.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm"
            style={{ border: "1px solid #DDE6DF" }}
          >
            <div className="min-w-0">
              <p className="font-medium" style={{ color: "#173A34" }}>
                {p.nombre}
              </p>
              <p className="mt-0.5" style={{ color: "#587168" }}>
                {TEMAS.find((t) => t.id === p.tema_ref)?.label || p.tema_ref} ·{" "}
                {opcionesJurisdiccion.find((j) => j.id === p.jurisdiccion_ref)?.nombre ||
                  p.jurisdiccion_ref}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => editar(p)} className="hover:underline" style={{ color: "#087E69" }}>
                Editar
              </button>
              <button onClick={() => eliminar(p.id)} className="text-red-600 hover:underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {programas.length === 0 && (
          <p className="py-4 text-center text-sm" style={{ color: "#8a978f" }}>
            Todavía no cargaste ningún programa.
          </p>
        )}
      </div>

      <style jsx>{`
        .campo {
          width: 100%;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #dde6df;
        }
      `}</style>
    </section>
  );
}

function Campo({ label, children, className = "" }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
