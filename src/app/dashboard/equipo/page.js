"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

/**
 * Permite compartir el acceso a un establecimiento con más de una persona
 * (por ej. el dueño de la empresa y quien lleva el día a día del
 * cumplimiento ambiental). No hay backend propio para buscar usuarios por
 * mail, así que invitar a alguien crea un documento en `invitaciones` con
 * un id determinístico (`{establecimientoId}__{email}`); cuando esa
 * persona se registra o inicia sesión con ese mismo mail, `/onboarding`
 * se la ofrece para aceptar, y recién ahí se suma a
 * `establecimientos/{id}/colaboradores` (ver firestore.rules).
 */
export default function EquipoPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [establecimiento, setEstablecimiento] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [email, setEmail] = useState("");
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState("");

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

    const [estSnap, colabSnap, invSnap] = await Promise.all([
      getDoc(doc(db, "establecimientos", estId)),
      getDocs(collection(db, "establecimientos", estId, "colaboradores")),
      getDocs(
        query(
          collection(db, "invitaciones"),
          where("establecimiento_ref", "==", estId),
          where("estado", "==", "pendiente")
        )
      ),
    ]);

    setEstablecimiento(estSnap.exists() ? { id: estSnap.id, ...estSnap.data() } : null);
    setColaboradores(colabSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setInvitaciones(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function onInvitar(e) {
    e.preventDefault();
    setError("");
    const limpio = email.trim().toLowerCase();
    if (!limpio || !limpio.includes("@")) {
      setError("Ingresá un email válido.");
      return;
    }

    const estId = perfil.establecimiento_ref;
    const yaEsColaborador = colaboradores.some((c) => c.email === limpio);
    const yaInvitado = invitaciones.some((i) => i.email === limpio);
    if (yaEsColaborador) {
      setError("Esa persona ya tiene acceso.");
      return;
    }
    if (yaInvitado) {
      setError("Ya hay una invitación pendiente para ese mail.");
      return;
    }

    setInvitando(true);
    try {
      const invId = `${estId}__${limpio}`;
      await setDoc(doc(db, "invitaciones", invId), {
        establecimiento_ref: estId,
        email: limpio,
        estado: "pendiente",
        invitado_por: user.uid,
        creado: serverTimestamp(),
      });
      setEmail("");
      await cargar();
    } catch (err) {
      console.error("No se pudo enviar la invitación", err);
      setError("No se pudo enviar la invitación. Probá de nuevo.");
    } finally {
      setInvitando(false);
    }
  }

  async function onCancelarInvitacion(invId) {
    try {
      await deleteDoc(doc(db, "invitaciones", invId));
      setInvitaciones((prev) => prev.filter((i) => i.id !== invId));
    } catch (err) {
      console.error("No se pudo cancelar la invitación", err);
      setError("No se pudo cancelar la invitación.");
    }
  }

  async function onQuitarColaborador(uid) {
    try {
      const estId = perfil.establecimiento_ref;
      await deleteDoc(doc(db, "establecimientos", estId, "colaboradores", uid));
      setColaboradores((prev) => prev.filter((c) => c.id !== uid));
    } catch (err) {
      console.error("No se pudo quitar el acceso", err);
      setError("No se pudo quitar el acceso.");
    }
  }

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!user || (perfil && !perfil.establecimiento_ref)) return null;

  const esDueño = establecimiento?.usuario_ref === user.uid;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Compartir acceso</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Invitá a otra persona de {establecimiento?.nombre || "tu empresa"} a ver y gestionar
        el mismo checklist. Va a poder entrar apenas se registre (o inicie sesión) con el
        mail que invitaste acá — no hace falta que ya tenga cuenta.
      </p>

      <form onSubmit={onInvitar} className="mt-6 flex flex-wrap gap-2">
        <input
          type="email"
          placeholder="email@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={invitando}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {invitando ? "Invitando..." : "Invitar"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Con acceso ({colaboradores.length + 1})
        </h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2.5 text-sm dark:border-neutral-800">
            <span>
              {esDueño ? "Vos" : "Dueño de la empresa"}
              <span className="ml-2 text-xs text-neutral-400">no se puede quitar</span>
            </span>
          </li>
          {colaboradores.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2.5 text-sm dark:border-neutral-800"
            >
              <span>
                {c.email || c.id}
                {c.id === user.uid ? " (vos)" : ""}
              </span>
              {(esDueño || c.id === user.uid) && (
                <button
                  type="button"
                  onClick={() => onQuitarColaborador(c.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  {c.id === user.uid ? "Salir" : "Quitar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {invitaciones.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Invitaciones pendientes
          </h2>
          <ul className="mt-3 space-y-2">
            {invitaciones.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2.5 text-sm dark:border-neutral-800"
              >
                <span>{inv.email}</span>
                <button
                  type="button"
                  onClick={() => onCancelarInvitacion(inv.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
