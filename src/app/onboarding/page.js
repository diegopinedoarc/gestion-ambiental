"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { generarChecklist } from "@/lib/matching";

const PASOS = ["Datos del establecimiento", "Preguntas ambientales", "Revisión"];

const DESTINOS_VUELCO = [
  { value: "cloaca", label: "Colectora cloacal" },
  { value: "curso_agua", label: "Curso / cuerpo de agua superficial" },
  { value: "absorcion_suelo", label: "Absorción por el suelo" },
  { value: "mar_abierto", label: "Mar abierto" },
];

const ESTADO_INICIAL = {
  nombre: "",
  cuit: "",
  direccion: "",
  situacion: "existente", // "nuevo" | "existente"
  empleados: "",
  superficieM2: "",
  procesos: "",
  generaResiduosPeligrosos: false,
  generaResiduosEspeciales: false,
  consumoAguaM3Dia: "",
  vuelcaEfluentes: false,
  destinoVuelco: "",
  tieneEmisionesGaseosas: false,
  tieneHabilitacionVigente: false,
};

export default function OnboardingPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(ESTADO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil?.establecimiento_ref) router.push("/dashboard");
  }, [loading, user, perfil, router]);

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
    setEnviando(true);
    setError("");
    try {
      const ref = doc(collection(db, "establecimientos"));
      const datos = {
        ...form,
        empleados: form.empleados ? Number(form.empleados) : null,
        superficieM2: form.superficieM2 ? Number(form.superficieM2) : null,
        consumoAguaM3Dia: form.consumoAguaM3Dia
          ? Number(form.consumoAguaM3Dia)
          : 0,
        industria_ref: "quimica",
        jurisdiccion_ref: "tigre",
        usuario_ref: user.uid,
        creado: serverTimestamp(),
      };
      await setDoc(ref, datos);
      await setDoc(
        doc(db, "usuarios", user.uid),
        { establecimiento_ref: ref.id, nombreEmpresa: form.nombre },
        { merge: true }
      );
      await generarChecklist(ref.id, datos);
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Alta de establecimiento</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Con estos datos vamos a armar automáticamente el checklist de
        normativa y trámites que le aplican a tu empresa.
      </p>

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
          <Campo label="Domicilio del establecimiento (Tigre)">
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
            onChange={(v) => update("generaResiduosPeligrosos", v)}
          />
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
              A partir de 50 m³/día la Res. ADA 336/03 exige llevar registro
              de cantidad y calidad de efluentes.
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
          <Resumen label="Domicilio" valor={form.direccion || "—"} />
          <Resumen
            label="Situación"
            valor={form.situacion === "nuevo" ? "Nuevo / a instalarse" : "Existente"}
          />
          <Resumen
            label="Residuos peligrosos"
            valor={form.generaResiduosPeligrosos ? "Sí" : "No"}
          />
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
            Al confirmar, generamos tu checklist de trámites según esta
            información. Vas a poder editarla después desde tu panel.
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
            {enviando ? "Generando checklist..." : "Confirmar y ver mi panel"}
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

function Resumen({ label, valor }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-900">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
