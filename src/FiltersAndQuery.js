import React, { useEffect, useState } from "react";
import axios from "axios";
import { enviroments } from './env';
/**
 * GetFormFilter.jsx
 *
 * - Carga zonas y sus conteos desde /api/options/zonas
 * - Al seleccionar zona, carga puestos y sus conteos desde /api/options/puestos?zona=...
 * - Llama GET /api/getform?zona=...&puesto=... cuando el usuario presiona "Consultar"
 *
 * Ajusta URLs si tu backend usa rutas distintas.
 */

export default function GetFormFilter() {
  const [zonas, setZonas] = useState([]);
  const [puestos, setPuestos] = useState([]);

  const [selectedZona, setSelectedZona] = useState("");
  const [selectedPuesto, setSelectedPuesto] = useState("");

  const [loadingZones, setLoadingZones] = useState(false);
  const [loadingPuestos, setLoadingPuestos] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  // Al montar: cargar zonas desde la BD
  useEffect(() => {
    fetchZonas();
  }, []);

  // Cuando cambia zona, limpiar puestos y cargar nuevos
  useEffect(() => {
    setPuestos([]);
    setSelectedPuesto("");
    if (selectedZona) {
      fetchPuestos(selectedZona);
    }
  }, [selectedZona]);

  // GET zonas con conteo desde backend
  const fetchZonas = async () => {
    try {
      setLoadingZones(true);
      setError("");
      const res = await axios.get(enviroments.backendUrl +"/api/formularios/zonasypuestos");
      // esperamos un array: [{ id, name, count }, ...] o [{ zona, count }, ...]
   

      setZonas(res.data.zonas);
      
     // console.log(res.data.zonas);
    } catch (err) {
      console.error("fetchZonas error:", err);
      setError("No se pudieron cargar las zonas desde el servidor.");
      setZonas([]);
    } finally {
      setLoadingZones(false);
    }
  };

  // GET puestos por zona con conteo desde backend
  const fetchPuestos = async (zona) => {
    try {
      setLoadingPuestos(true);
      setError("");
      const res = await axios.get(enviroments.backendUrl +"/api/formularios/zonasypuestos");
      console.log(res.data.puestos)
      setPuestos(res.data.puestos);
    } catch (err) {
      console.error("fetchPuestos error:", err);
      setError("No se pudieron cargar los puestos para la zona seleccionada.");
      setPuestos([]);
    } finally {
      setLoadingPuestos(false);
    }
  };

  // Llama a GET /api/getform con zona/puesto seleccionados
  const handleConsultar = async () => {
    try {
      setLoadingQuery(true);
      setError("");
      setResults(null);

      const params = {
        zona: selectedZona || undefined,
        puesto: selectedPuesto || undefined,
      };

      const res = await axios.post(enviroments.backendUrl +"/api/forms/post", params );
      setResults(res.data ?? []);
    } catch (err) {
      console.error("Error getform:", err);
      setError("Error al consultar. Revisa la consola y el backend.");
    } finally {
      setLoadingQuery(false);
    }
  };

  // helpers para leer campos flexibles de la respuesta
  const optId = (o) => o.id ?? o.zona ?? o.puesto ?? o.name ?? o.value ?? o;
  const optName = (o) => o.name ?? o.zona ?? o.puesto ?? String(o.id ?? o ?? "");
  const optCount = (o) => o.count ?? o.c ?? 0;

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <h3 style={{ margin: "0 0 12px 0" }}>Consultar Formularios</h3>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          background: "#f6fbff",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e1eef9",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minWidth: 220 }}>
          <label style={{ fontSize: 13, marginBottom: 6 }}>Zona</label>
          <select
            value={selectedZona}
            onChange={(e) => setSelectedZona(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="">{loadingZones ? "Cargando zonas..." : "-- Seleccione zona --"}</option>
            {zonas.map((z) => {
              const id = optId(z);
              const name = optName(z);
         
              return (
                <option key={id} value={id}>
                  {name} {typeof count === "number" ? `(${count})` : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", minWidth: 220 }}>
          <label style={{ fontSize: 13, marginBottom: 6 }}>Puesto</label>
          <select
            value={selectedPuesto}
            onChange={(e) => setSelectedPuesto(e.target.value)}
            disabled={loadingPuestos || !selectedZona}
            style={{ padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="">{loadingPuestos ? "Cargando puestos..." : "-- Seleccione puesto --"}</option>
            {puestos.map((p) => {
              const id = optId(p);
              const name = optName(p);
        
              return (
                <option key={id} value={id}>
                  {name}      {p.lugar} {typeof count === "number" ? `(${count})` : ""}
                </option>
              );

              
            })}
          </select>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={handleConsultar}
            disabled={loadingQuery}
            style={{
              padding: "10px 16px",
              background: "#2d6cdf",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {loadingQuery ? "Consultando..." : "Consultar"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {error && <div style={{ color: "crimson", marginBottom: 8 }}>{error}</div>}

        {results === null ? (
          <div style={{ color: "#6b7785" }}>Aún no se ha realizado una consulta.</div>
        ) : Array.isArray(results) && results.length === 0 ? (
          <div style={{ color: "#6b7785" }}>No se encontraron registros para los filtros seleccionados.</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <h4 style={{ margin: "6px 0" }}>Resultados</h4>
            <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f1f7ff" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Departamento</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Municipio</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Zona</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Puesto</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Lugar</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Mesa</th>
                 
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(results) ? results : [results]).map((r, i) => (
                    <tr key={r.id ?? i} style={{ borderTop: "1px solid #f3f6fb" }}>
                      <td style={{ padding: 8 }}>{r.departamento ?? r.department ?? "-"}</td>
                      <td style={{ padding: 8 }}>{r.municipio ?? "-"}</td>
                      <td style={{ padding: 8 }}>{r.zona ?? "-"}</td>
                      <td style={{ padding: 8 }}>{r.puesto ?? "-"}</td>
                      <td style={{ padding: 8 }}>{r.lugar ?? "-"}</td>
                      <td style={{ padding: 8 }}>{r.mesa   ?? "-"}</td>
                      <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                       
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
