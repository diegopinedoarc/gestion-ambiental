"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const PASOS = ["Datos del establecimiento", "Preguntas ambientales", "Revisión"];

export const DESTINOS_VUELCO = [
  { value: "cloaca", label: "Colectora cloacal" },
  { value: "curso_agua", label: "Curso / cuerpo de agua superficial" },
  { value: "absorcion_suelo", label: "Absorción por el suelo" },
  { value: "mar_abierto", label: "Mar abierto" },
];

export const ESTADO_INICIAL = {
  nombre: "",
  cuit: "",
  direccion: "",
  industria_ref: "",
  jurisdiccion_ref: "",
  situacion: "existente", // "nuevo" | "existente"
  empleados: "",
  superficieM2: "",
  procesos: "",
  generaResiduosPeligrosos: false,
  // Tri-estado (true | false | null): "null" es "no estoy seguro", y es
  // justo lo que hace que la regla de SIMEL quede en "requiere revisión" en
  // vez de asumir aplica o no_aplica sin tener el dato.
  transporteInterprovincial: null,
  jurisdiccionNacional: null,
  generaResiduosEspeciales: false,
  consumoAguaM3Dia: "",
  vuelcaEfluentes: false,
  destinoVuelco: "",
  tieneEmisionesGaseosas: false,
  tieneHabilitacionVigente: false,
};

/**
 * Wizard de 3 pasos para cargar o editar un establecimiento. No escribe en
 * Firestore por sí mismo: al confirmar, arma el objeto `datos` (con los
 * campos numéricos ya convertidos) y se lo pasa a `onGuardar`, que es quien
 * decide si crea un establecimiento nuevo (onboarding) o actualiza uno
 * existente (edición) y vuelve a correr `generarChecklist`.
 */
export default function EstablecimientoForm({
  initialForm = ESTADO_INICIAL,
  onGuardar,
  title = "Alta de establecimiento",
  subtitle = "Con estos datos vamos a armar automáticamente el checklist de normativa y trámites que le aplican a tu empresa.",
  confirmLabel = "Confirmar y ver mi panel",
  confirmLabelEnviando = "Guardando...",
}) {
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [industrias, setIndustrias] = useState([]);
  const [municipios, setMunicipios] = useState([]);

  useEffect(() => {
    async function cargarOpciones() {
      const [indSnap, munSnap] = await Promise.all([
        getDocs(collection(db, "industrias")),
        getDocs(query(collection(db, "jurisdicciones"), where("nivel", "==", "municipal"))),
      ]);
      setIndustrias(indSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setMunicipios(munSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    cargarOpciones();
  }, []);

  function update(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function siguiente() {
    setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  }
  function anterior() {
    setPaso((p) => Math.max(p - 1, 0));
  }

  async function confirmar() {
    if (!form.industria_ref || !form.jurisdiccion_ref) {
      setError("Elegí el rubro y el municipio antes de confirmar.");
      setPaso(0);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const datos = {
        ...form,
        empleados: form.empleados ? Number(form.empleados) : null,
        superficieM2: form.superficieM2 ? Number(form.superficieM2) : null,
        consumoAguaM3Dia: form.consumoAguaM3Dia
          ? Number(form.consumoAguaM3Dia)
          : 0,
      };
      await onGuardar(datos);
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>

      <ol className="mt-8 mb-10 flex gap-4 text-sm">
        {PASOS.map((p, i) => (
          <li
            key={p}
            className={`flex items-center gap-2 ${
              i === paso ? "font-semibold text-emerald-600" : "text-neutral-400"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                i === paso
                  ? "border-emerald-600 text-emerald-600"
                  : "border-neutral-300"
              }`}
            >
              {i + 1}
            </span>
            {p}
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <div className="space-y-4">
          <Campo label="Razón social">
            <input
              className="input"
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
            />
          </Campo>
          <Campo label="CUIT">
            <input
              className="input"
              value={form.cuit}
              onChange={(e) => update("cuit", e.target.value)}
              placeholder="30-XXXXXXXX-X"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Rubro / industria">
              <select
                className="input"
                value={form.industria_ref}
                onChange={(e) => update("industria_ref", e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {industrias.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Municipio">
              <select
                className="input"
                value={form.jurisdiccion_ref}
                onChange={(e) => update("jurisdiccion_ref", e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo label="Domicilio del establecimiento">
            <input
              className="input"
              value={form.direccion}
              onChange={(e) => update("direccion", e.target.value)}
            />
          </Campo>
          <Campo label="Situación del establecimiento">
            <select
              className="input"
              value={form.situacion}
              onChange={(e) => update("situacion", e.target.value)}
            >
              <option value="existente">Ya está operando</option>
              <option value="nuevo">Nuevo / a instalarse</option>
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Cantidad de empleados">
              <input
                type="number"
                min="0"
                className="input"
                value={form.empleados}
                onChange={(e) => update("empleados", e.target.value)}
              />
            </Campo>
            <Campo label="Superficie cubierta (m²)">
              <input
                type="number"
                min="0"
                className="input"
                value={form.superficieM2}
                onChange={(e) => update("superficieM2", e.target.value)}
              />
            </Campo>
          </div>
          <Campo label="Procesos productivos (breve descripción)">
            <textarea
              className="input"
              rows={3}
              value={form.procesos}
              onChange={(e) => update("procesos", e.target.value)}
              placeholder="Ej: síntesis y formulación de productos químicos, envasado..."
            />
          </Campo>
        </div>
      )}

      {paso === 1 && (
        <div className="space-y-6">
          <Toggle
            label="¿Genera residuos peligrosos (Ley 24.051 nacional)?"
            ayuda="Residuos que puedan causar daño a seres vivos o contaminar suelo, agua o atmósfera, de alcance interjurisdiccional."
            checked={form.generaResiduosPeligrosos}
            onChange={(v) => {
              update("generaResiduosPeligrosos", v);
              // Si deja de declarar residuos peligrosos, las preguntas de
              // alcance dejan de tener sentido: se limpian para no dejar un
              // dato viejo colgado.
              if (!v) {
                update("transporteInterprovincial", null);
                update("jurisdiccionNacional", null);
              }
            }}
          />
          {form.generaResiduosPeligrosos && (
            <div className="ml-4 space-y-4 border-l-2 border-neutral-200 pl-4 dark:border-neutral-800">
              <p className="text-xs text-neutral-500">
                Estas dos preguntas determinan si corresponde el Certificado
                Ambiental nacional y la inscripción en SIMEL (Ley 24.051), en
                vez de asumirlo solo por declarar residuos peligrosos.
              </p>
              <TriToggle
                label="¿El transporte de los residuos cruza los límites de la provincia?"
                valor={form.transporteInterprovincial}
                onChange={(v) => update("transporteInterprovincial", v)}
              />
              <TriToggle
                label="¿La actividad o el establecimiento están bajo jurisdicción nacional?"
                ayuda="Por ejemplo: establecimientos interjurisdiccionales o alcanzados directamente por la autoridad ambiental nacional."
                valor={form.jurisdiccionNacional}
                onChange={(v) => update("jurisdiccionNacional", v)}
              />
            </div>
          )}
          <Toggle
            label="¿Genera residuos especiales (categorías Anexo I, Ley 11.720 PBA)?"
            ayuda="Aceites, solventes, pinturas, lodos u otras sustancias con características de residuo especial."
            checked={form.generaResiduosEspeciales}
            onChange={(v) => update("generaResiduosEspeciales", v)}
          />
          <Campo label="Consumo de agua aproximado (m³/día)">
            <input
              type="number"
              min="0"
              className="input"
              value={form.consumoAguaM3Dia}
              onChange={(e) => update("consumoAguaM3Dia", e.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">
              A partir de 50 m³/día suele exigirse llevar registro de
              cantidad y calidad de efluentes (Res. ADA 336/03 u otra
              reglamentación equivalente según tu jurisdicción).
            </p>
          </Campo>
          <Toggle
            label="¿Vuelca efluentes líquidos a algún cuerpo receptor?"
            checked={form.vuelcaEfluentes}
            onChange={(v) => update("vuelcaEfluentes", v)}
          />
          {form.vuelcaEfluentes && (
            <Campo label="Destino del vuelco">
              <select
                className="input"
                value={form.destinoVuelco}
                onChange={(e) => update("destinoVuelco", e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {DESTINOS_VUELCO.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Toggle
            label="¿Tiene fuentes de emisión gaseosa a la atmósfera?"
            ayuda="Calderas, hornos, sistemas de extracción u otra fuente que vierta efluentes gaseosos."
            checked={form.tieneEmisionesGaseosas}
            onChange={(v) => update("tieneEmisionesGaseosas", v)}
          />
          <Toggle
            label="¿Ya cuenta con Certificado de Aptitud Ambiental / categorización industrial vigente?"
            checked={form.tieneHabilitacionVigente}
            onChange={(v) => update("tieneHabilitacionVigente", v)}
          />
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-5 text-sm dark:border-neutral-800">
          <Resumen label="Razón social" valor={form.nombre || "—"} />
          <Resumen label="CUIT" valor={form.cuit || "—"} />
          <Resumen
            label="Rubro"
            valor={industrias.find((i) => i.id === form.industria_ref)?.nombre || "—"}
          />
          <Resumen
            label="Municipio"
            valor={municipios.find((m) => m.id === form.jurisdiccion_ref)?.nombre || "—"}
          />
          <Resumen label="Domicilio" valor={form.direccion || "—"} />
          <Resumen
            label="Situación"
            valor={form.situacion === "nuevo" ? "Nuevo / a instalarse" : "Existente"}
          />
          <Resumen
            label="Residuos peligrosos"
            valor={form.generaResiduosPeligrosos ? "Sí" : "No"}
          />
          {form.generaResiduosPeligrosos && (
            <>
              <Resumen
                label="Transporte fuera de la provincia"
                valor={valorTriEstado(form.transporteInterprovincial)}
              />
              <Resumen
                label="Jurisdicción nacional"
                valor={valorTriEstado(form.jurisdiccionNacional)}
              />
            </>
          )}
          <Resumen
            label="Residuos especiales"
            valor={form.generaResiduosEspeciales ? "Sí" : "No"}
          />
          <Resumen
            label="Consumo de agua"
            valor={`${form.consumoAguaM3Dia || 0} m³/día`}
          />
          <Resumen
            label="Vuelca efluentes"
            valor={
              form.vuelcaEfluentes
                ? DESTINOS_VUELCO.find((d) => d.value === form.destinoVuelco)
                    ?.label || "Sí"
                : "No"
            }
          />
          <Resumen
            label="Emisiones gaseosas"
            valor={form.tieneEmisionesGaseosas ? "Sí" : "No"}
          />
          <Resumen
            label="Habilitación vigente"
            valor={form.tieneHabilitacionVigente ? "Sí" : "No"}
          />
          <p className="pt-2 text-xs text-neutral-500">
            Al confirmar, volvemos a cruzar esta información contra la
            normativa: se conserva el estado de lo que ya tenías cargado, se
            suma lo nuevo que corresponda, y se marca &ldquo;no aplica&rdquo;
            lo que deje de corresponder.
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex justify-between">
        <button
          onClick={anterior}
          disabled={paso === 0}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          Atrás
        </button>
        {paso < PASOS.length - 1 ? (
          <button
            onClick={siguiente}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={confirmar}
            disabled={enviando}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {enviando ? confirmLabelEnviando : confirmLabel}
          </button>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 212);
          padding: 0.5rem 0.75rem;
        }
        :global(.dark) .input {
          border-color: rgb(64 64 64);
          background: rgb(23 23 23);
        }
      `}</style>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, ayuda, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {ayuda && <p className="mt-1 text-xs text-neutral-500">{ayuda}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
          checked
            ? "bg-emerald-600 text-white"
            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        }`}
      >
        {checked ? "Sí" : "No"}
      </button>
    </div>
  );
}

function TriToggle({ label, ayuda, valor, onChange }) {
  const opciones = [
    { v: true, texto: "Sí" },
    { v: false, texto: "No" },
    { v: null, texto: "No estoy seguro" },
  ];
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-sm font-medium">{label}</p>
      {ayuda && <p className="mt-1 text-xs text-neutral-500">{ayuda}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {opciones.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              valor === o.v
                ? "bg-emerald-600 text-white"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

function valorTriEstado(v) {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "No estoy seguro";
}

function Resumen({ label, valor }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-900">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
