"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

const TAMANO_MAX = 10 * 1024 * 1024; // 10 MB — debe coincidir con storage.rules

function formatearTamano(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(ts) {
  if (!ts || typeof ts.toDate !== "function") return null;
  return ts.toDate().toLocaleDateString("es-AR", { dateStyle: "short" });
}

/**
 * Certificados/constancias que la empresa sube como prueba de que un
 * trámite se cumplió (PDF, foto, etc.). Se guardan en Firebase Storage,
 * en `evidencias/{establecimientoId}/{cumplimientoId}/...`, y se listan
 * desde `cumplimiento/{id}/evidencias`. Componente compartido entre el
 * dashboard de la empresa y el detalle del panel admin.
 */
export default function Evidencias({ establecimientoId, cumplimientoId }) {
  const [archivos, setArchivos] = useState(null); // null = todavía no cargó
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    const q = query(
      collection(db, "cumplimiento", cumplimientoId, "evidencias"),
      orderBy("fecha", "desc")
    );
    const snap = await getDocs(q);
    setArchivos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumplimientoId]);

  async function onSubir(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo de nuevo más tarde
    if (!file) return;
    setError("");

    if (file.size > TAMANO_MAX) {
      setError("El archivo pesa más de 10 MB. Subí una versión más liviana.");
      return;
    }

    setSubiendo(true);
    try {
      const storagePath = `evidencias/${establecimientoId}/${cumplimientoId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "cumplimiento", cumplimientoId, "evidencias"), {
        nombre: file.name,
        storagePath,
        url,
        tipo: file.type || null,
        tamano: file.size,
        fecha: serverTimestamp(),
      });

      await cargar();
    } catch (err) {
      console.error("No se pudo subir el archivo", err);
      setError("No se pudo subir el archivo. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function onEliminar(evidencia) {
    try {
      await deleteObject(ref(storage, evidencia.storagePath));
    } catch (err) {
      // Si el archivo ya no está en Storage igual limpiamos el registro,
      // para no dejar un link roto en la lista.
      console.error("No se pudo borrar el archivo de Storage", err);
    }
    await deleteDoc(doc(db, "cumplimiento", cumplimientoId, "evidencias", evidencia.id));
    setArchivos((prev) => (prev ? prev.filter((a) => a.id !== evidencia.id) : prev));
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#587168" }}>
        Evidencias
      </p>

      {archivos === null ? (
        <p className="mt-2 text-xs" style={{ color: "#8a978f" }}>
          Cargando...
        </p>
      ) : archivos.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: "#8a978f" }}>
          Todavía no se subió ningún certificado o constancia para este trámite.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {archivos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate hover:underline"
                style={{ color: "#087E69" }}
                title={a.nombre}
              >
                {a.nombre}
              </a>
              <span className="flex shrink-0 items-center gap-2" style={{ color: "#8a978f" }}>
                {formatearTamano(a.tamano)} · {formatearFecha(a.fecha) || "recién subido"}
                <button
                  type="button"
                  onClick={() => onEliminar(a)}
                  className="hover:underline"
                  style={{ color: "#b91c1c" }}
                >
                  Eliminar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <label
        className="mt-3 inline-block cursor-pointer text-xs font-medium hover:underline"
        style={{ color: "#087E69" }}
      >
        {subiendo ? "Subiendo..." : "+ Subir certificado o constancia"}
        <input type="file" className="hidden" onChange={onSubir} disabled={subiendo} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
