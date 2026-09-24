"use client";

import { useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Etiquetas legibles para los campos que pueden aparecer en `datos_evaluados`
// (el snapshot que guarda cada regla al evaluarse).
const CAMPO_LABELS = {
  generaResiduosPeligrosos: "Genera residuos peligrosos",
  generaResiduosEspeciales: "Genera residuos especiales",
  vuelcaEfluentes: "Vuelca efluentes líquidos",
  consumoAguaM3Dia: "Consumo de agua (m³/día)",
  transporteInterprovincial: "Transporte fuera de la provincia",
  jurisdiccionNacional: "Actividad bajo jurisdicción nacional",
  tieneEmisionesGaseosas: "Tiene emisiones gaseosas",
  tieneHabilitacionVigente: "Tiene habilitación vigente",
  situacion: "Situación del establecimiento",
};

const RESULTADO_INFO = {
  aplica: { texto: "Aplica", color: "#087E69" },
  no_aplica: { texto: "No aplica", color: "#8a978f" },
  requiere_revision: { texto: "Alcance por verificar", color: "#b45309" },
};

function formatearValorDato(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sin responder";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return String(valor);
}

function formatearFechaEvaluacion(ts) {
  if (!ts || typeof ts.toDate !== "function") return null;
  return ts.toDate().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Explica por qué un trámite quedó incluido, con el detalle que guardó
 * `generarChecklist` al evaluar la regla documentada: qué condiciones se
 * cumplieron, con qué datos, y con qué fundamento normativo. Si el trámite
 * todavía no tiene una regla propia, lo aclara en vez de mostrar una
 * explicación genérica.
 *
 * Componente compartido entre el dashboard de la empresa y el detalle del
 * panel admin, para que ambos muestren exactamente el mismo fundamento.
 */
export default function PorQueAplica({ cumplimiento, normativas }) {
  const [abierto, setAbierto] = useState(false);

  if (!cumplimiento.regla_id) {
    return (
      <div className="mt-4">
        <p className="text-xs" style={{ color: "#8a978f" }}>
          Este trámite todavía no tiene una regla documentada con fuente
          verificable: se incluyó porque el tema y la jurisdicción coinciden
          con lo declarado.
        </p>
        <Historial cumplimientoId={cumplimiento.id} />
      </div>
    );
  }

  const normativaFundamento = normativas?.find((n) => n.id === cumplimiento.regla_norma_ref);
  const info = RESULTADO_INFO[cumplimiento.resultado];
  const fecha = formatearFechaEvaluacion(cumplimiento.fecha_evaluacion);
  const datosEvaluados = cumplimiento.datos_evaluados
    ? Object.entries(cumplimiento.datos_evaluados)
    : [];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-xs font-medium hover:underline"
        style={{ color: "#087E69" }}
      >
        {abierto ? "Ocultar explicación ▴" : "¿Por qué aparece este trámite? ▾"}
      </button>

      {abierto && (
        <div
          className="mt-3 space-y-3 rounded-md p-4 text-xs"
          style={{ background: "#F5F7F3", border: "1px solid #DDE6DF" }}
        >
          {cumplimiento.condiciones_cumplidas?.length > 0 && (
            <div>
              <p className="font-medium" style={{ color: "#173A34" }}>
                Motivo de inclusión
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4" style={{ color: "#40544c" }}>
                {cumplimiento.condiciones_cumplidas.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {datosEvaluados.length > 0 && (
            <div>
              <p className="font-medium" style={{ color: "#173A34" }}>
                Datos utilizados
              </p>
              <ul className="mt-1 space-y-0.5" style={{ color: "#40544c" }}>
                {datosEvaluados.map(([campo, valor]) => (
                  <li key={campo}>
                    {CAMPO_LABELS[campo] || campo}:{" "}
                    <span className="font-medium">{formatearValorDato(valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cumplimiento.regla_descripcion && (
            <div>
              <p className="font-medium" style={{ color: "#173A34" }}>
                Criterio evaluado
              </p>
              <p className="mt-1" style={{ color: "#40544c" }}>
                {cumplimiento.regla_descripcion}
              </p>
            </div>
          )}

          <div>
            <p className="font-medium" style={{ color: "#173A34" }}>
              Resultado
            </p>
            <p className="mt-1" style={{ color: info?.color || "#40544c" }}>
              {info?.texto || cumplimiento.resultado}
              {cumplimiento.condiciones_sin_respuesta?.length > 0 && (
                <> — falta confirmar: {cumplimiento.condiciones_sin_respuesta.join("; ")}</>
              )}
            </p>
          </div>

          {(cumplimiento.regla_articulos || normativaFundamento) && (
            <div>
              <p className="font-medium" style={{ color: "#173A34" }}>
                Fundamento
              </p>
              <p className="mt-1" style={{ color: "#40544c" }}>
                {cumplimiento.regla_articulos}
                {normativaFundamento?.url_fuente && (
                  <>
                    {" "}
                    <a
                      href={normativaFundamento.url_fuente}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: "#087E69" }}
                    >
                      Consultar fuente oficial ↗
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <p style={{ color: "#8a978f" }}>
            Resultado generado a partir de los datos declarados por la empresa.
            {fecha && <> Última evaluación: {fecha}.</>}
          </p>
        </div>
      )}

      <Historial cumplimientoId={cumplimiento.id} />
    </div>
  );
}

/**
 * Lista las evaluaciones anteriores de este trámite (subcolección
 * `cumplimiento/{id}/evaluaciones`, que arma `generarChecklist` en cada
 * recálculo). Se consulta recién al abrir, no en cada render del checklist.
 */
function Historial({ cumplimientoId }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [evaluaciones, setEvaluaciones] = useState(null);

  async function alAbrir() {
    const yaAbierto = abierto;
    setAbierto(!yaAbierto);
    if (yaAbierto || evaluaciones !== null) return;
    setCargando(true);
    try {
      const q = query(
        collection(db, "cumplimiento", cumplimientoId, "evaluaciones"),
        orderBy("fecha", "desc")
      );
      const snap = await getDocs(q);
      setEvaluaciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("No se pudo cargar el historial de evaluaciones", err);
      setEvaluaciones([]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={alAbrir}
        className="text-xs font-medium hover:underline"
        style={{ color: "#587168" }}
      >
        {abierto ? "Ocultar historial ▴" : "Ver historial de evaluaciones ▾"}
      </button>

      {abierto && (
        <div className="mt-2 space-y-2 text-xs" style={{ color: "#40544c" }}>
          {cargando && <p style={{ color: "#8a978f" }}>Cargando...</p>}
          {!cargando && evaluaciones?.length === 0 && (
            <p style={{ color: "#8a978f" }}>Todavía no hay evaluaciones registradas.</p>
          )}
          {!cargando &&
            evaluaciones?.map((ev) => {
              const info = RESULTADO_INFO[ev.resultado];
              const fecha = formatearFechaEvaluacion(ev.fecha);
              return (
                <div
                  key={ev.id}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: "#DDE6DF" }}
                >
                  <p className="flex items-center justify-between gap-2">
                    <span style={{ color: info?.color || "#40544c" }}>
                      {info?.texto || ev.resultado}
                    </span>
                    <span style={{ color: "#8a978f" }}>{fecha || "sin fecha"}</span>
                  </p>
                  {ev.condiciones_sin_respuesta?.length > 0 && (
                    <p className="mt-1" style={{ color: "#8a978f" }}>
                      Faltaba confirmar: {ev.condiciones_sin_respuesta.join("; ")}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
