"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { generarChecklist } from "@/lib/matching";
import EstablecimientoForm from "@/components/EstablecimientoForm";

export default function OnboardingPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil?.establecimiento_ref) router.push("/dashboard");
  }, [loading, user, perfil, router]);

  async function onGuardar(datos) {
    const ref = doc(collection(db, "establecimientos"));
    const conUsuario = {
      ...datos,
      usuario_ref: user.uid,
      creado: serverTimestamp(),
    };
    await setDoc(ref, conUsuario);
    await setDoc(
      doc(db, "usuarios", user.uid),
      { establecimiento_ref: ref.id, nombreEmpresa: datos.nombre },
      { merge: true }
    );
    await generarChecklist(ref.id, conUsuario);
    router.push("/dashboard");
  }

  if (loading || !user) return null;

  return (
    <EstablecimientoForm
      onGuardar={onGuardar}
      title="Alta de establecimiento"
      subtitle="Con estos datos vamos a armar automáticamente el checklist de normativa y trámites que le aplican a tu empresa."
      confirmLabel="Confirmar y ver mi panel"
      confirmLabelEnviando="Generando checklist..."
    />
  );
}
