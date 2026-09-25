"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function Navbar() {
  const { user, perfil, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Gestión <span className="text-emerald-600">Ambiental</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!user && (
            <>
              <Link href="/login" className="hover:underline">
                Ingresar
              </Link>
              <Link
                href="/login?modo=registro"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
              >
                Registrar mi empresa
              </Link>
            </>
          )}
          {user && perfil?.role === "cliente" && (
            <>
              <Link href="/dashboard" className="hover:underline">
                Mi panel
              </Link>
              <button onClick={handleSignOut} className="hover:underline">
                Salir
              </button>
            </>
          )}
          {user && perfil?.role === "admin" && (
            <>
              <Link href="/admin" className="hover:underline">
                Admin
              </Link>
              <Link href="/admin/datos-base" className="hover:underline">
                Datos base
              </Link>
              <button onClick={handleSignOut} className="hover:underline">
                Salir
              </button>
            </>
          )}
          {user && !perfil && (
            <button onClick={handleSignOut} className="hover:underline">
              Salir
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
