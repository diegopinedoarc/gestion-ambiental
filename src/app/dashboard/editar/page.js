"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { generarChecklist } from "@/lib/matching";
import EstablecimientoForm, { ESTADO_INICIAL } from "@/components/EstablecimientoForm";

export default function EditarEstablecimientoPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();
  const [establecimiento, setEstablecimiento] = useState(null);
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
      const snap = await getDoc(doc(db, "establecimientos", perfil.establecimiento_ref));
      setEstablecimiento(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  async function onGuardar(datos) {
    const ref = doc(db, "establecimientos", perfil.establecimiento_ref);
    await updateDoc(ref, datos);
    // Volvemos a correr el matching con los datos actualizados: conserva el
    // estado de lo que ya estaba cargado, agrega lo nuevo que corresponda y
    // marca "no aplica" lo que deje de aplicar (ver generarChecklist).
    await generarChecklist(perfil.establecimiento_ref, datos);
    router.push("/dashboard");
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
      subtitle="Actualizá los datos de tu empresa. Al confirmar, volvemos a cruzar esta información contra la normativa vigente."
      confirmLabel="Guardar cambios"
      confirmLabelEnviando="Guardando..."
    />
  );
}
