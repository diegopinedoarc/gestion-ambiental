"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const TEMAS = [
  {
    titulo: "Residuos peligrosos",
    detalle: "Ley 24.051 — Certificado Ambiental y manifiesto SIMEL.",
  },
  {
    titulo: "Residuos especiales",
    detalle: "Ley 11.720 — Declaración jurada anual ante OPDS.",
  },
  {
    titulo: "Efluentes líquidos",
    detalle: "Límites de vertido y registro de cantidad/calidad según destino final.",
  },
  {
    titulo: "Emisiones gaseosas",
    detalle: "Ley 5965 / Decreto 1074/18 — Licencia LEGA.",
  },
  {
    titulo: "Habilitación industrial",
    detalle: "Categorización, Certificado de Aptitud Ambiental y habilitación municipal.",
  },
];

export default function Home() {
  const [industrias, setIndustrias] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const [indSnap, munSnap] = await Promise.all([
          getDocs(collection(db, "industrias")),
          getDocs(query(collection(db, "jurisdicciones"), where("nivel", "==", "municipal"))),
        ]);
        setIndustrias(indSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setMunicipios(munSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("No se pudo cargar la cobertura actual", err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-3 text-sm font-medium text-emerald-600">
          Gestión ambiental de residuos industriales
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          De normativa dispersa a un checklist claro de qué le aplica a tu
          empresa.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
          Cargá los datos de tu establecimiento y la herramienta cruza
          automáticamente la normativa nacional, provincial y municipal (y de
          autoridades de cuenca, cuando corresponde) sobre residuos,
          efluentes y emisiones, para decirte exactamente qué trámites
          necesitás y ante qué organismo — sea cual sea tu rubro y tu zona.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/login?modo=registro"
            className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Registrar mi empresa
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-neutral-300 px-5 py-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Ya tengo cuenta
          </Link>
        </div>

        {!cargando && (industrias.length > 0 || municipios.length > 0) && (
          <div className="mt-12 rounded-lg border border-black/10 bg-neutral-50 p-5 dark:border-white/10 dark:bg-neutral-900">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Cobertura actual
            </p>
            {industrias.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {industrias.map((i) => (
                  <span
                    key={i.id}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {i.nombre}
                  </span>
                ))}
              </div>
            )}
            {municipios.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {municipios.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-full bg-white px-3 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {m.nombre}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              Sumamos rubros y municipios nuevos de forma continua — si el
              tuyo todavía no está, escribinos.
            </p>
          </div>
        )}
      </section>

      <section className="border-t border-black/10 bg-neutral-50 px-6 py-16 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold">
            Ejes normativos que cubrimos hoy
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TEMAS.map((t) => (
              <div
                key={t.titulo}
                className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-950"
              >
                <h3 className="font-medium">{t.titulo}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {t.detalle}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-sm text-neutral-500">
            Herramienta con una arquitectura pensada para escalar a
            cualquier municipio y rubro industrial: cada nueva jurisdicción o
            industria se suma como datos, sin reescribir la aplicación.
          </p>
        </div>
      </section>
    </div>
  );
}
