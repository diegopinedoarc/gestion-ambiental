"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import {
  buscarFactoresEmision,
  buscarHuellas,
  calcularHuella,
  guardarHuella,
} from "@/lib/huellaCarbono";

const ANIO_ACTUAL = new Date().getFullYear();

/**
 * Cálculo de huella de carbono (GHG Protocol, alcance 1 y 2) por período.
 * La empresa carga cuánto combustible y electricidad consumió en el año, y
 * se calcula al toque con los factores de emisión que vos (admin) hayas
 * cargado en `factores_emision`. Si todavía no cargaste ninguno, la página
 * lo explica en vez de mostrar un formulario vacío.
 */
export default function HuellaCarbonoPage() {
  const { user, perfil, loading } = useAuth();
  const router = useRouter();

  const [factores, setFactores] = useState(null); // null = todavía no cargó
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [periodo, setPeriodo] = useState(String(ANIO_ACTUAL));
  const [cantidades, setCantidades] = useState({});
  const [resultado, setResultado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && perfil && !perfil.establecimiento_ref) {
      router.push("/onboarding");
    }
  }, [loading, user, perfil, router]);

  useEffect(() => {
    async function cargar() {
      if (!perfil?.establecimiento_ref) return;
      setCargando(true);
      const [f, h] = await Promise.all([
        buscarFactoresEmision(),
        buscarHuellas(perfil.establecimiento_ref),
      ]);
      setFactores(f);
      setHistorial(h);
      setCargando(false);
    }
    cargar();
  }, [perfil]);

  const combustibles = useMemo(
    () => (factores || []).filter((f) => f.combustible !== "electricidad"),
    [factores]
  );
  const electricidad = useMemo(
    () => (factores || []).find((f) => f.combustible === "electricidad"),
    [factores]
  );

  function onCambiarCantidad(factorId, valor) {
    setCantidades((prev) => ({ ...prev, [factorId]: valor }));
  }

  async function onCalcular(e) {
    e.preventDefault();
    setError("");
    if (!periodo.trim()) {
      setError("Ingresá el año del período.");
      return;
    }
    const res = calcularHuella(cantidades, factores || []);
    if (res.detalle.length === 0) {
      setError("Cargá al menos un consumo para calcular algo.");
      return;
    }
    setResultado(res);
  }

  async function onGuardar() {
    setGuardando(true);
    setError("");
    try {
      await guardarHuella(perfil.establecimiento_ref, periodo.trim(), cantidades, resultado);
      const h = await buscarHuellas(perfil.establecimiento_ref);
      setHistorial(h);
      setResultado(null);
      setCantidades({});
    } catch (err) {
      console.error("No se pudo guardar la huella", err);
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (loading || cargando) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-neutral-500">Cargando...</div>
    );
  }
  if (!perfil?.establecimiento_ref) return null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-emerald-600 hover:underline">
        ← Volver al panel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold" style={{ color: "#173A34" }}>
        Huella de carbono
      </h1>
      <p className="mt-2 text-sm" style={{ color: "#587168" }}>
        Cálculo de emisiones según el GHG Protocol: alcance 1 (combustibles quemados en la
        planta) y alcance 2 (electricidad comprada a la red). No incluye alcance 3 (cadena de
        valor).
      </p>

      {!factores || factores.length === 0 ? (
        <div
          className="mt-8 rounded-lg p-5 text-sm"
          style={{ background: "#F5F7F3", border: "1px solid #DDE6DF", color: "#587168" }}
        >
          Todavía no hay factores de emisión cargados, así que no se puede calcular nada
          todavía. Esto lo tiene que cargar un administrador en la colección{" "}
          <code>factores_emision</code>.
        </div>
      ) : (
        <form onSubmit={onCalcular} className="mt-8">
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "#173A34" }}>
              Período
            </span>
            <input
              type="text"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="2026"
              className="w-32 rounded-md px-3 py-2"
              style={{ border: "1px solid #DDE6DF" }}
            />
          </label>

          {combustibles.length > 0 && (
            <div className="mt-6">
              <p
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: "#587168" }}
              >
                Alcance 1 — combustibles
              </p>
              <div className="mt-3 space-y-3">
                {combustibles.map((f) => (
                  <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
                    <span style={{ color: "#173A34" }}>{f.nombre}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={cantidades[f.id] || ""}
                        onChange={(e) => onCambiarCantidad(f.id, e.target.value)}
                        className="w-32 rounded-md px-3 py-1.5 text-right"
                        style={{ border: "1px solid #DDE6DF" }}
                      />
                      <span style={{ color: "#8a978f" }}>{f.unidad}/año</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {electricidad && (
            <div className="mt-6">
              <p
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: "#587168" }}
              >
                Alcance 2 — electricidad
              </p>
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "#173A34" }}>{electricidad.nombre}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={cantidades[electricidad.id] || ""}
                    onChange={(e) => onCambiarCantidad(electricidad.id, e.target.value)}
                    className="w-32 rounded-md px-3 py-1.5 text-right"
                    style={{ border: "1px solid #DDE6DF" }}
                  />
                  <span style={{ color: "#8a978f" }}>{electricidad.unidad}/año</span>
                </span>
              </label>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="mt-6 rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Calcular
          </button>
        </form>
      )}

      {resultado && (
        <div className="mt-8 rounded-lg p-5" style={{ background: "#fff", border: "1px solid #DDE6DF" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#173A34" }}>
            Resultado — período {periodo}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-semibold" style={{ color: "#173A34" }}>
                {resultado.scope1_tco2e.toFixed(2)}
              </p>
              <p className="text-xs" style={{ color: "#8a978f" }}>
                tCO2e alcance 1
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold" style={{ color: "#173A34" }}>
                {resultado.scope2_tco2e.toFixed(2)}
              </p>
              <p className="text-xs" style={{ color: "#8a978f" }}>
                tCO2e alcance 2
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold" style={{ color: "#087E69" }}>
                {resultado.total_tco2e.toFixed(2)}
              </p>
              <p className="text-xs" style={{ color: "#8a978f" }}>
                tCO2e total
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-1 text-xs" style={{ color: "#587168" }}>
            {resultado.detalle.map((d) => (
              <li key={d.factorId}>
                {d.nombre}: {d.cantidad} {d.unidad} × {d.factor_kgco2_por_unidad} kgCO2/
                {d.unidad} = {(d.emisiones_kg / 1000).toFixed(3)} tCO2e (alcance {d.alcance})
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className="mt-5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar este período"}
          </button>
        </div>
      )}

      {historial.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold" style={{ color: "#173A34" }}>
            Historial
          </h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "#DDE6DF" }}>
                <th className="py-2 pr-3 font-medium">Período</th>
                <th className="py-2 pr-3 font-medium">Alcance 1</th>
                <th className="py-2 pr-3 font-medium">Alcance 2</th>
                <th className="py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id} className="border-b" style={{ borderColor: "#EEF2EE" }}>
                  <td className="py-2 pr-3">{h.periodo}</td>
                  <td className="py-2 pr-3">{h.resultado?.scope1_tco2e?.toFixed(2)} tCO2e</td>
                  <td className="py-2 pr-3">{h.resultado?.scope2_tco2e?.toFixed(2)} tCO2e</td>
                  <td className="py-2 font-medium">{h.resultado?.total_tco2e?.toFixed(2)} tCO2e</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
