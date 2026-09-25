"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { generarChecklist, sincronizarProgramasPL } from "@/lib/matching";
import EstablecimientoForm from "@/components/EstablecimientoForm";

export default function OnboardingPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  // Antes de ofrecer el alta de un establecimiento propio, nos fijamos si
  // hay una invitación pendiente esperando a este mail (alguien lo invitó
  // desde /dashboard/equipo). Si la hay, se la ofrecemos primero.
  const [buscandoInvitacion, setBuscandoInvitacion] = useState(true);
  const [invitacion, setInvitacion] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && perfil?.establecimiento_ref) router.push("/dashboard");
  }, [loading, user, perfil, router]);

  useEffect(() => {
    async function buscarInvitacion() {
      if (!user || perfil?.establecimiento_ref) {
        setBuscandoInvitacion(false);
        return;
      }
      setBuscandoInvitacion(true);
      try {
        const email = (user.email || "").toLowerCase();
        const q = query(
          collection(db, "invitaciones"),
          where("email", "==", email),
          where("estado", "==", "pendiente")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const inv = { id: snap.docs[0].id, ...snap.docs[0].data() };
          const estSnap = await getDoc(doc(db, "establecimientos", inv.establecimiento_ref));
          setInvitacion({
            ...inv,
            establecimientoNombre: estSnap.exists() ? estSnap.data().nombre : "una empresa",
          });
        } else {
          setInvitacion(null);
        }
      } catch (err) {
        console.error("No se pudo buscar invitaciones pendientes", err);
        setInvitacion(null);
      } finally {
        setBuscandoInvitacion(false);
      }
    }
    if (!loading) buscarInvitacion();
  }, [loading, user, perfil]);

  async function aceptarInvitacion() {
    if (!invitacion) return;
    setProcesando(true);
    setError("");
    try {
      await setDoc(
        doc(db, "establecimientos", invitacion.establecimiento_ref, "colaboradores", user.uid),
        { email: (user.email || "").toLowerCase(), agregado: serverTimestamp() }
      );
      await updateDoc(doc(db, "invitaciones", invitacion.id), { estado: "aceptada" });
      await setDoc(
        doc(db, "usuarios", user.uid),
        { establecimiento_ref: invitacion.establecimiento_ref },
        { merge: true }
      );
      router.push("/dashboard");
    } catch (err) {
      console.error("No se pudo aceptar la invitación", err);
      setError("No se pudo aceptar la invitación. Probá de nuevo.");
      setProcesando(false);
    }
  }

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
    await sincronizarProgramasPL(ref.id, conUsuario);
    router.push("/dashboard");
  }

  if (loading || !user || buscandoInvitacion) return null;

  if (invitacion) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold" style={{ color: "#173A34" }}>
          Te invitaron a {invitacion.establecimientoNombre}
        </h1>
        <p className="mt-3 text-sm" style={{ color: "#587168" }}>
          Podés sumarte para ver y gestionar el checklist ambiental de esta empresa junto al
          resto del equipo.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setInvitacion(null)}
            disabled={procesando}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
          >
            Prefiero crear mi propia empresa
          </button>
          <button
            type="button"
            onClick={aceptarInvitacion}
            disabled={procesando}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {procesando ? "Uniéndome..." : "Unirme al equipo"}
          </button>
        </div>
      </div>
    );
  }

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
