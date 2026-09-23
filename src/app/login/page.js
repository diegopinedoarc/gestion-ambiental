"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modo, setModo] = useState(
    searchParams.get("modo") === "registro" ? "registro" : "ingreso"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function redirigirSegunPerfil(uid) {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const perfil = snap.exists() ? snap.data() : null;
    if (perfil?.role === "admin") {
      router.push("/admin");
    } else if (perfil?.establecimiento_ref) {
      router.push("/dashboard");
    } else {
      router.push("/onboarding");
    }
  }

  async function handleRegistro(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        email,
        role: "cliente",
        nombreEmpresa: nombreEmpresa || null,
        establecimiento_ref: null,
        creado: serverTimestamp(),
      });
      router.push("/onboarding");
    } catch (err) {
      setError(traducirError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleIngreso(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await redirigirSegunPerfil(cred.user.uid);
    } catch (err) {
      setError(traducirError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-8 flex gap-2 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-900">
        <button
          className={`flex-1 rounded-md py-2 ${
            modo === "ingreso"
              ? "bg-white shadow dark:bg-neutral-800"
              : "text-neutral-500"
          }`}
          onClick={() => setModo("ingreso")}
        >
          Ingresar
        </button>
        <button
          className={`flex-1 rounded-md py-2 ${
            modo === "registro"
              ? "bg-white shadow dark:bg-neutral-800"
              : "text-neutral-500"
          }`}
          onClick={() => setModo("registro")}
        >
          Registrar empresa
        </button>
      </div>

      <h1 className="mb-6 text-xl font-semibold">
        {modo === "registro" ? "Crear cuenta de empresa" : "Ingresar"}
      </h1>

      <form
        onSubmit={modo === "registro" ? handleRegistro : handleIngreso}
        className="space-y-4"
      >
        {modo === "registro" && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Nombre de la empresa (opcional acá, lo completás en el paso
              siguiente)
            </label>
            <input
              type="text"
              value={nombreEmpresa}
              onChange={(e) => setNombreEmpresa(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Contraseña</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading
            ? "Un momento..."
            : modo === "registro"
            ? "Crear cuenta"
            : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

function traducirError(code) {
  const mapa = {
    "auth/email-already-in-use": "Ese email ya tiene una cuenta creada.",
    "auth/invalid-email": "El email no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
  };
  return mapa[code] || "Ocurrió un error. Probá de nuevo.";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
