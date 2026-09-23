"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext({
  user: null,
  perfil: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null); // { role: "admin"|"cliente", establecimiento_ref }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Suscripción en tiempo real al perfil del usuario logueado, para que
    // los cambios hechos en otras pantallas (por ej. el onboarding
    // agregando establecimiento_ref) se reflejen acá sin recargar.
    let unsubPerfil = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Si había una suscripción de un usuario anterior, la cerramos.
      if (unsubPerfil) {
        unsubPerfil();
        unsubPerfil = null;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        unsubPerfil = onSnapshot(
          doc(db, "usuarios", firebaseUser.uid),
          (snap) => {
            setPerfil(snap.exists() ? snap.data() : null);
            setLoading(false);
          },
          (e) => {
            console.error("Error leyendo perfil de usuario", e);
            setPerfil(null);
            setLoading(false);
          }
        );
      } else {
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubPerfil) unsubPerfil();
    };
  }, []);

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, perfil, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
