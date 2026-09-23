import Link from "next/link";

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
    detalle: "Res. ADA 336/03 — Permiso de vuelco según destino final.",
  },
  {
    titulo: "Emisiones gaseosas",
    detalle: "Ley 5965 / Decreto 1074/18 — Licencia LEGA.",
  },
  {
    titulo: "Habilitación industrial",
    detalle: "Ley 11.459 — Categorización, CAA y habilitación municipal.",
  },
];

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-3 text-sm font-medium text-emerald-600">
          Municipio de Tigre · Industria química
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          De normativa dispersa a un checklist claro de qué le aplica a tu
          empresa.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
          Cargá los datos de tu establecimiento y la herramienta cruza
          automáticamente la normativa nacional, provincial (Buenos Aires) y
          municipal (Tigre) sobre residuos, efluentes y emisiones, para
          decirte exactamente qué trámites necesitás y ante qué organismo.
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
            Este es un piloto desarrollado para industria química en el
            Partido de Tigre, con una arquitectura pensada para escalar a
            otros municipios y rubros industriales.
          </p>
        </div>
      </section>
    </div>
  );
}
