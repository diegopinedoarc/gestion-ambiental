"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const PASOS = [
  {
    numero: "1",
    titulo: "Describí tu establecimiento",
    detalle:
      "Rubro, municipio, procesos productivos y algunas preguntas sobre residuos, efluentes y emisiones.",
  },
  {
    numero: "2",
    titulo: "Revisá las obligaciones y su fundamento",
    detalle:
      "La herramienta cruza tus respuestas contra la normativa cargada y te arma un checklist, cada ítem con la norma y el organismo detrás.",
  },
  {
    numero: "3",
    titulo: "Organizá las gestiones",
    detalle:
      "Marcá el estado de cada trámite, cargá fechas de obtención y vencimiento, y recibí avisos cuando se acerque un vencimiento.",
  },
];

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
      <section className="relative overflow-hidden">
        {/* Foto de fondo: planta de tratamiento, ya viene con un degradado
            propio hacia claro en el lado izquierdo. */}
        <div
          className="absolute inset-0 bg-cover bg-[right_center] lg:bg-center"
          style={{ backgroundImage: "url(/hero-planta.jpg)" }}
          aria-hidden="true"
        />
        {/* Refuerzo del degradado hacia el color de fondo de la página, para
            que el texto quede legible sin depender solo del fade de la
            imagen, y para que funcione igual en modo claro y oscuro. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, var(--background) 0%, var(--background) 40%, color-mix(in srgb, var(--background) 35%, transparent) 65%, transparent 88%)",
          }}
          aria-hidden="true"
        />
        {/* Leve oscurecido general en modo oscuro, para que la foto no
            desentone con el resto de la página. */}
        <div
          className="absolute inset-0 bg-black/0 dark:bg-black/35"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-5xl px-6 py-24 lg:py-32">
          <p className="mb-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Gestión ambiental de residuos industriales
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            De normativa dispersa a un checklist claro de qué le aplica a tu
            empresa.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-300">
            Cargá los datos de tu establecimiento y la herramienta cruza
            automáticamente la normativa nacional, provincial y municipal (y
            de autoridades de cuenca, cuando corresponde) sobre residuos,
            efluentes y emisiones, para decirte exactamente qué trámites
            necesitás y ante qué organismo.
          </p>

          {!cargando && (industrias.length > 0 || municipios.length > 0) && (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">
                Cobertura hoy:
              </span>
              {industrias.map((i) => (
                <span
                  key={i.id}
                  className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                >
                  {i.nombre}
                </span>
              ))}
              {municipios.map((m) => (
                <span
                  key={m.id}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-300"
                >
                  {m.nombre}
                </span>
              ))}
              <span className="text-xs text-neutral-400">
                — sumamos rubros y municipios de forma continua.
              </span>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login?modo=registro"
              className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Registrar mi empresa
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-neutral-300 bg-white/70 px-5 py-3 text-sm font-medium backdrop-blur-sm hover:bg-white dark:border-neutral-600 dark:bg-neutral-900/60 dark:hover:bg-neutral-900"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* Cómo funciona — fondo verde petróleo oscuro, contraste fuerte con
          la sección clara que sigue para dar ritmo a la página. */}
      <section
        className="px-6 py-16 sm:py-20"
        style={{ background: "#142B27" }}
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold text-white">Cómo funciona</h2>
          <div className="relative mt-12 grid gap-10 sm:grid-cols-3">
            {/* Línea fina que conecta los tres pasos (solo desde sm hacia arriba) */}
            <div
              className="absolute top-4 right-0 left-0 hidden h-px sm:block"
              style={{ background: "rgba(148, 189, 168, 0.35)" }}
              aria-hidden="true"
            />
            {PASOS.map((p) => (
              <div key={p.numero} className="relative">
                <span
                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: "#8FBBA2", color: "#12271f" }}
                >
                  {p.numero}
                </span>
                <h3 className="mt-3 font-medium text-white">{p.titulo}</h3>
                <p className="mt-1 text-sm" style={{ color: "#B7CBC2" }}>
                  {p.detalle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ejes normativos — fondo marfil claro, tarjetas blancas con borde
          suave. El salto de luminosidad respecto de la sección anterior es
          intencional. */}
      <section className="px-6 py-16 sm:py-20" style={{ background: "#F5F7F2" }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold" style={{ color: "#1c211f" }}>
            Ejes normativos que cubrimos hoy
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TEMAS.map((t) => (
              <div
                key={t.titulo}
                className="rounded-lg bg-white p-5"
                style={{ border: "1px solid #DDE6DD" }}
              >
                <h3 className="font-medium" style={{ color: "#1c211f" }}>
                  {t.titulo}
                </h3>
                <p className="mt-2 text-sm" style={{ color: "#5b6b62" }}>
                  {t.detalle}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-sm" style={{ color: "#5b6b62" }}>
            Herramienta con una arquitectura pensada para escalar a
            cualquier municipio y rubro industrial: cada nueva jurisdicción o
            industria se suma como datos, sin reescribir la aplicación.
          </p>
          <p className="mt-3 max-w-2xl text-xs" style={{ color: "#8a978f" }}>
            Esta herramienta orienta sobre qué normativa suele aplicar según
            los datos cargados; no reemplaza el asesoramiento de un
            profesional ni constituye una certificación de cumplimiento.
          </p>
        </div>
      </section>

      {/* CTA final — verde profundo, textura topográfica muy tenue en una
          esquina (recortada de la misma foto del hero, sin repetirla como
          imagen protagonista). */}
      <section
        className="relative overflow-hidden px-6 py-16 sm:py-20"
        style={{ background: "#103B32" }}
      >
        <div
          className="pointer-events-none absolute -top-10 -right-10 h-72 w-72 opacity-[0.045]"
          style={{
            backgroundImage: "url(/topo-texture.jpg)",
            backgroundSize: "cover",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-5xl text-center">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Sabé exactamente qué le exige la normativa a tu empresa.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: "#B7CBC2" }}>
            Registrá tu establecimiento y en minutos tenés el checklist de
            trámites que te corresponden, con su fundamento legal.
          </p>
          <div className="mt-7">
            <Link
              href="/login?modo=registro"
              className="inline-block rounded-md bg-white px-6 py-3 text-sm font-medium hover:bg-neutral-100"
              style={{ color: "#103B32" }}
            >
              Registrar mi empresa
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
