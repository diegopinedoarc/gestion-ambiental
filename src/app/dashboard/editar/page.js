"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { generarChecklist, simularCambios, sincronizarProgramasPL } from "@/lib/matching";
import EstablecimientoForm, { ESTADO_INICIAL } from "@/components/EstablecimientoForm";

export default function EditarEstablecimientoPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimiento, setEstablecimiento] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Datos que el formulario está por guardar, y la comparación que arma
  // `simularCambios` a partir de ellos: mientras `pendiente` no sea null se
  // muestra la vista previa en vez del formulario, y todavía no se escribió
  // nada en Firestore.
  const [pendiente, setPendiente] = useState(null);
  const [comparacion, setComparacion] = useState([]);
  const [calculando, setCalculando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");

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
      const snap = await getDoc(doc(db, "establecimientos", perfil.establecimiento_ref));
      setEstablecimiento(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  // Primer paso: el formulario ya validó las respuestas, pero todavía no
  // escribimos nada. Calculamos qué cambiaría en el checklist y lo mostramos
  // antes de aplicar nada.
  async function onGuardar(datos) {
    setCalculando(true);
    setError("");
    try {
      const filas = await simularCambios(perfil.establecimiento_ref, datos);
      setComparacion(filas);
      setPendiente(datos);
    } catch (err) {
      console.error(err);
      setError("No se pudo calcular la comparación. Probá de nuevo.");
    } finally {
      setCalculando(false);
    }
  }

  // Segundo paso: recién acá se escribe en Firestore, después de que la
  // empresa vio el Antes/Después y confirmó.
  async function confirmarCambios() {
    setConfirmando(true);
    setError("");
    try {
      const ref = doc(db, "establecimientos", perfil.establecimiento_ref);
      await updateDoc(ref, pendiente);
      // Volvemos a correr el matching con los datos actualizados: conserva
      // el estado de lo que ya estaba cargado, agrega lo nuevo que
      // corresponda y marca "no aplica" lo que deje de aplicar.
      await generarChecklist(perfil.establecimiento_ref, pendiente);
      await sincronizarProgramasPL(perfil.establecimiento_ref, pendiente);
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar. Probá de nuevo.");
      setConfirmando(false);
    }
  }

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm text-neutral-500">
        Cargando...
      </div>
    );
  }

  if (!user || (perfil && !perfil.establecimiento_ref)) return null;

  if (!establecimiento) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm text-neutral-500">
        No se encontró el establecimiento.
      </div>
    );
  }

  if (calculando) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm text-neutral-500">
        Calculando qué cambiaría en tu checklist...
      </div>
    );
  }

  if (pendiente) {
    return (
      <VistaPrevia
        comparacion={comparacion}
        confirmando={confirmando}
        error={error}
        onVolver={() => {
          setPendiente(null);
          setComparacion([]);
          setError("");
        }}
        onConfirmar={confirmarCambios}
      />
    );
  }

  // El formulario espera strings vacíos (no null/undefined) en los campos
  // numéricos para que los inputs controlados no tiren warnings de React.
  const initialForm = {
    ...ESTADO_INICIAL,
    ...establecimiento,
    empleados: establecimiento.empleados ?? "",
    superficieM2: establecimiento.superficieM2 ?? "",
    consumoAguaM3Dia: establecimiento.consumoAguaM3Dia ?? "",
  };

  return (
    <EstablecimientoForm
      initialForm={initialForm}
      onGuardar={onGuardar}
      title="Editar establecimiento"
      subtitle="Actualizá los datos de tu empresa. Antes de guardar, te mostramos qué cambiaría en tu checklist."
      confirmLabel="Ver cambios antes de guardar"
      confirmLabelEnviando="Calculando..."
    />
  );
}

function VistaPrevia({ comparacion, confirmando, error, onVolver, onConfirmar }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Revisá los cambios antes de guardar</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Esto es lo que va a cambiar en tu checklist si confirmás estos datos.
        Todavía no se guardó nada.
      </p>

      {comparacion.length === 0 ? (
        <p className="mt-8 rounded-lg border border-neutral-200 p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          Los datos del establecimiento cambian, pero tu checklist de trámites
          no se modifica: ningún trámite pasa a identificarse, dejar de
          aplicar o quedar por confirmar.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Trámite</th>
                <th className="px-4 py-2 font-medium">Antes</th>
                <th className="px-4 py-2 font-medium">Después</th>
                <th className="px-4 py-2 font-medium">Acción del sistema</th>
              </tr>
            </thead>
            <tbody>
              {comparacion.map((fila) => (
                <tr key={fila.tramiteId} className="border-t border-neutral-100 dark:border-neutral-900">
                  <td className="px-4 py-2 font-medium">{fila.tramiteNombre}</td>
                  <td className="px-4 py-2 text-neutral-500">{fila.antes}</td>
                  <td className="px-4 py-2 text-neutral-500">{fila.despues}</td>
                  <td className="px-4 py-2 text-neutral-500">{fila.accion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        En todos los casos se conserva el historial de evaluaciones y, para
        los trámites que ya tenías en gestión, las fechas y certificados
        cargados.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={onVolver}
          disabled={confirmando}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          Volver a editar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={confirmando}
          className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {confirmando ? "Guardando..." : "Confirmar cambios"}
        </button>
      </div>
    </div>
  );
}
