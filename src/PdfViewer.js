import React, { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import axios from "axios";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/libs/pdf.worker.min.mjs";
import { enviroments } from './env';
export default function PdfOcrAdaptive_WithSplitCanvas() {

  
  const canvasRef = useRef(null);
  const splitCanvasRef = useRef(null);
  const pdfRef = useRef(null); // guardamos el PDF para renderizar otras páginas

  const [ocrText, setOcrText] = useState("");
  const [ocrLeft, setOcrLeft] = useState("");
  const [ocrRight, setOcrRight] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");

  const [departmentText, setDepartmentText] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [zona, setZona] = useState("");
  const [puesto, setPuesto] = useState("");
  const [mesa, setMesa] = useState("");
  const [lugar, setLugar] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [numberValues, setNumberValues] = useState(() => {
    const init = {};
    for (let i = 1; i <= 30; i++) init[i] = "";
    return init;
  });

  // navegación de páginas
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState("");

  const toGrayscale = (ctx, w, h) => {
    try {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      console.warn("toGrayscale fallo:", e);
    }
  };

  const adaptiveThreshold = (ctx, w, h, windowSize = 25, C = 8) => {
    try {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const gray = new Uint8ClampedArray(w * h);

      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          const base = (y * w + x) * 4;
          const r = d[base], g = d[base + 1], b = d[base + 2];
          gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }
      }

      const integral = new Uint32Array((w + 1) * (h + 1));
      for (let y = 1; y <= h; y++) {
        let rowSum = 0;
        for (let x = 1; x <= w; x++) {
          rowSum += gray[(y - 1) * w + (x - 1)];
          integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + rowSum;
        }
      }

      const half = Math.floor(windowSize / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - half);
          const y1 = Math.max(0, y - half);
          const x2 = Math.min(w - 1, x + half);
          const y2 = Math.min(h - 1, y + half);

          const A = y1 * (w + 1) + x1;
          const B = y1 * (w + 1) + (x2 + 1);
          const Cidx = (y2 + 1) * (w + 1) + x1;
          const D = (y2 + 1) * (w + 1) + (x2 + 1);

          const sum = integral[D] - integral[B] - integral[Cidx] + integral[A];
          const area = (x2 - x1 + 1) * (y2 - y1 + 1);
          const mean = sum / area;

          const v = gray[y * w + x];
          const out = v < mean - C ? 0 : 255;
          const idx = (y * w + x) * 4;
          d[idx] = d[idx + 1] = d[idx + 2] = out;
        }
      }

      ctx.putImageData(img, 0, 0);
    } catch (e) {
      console.warn("adaptiveThreshold fallo:", e);
    }
  };

  const normalizeText = (text) =>
    (text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

  const sanitizeOcr = (text) => {
    if (!text) return "";
    return text.replace(/[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ\s]/g, "").trim();
  };

  const extractDepartmentDataOnly = (text) => {
    if (!text) return "";
    const normalized = normalizeText(text);
    const match = normalized.match(
      /\b(?:departamento|dpto|depto|dep)\b[^\dA-Za-zÁÉÍÓÚáéíóúÑñ]{0,10}(\d{1,3})\s*([A-Za-zÁÉÍÓÚÑñ]{2,30})/i
    );
    if (match) return `${match[1]} ${match[2].toUpperCase()}`.trim();
    const fallback = normalized.match(/(\d{1,3})\s+([A-Za-zÁÉÍÓÚÑñ]{3,30})/);
    if (fallback) return `${fallback[1]} ${fallback[2].toUpperCase()}`.trim();
    return "";
  };

  const extractMunicipio = (text) => {
    if (!text) return "";
    const normalized = normalizeText(text);
    const lines = normalized.split("\n");
    const directRe = /(?:municipio|mun(?:\.|)\b)[\s:\-]*([A-Za-zÁÉÍÓÚÑñ0-9\-\.\(\)\/ ]{2,80})/i;
    for (const line of lines) {
      const m = line.match(directRe);
      if (m && m[1]) return m[1].trim().replace(/^[\-\:\.\,]+|[\-\:\.\,]+$/g, "").toUpperCase();
    }
    return "";
  };

  const extractZona = (text) => {
    const m = text.match(/zona\s*[:\-]?\s*([0-9A-Z\-]+)/i);
    return m ? m[1].trim() : "";
  };

  const extractPuesto = (text) => {
    const m = text.match(/puesto\s*[:\-]?\s*([0-9A-Z\-]+)/i);
    return m ? m[1].trim() : "";
  };

  const extractMesa = (text) => {
    const m = text.match(/mesa\s*[:\-]?\s*([0-9A-Z\-]+)/i);
    return m ? m[1].trim() : "";
  };

  const extractLugar = (text) => {
    const m = text.match(/lugar\s*[:\-]?\s*([A-Za-zÁÉÍÓÚÑñ0-9\-\.\(\)\/ ]{3,80})/i);
    return m ? m[1].trim().replace(/\s+/g, " ") : "";
  };

  // renderiza una página (y opcionalmente corre OCR sobre ella)
  const renderAndOcrPage = async (pdf, pageNum, runOcr = true) => {
    if (!pdf) return;
    setLoading(true);
    setProgressText(`Cargando página ${pageNum}...`);
    setError("");

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      // aplica preprocesado visual en canvas oculto
      toGrayscale(ctx, canvas.width, canvas.height);
      adaptiveThreshold(ctx, canvas.width, canvas.height, 25, 8);

      // tambien actualiza splitCanvas para vista dividida
      const splitCanvas = splitCanvasRef.current;
      if (splitCanvas) {
        const w = canvas.width;
        const h = canvas.height;
        const topH = Math.floor(h * 0.4);
        const bottomH = h - topH;
        const leftW = Math.floor(w * 0.5);
        const rightW = w - leftW;
        const displayMaxWidth = 900;
        const scale = Math.min(1, displayMaxWidth / w);

        splitCanvas.width = Math.floor(w * scale);
        splitCanvas.height = Math.floor(h * scale);
        const sctx = splitCanvas.getContext("2d");
        sctx.clearRect(0, 0, splitCanvas.width, splitCanvas.height);

        sctx.drawImage(canvas, 0, 0, leftW, topH, 0, 0, leftW * scale, topH * scale);
        sctx.drawImage(canvas, leftW, 0, rightW, topH, leftW * scale, 0, rightW * scale, topH * scale);
        sctx.drawImage(
          canvas,
          0,
          topH,
          leftW,
          bottomH,
          0,
          topH * scale,
          leftW * scale,
          bottomH * scale
        );
        sctx.drawImage(
          canvas,
          leftW,
          topH,
          rightW,
          bottomH,
          leftW * scale,
          topH * scale,
          rightW * scale,
          bottomH * scale
        );

        sctx.strokeStyle = "rgba(255,0,0,0.4)";
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.moveTo(0, topH * scale + 0.5);
        sctx.lineTo(splitCanvas.width, topH * scale + 0.5);
        sctx.moveTo(leftW * scale + 0.5, 0);
        sctx.lineTo(leftW * scale + 0.5, splitCanvas.height);
        sctx.stroke();
      }

      if (!runOcr) {
        setLoading(false);
        return;
      }

      // OCR: primero completo
      setProgressText("Iniciando OCR completo...");
      const worker = await createWorker();
      await worker.load();
      await worker.loadLanguage("spa");
      await worker.initialize("spa");
      await worker.setParameters({
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ ",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: "6",
      });

      const fullResult = await worker.recognize(canvas);
      const rawFullText = fullResult?.data?.text ?? fullResult?.text ?? "";
      const cleanFullText = sanitizeOcr(rawFullText);
      setOcrText(cleanFullText);

      // extraer campos
      const dept = extractDepartmentDataOnly(cleanFullText);
      const mun = extractMunicipio(cleanFullText);
      const zn = extractZona(cleanFullText);
      const pst = extractPuesto(cleanFullText);
      const ms = extractMesa(cleanFullText);
      const lgr = extractLugar(cleanFullText);

      if (dept) setDepartmentText(dept);
      if (mun) setMunicipio(mun);
      if (zn) setZona(zn);
      if (pst) setPuesto(pst);
      if (ms) setMesa(ms);
      if (lgr) setLugar(lgr);

      // OCR en mitades inferiores (crea canvases para cada mitad)
      const wAll = canvas.width;
      const hAll = canvas.height;
      const topH_all = Math.floor(hAll * 0.4);
      const bottomH_all = hAll - topH_all;
      const leftW_all = Math.floor(wAll * 0.5);
      const rightW_all = wAll - leftW_all;

      const leftCanvas = document.createElement("canvas");
      leftCanvas.width = leftW_all;
      leftCanvas.height = bottomH_all;
      const lctx = leftCanvas.getContext("2d");
      lctx.drawImage(canvas, 0, topH_all, leftW_all, bottomH_all, 0, 0, leftW_all, bottomH_all);

      const rightCanvas = document.createElement("canvas");
      rightCanvas.width = rightW_all;
      rightCanvas.height = bottomH_all;
      const rctx = rightCanvas.getContext("2d");
      rctx.drawImage(
        canvas,
        leftW_all,
        topH_all,
        rightW_all,
        bottomH_all,
        0,
        0,
        rightW_all,
        bottomH_all
      );

      await worker.terminate();

      // half worker
      const halfWorker = await createWorker();
      await halfWorker.load();
      await halfWorker.loadLanguage("spa");
      await halfWorker.initialize("spa");
      await halfWorker.setParameters({
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ ",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: "6",
      });

      setProgressText("OCR mitades (izq/der)...");
      const leftRes = await halfWorker.recognize(leftCanvas);
      const rawLeft = leftRes?.data?.text ?? leftRes?.text ?? "";
      const leftText = sanitizeOcr(rawLeft);
      setOcrLeft(leftText);

      const rightRes = await halfWorker.recognize(rightCanvas);
      const rawRight = rightRes?.data?.text ?? rightRes?.text ?? "";
      const rightText = sanitizeOcr(rawRight);
      setOcrRight(rightText);

      await halfWorker.terminate();

      // NOTA: la lógica de extracción para 1..30 se mantiene (se calcula localmente pero NO sobrescribe los inputs)
      const combined = normalizeText((leftText || "") + "\n" + (rightText || ""));
      const lines = combined.split("\n").map((l) => l.trim()).filter(Boolean);
      const tokensNums = (s) => (s ? Array.from(s.matchAll(/\d{1,4}/g), (m) => m[0]) : []);
      const extracted = {};
      for (let i = 1; i <= 30; i++) extracted[i] = "";

      for (const line of lines) {
        const nums = tokensNums(line);
        if (nums.length >= 2) {
          for (let i = 0; i < nums.length - 1; i++) {
            const a = Number(nums[i]), b = Number(nums[i + 1]);
            if (a >= 1 && a <= 30 && !extracted[a]) extracted[a] = String(b);
            else if (b >= 1 && b <= 30 && !extracted[b]) extracted[b] = String(a);
          }
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const nums = tokensNums(lines[i]);
        if (nums.length === 1) {
          const n = Number(nums[0]);
          if (n >= 1 && n <= 30 && !extracted[n]) {
            const nextLine = lines[i + 1] || "";
            const nextNums = tokensNums(nextLine);
            if (nextNums.length >= 1) extracted[n] = String(nextNums[0]);
          }
        }
      }

      const globalNums = tokensNums(combined);
      for (let i = 0; i < globalNums.length - 1; i++) {
        const a = Number(globalNums[i]), b = Number(globalNums[i + 1]);
        if (a >= 1 && a <= 30 && !extracted[a]) extracted[a] = String(b);
        else if (b >= 1 && b <= 30 && !extracted[b]) extracted[b] = String(a);
      }

      setProgressText("");
      setLoading(false);
    } catch (err) {
      console.error("Error renderAndOcrPage:", err);
      setError(err.message || String(err));
      setProgressText("");
      setLoading(false);
    }
  };

  const handlePdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // reset states
    setError("");
    setOcrText("");
    setDepartmentText("");
    setMunicipio("");
    setZona("");
    setPuesto("");
    setMesa("");
    setLugar("");
    setSavedMessage("");
    setOcrLeft("");
    setOcrRight("");
    setNumberValues((prev) => {
      const init = {};
      for (let i = 1; i <= 30; i++) init[i] = "";
      return init;
    });

    setLoading(true);
    setProgressText("Cargando PDF...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setPageInput("");

      // render primera página y correr OCR
      await renderAndOcrPage(pdf, 1, true);
    } catch (err) {
      console.error("handlePdf error:", err);
      setError(err.message || String(err));
      setLoading(false);
      setProgressText("");
    }
  };

  const goToPage = async (pageNumber) => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    const p = Math.max(1, Math.min(totalPages || pdf.numPages, pageNumber));
    setCurrentPage(p);
    setPageInput("");
    await renderAndOcrPage(pdf, p, true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSavedMessage("");
    setError("");
  
    try {
      const payload = {
        departamento: departmentText,
        municipio,
        zona,
        puesto,
        mesa,
        lugar,
        valores_json: numberValues,
      };
  
      console.log("Enviando payload al backend:", payload);
  
      // Petición POST con axios
      const res = await axios.post(enviroments.backendUrl +"/api/forms", payload);
  
      console.log("Respuesta del servidor:", res.data);
  
      // Mostrar mensaje según la respuesta del backend
      if (res.data.exists) {
        setError("⚠️ Ya existe un registro con estos datos.");
      } else {
        setSavedMessage("✅ Datos guardados correctamente.");
        setTimeout(() => setSavedMessage(""), 3000);
      }
    } catch (err) {
      console.error("Error al guardar:", err);
      setError("❌ No se pudo guardar. Ver consola.");
    }
  };
  
  
  return (
    <div style={{ padding: 20 }}>
      <h3>OCR → Formulario (con vista dividida)</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="file" accept="application/pdf,image/*" onChange={handlePdf} />
        {/* Controls de navegación de páginas */}
        <button
          onClick={() => goToPage(Math.max(1, currentPage - 1))}
          disabled={!pdfRef.current || currentPage <= 1}
        >
          «
        </button>
        <span>
          Página {currentPage}{totalPages ? ` / ${totalPages}` : ""}
        </span>
        <button
          onClick={() => goToPage(Math.min(totalPages || currentPage + 1, currentPage + 1))}
          disabled={!pdfRef.current || (totalPages && currentPage >= totalPages)}
        >
          »
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 12 }}>
          <input
            type="number"
            min={1}
            max={totalPages || undefined}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="Ir a página"
            style={{ width: 100, padding: "6px 8px" }}
          />
          <button
            onClick={() => {
              const n = Number(pageInput);
              if (!n || !pdfRef.current) return;
              goToPage(n);
            }}
            disabled={!pdfRef.current}
          >
            Ir
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 12 }}>
        {/* LEFT: canvas preview (white area) - 40% */}
        <div style={{ flex: "0 0 40%", minWidth: 360 }}>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div style={{ background: "#fff", padding: 8, border: "1px solid #ddd" }}>
            <canvas
              ref={splitCanvasRef}
              style={{ display: "block", width: "100%", height: "auto", background: "#fff" }}
            />
          </div>

          {loading && <p>⏳ {progressText}</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}

          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: "6px 0" }}>Resultado OCR (preview)</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 10, minHeight: 80 }}>
              {ocrText || "(sin texto aún)"}
            </pre>
          </div>
        </div>

        {/* RIGHT: forms - 60% */}
        <div style={{ flex: "0 0 60%", maxWidth: "60%", display: "flex", flexDirection: "column", gap: 12 }}>
          <form onSubmit={handleSave} style={{ display: "grid", gap: 8, padding: 8, border: "1px solid #eee", borderRadius: 6, background: "#fafafa" }}>
            <h4 style={{ margin: 0 }}>Formulario principal</h4>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ minWidth: 80, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Departamento:</label>
              <input type="text" value={departmentText} onChange={(e) => setDepartmentText(e.target.value)} placeholder="Ej: 31 VALLE" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ minWidth: 80, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Municipio:</label>
              <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Nombre del municipio" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                <label style={{ width: 80 }}>Zona:</label>
                <input type="text" value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Ej: 5" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                <label style={{ width: 80 }}>Puesto:</label>
                <input type="text" value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej: 12" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                <label style={{ width: 80 }}>Mesa:</label>
                <input type="text" value={mesa} onChange={(e) => setMesa(e.target.value)} placeholder="Ej: 34" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ minWidth: 80, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Lugar:</label>
              <input type="text" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Nombre completo del lugar" style={{ width: "50%", padding: "6px 8px", fontSize: 14 }} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" style={{ padding: "8px 12px" }}>Guardar</button>
              {savedMessage && <span style={{ color: "green" }}>{savedMessage}</span>}
            </div>
          </form>

          <div
  style={{
    padding: 8,
    border: "1px solid #eee",
    borderRadius: 6,
    background: "#fff",
    maxHeight: "none",
  }}
>
  <h4 style={{ marginTop: 0, fontSize: 15 }}>Formulario de valores (1 → 30)</h4>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
    {Array.from({ length: 30 }, (_, i) => {
      const idx = i + 1;
      return (
        <div
          key={idx}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <label style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{idx}</label>
          <input
            type="text"
            value={numberValues[idx] ?? ""}
            onChange={(e) =>
              setNumberValues((prev) => ({ ...prev, [idx]: e.target.value }))
            }
            style={{ padding: "4px 6px", fontSize: 13, width: "90%" }}
          />
        </div>
      );
    })}

    {/* Campo adicional: Errores del E-14 */}
    <div
      style={{
        gridColumn: "1 / span 2",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        marginTop: 6,
      }}
    >
      <label style={{ fontSize: 11, fontWeight: 500, color: "#444", marginBottom: 3 }}>
        Errores del E-14
      </label>
      <input
        type="text"
        value={numberValues["errores"] ?? ""}
        onChange={(e) =>
          setNumberValues((prev) => ({ ...prev, errores: e.target.value }))
        }
        placeholder="Describe los errores detectados"
        style={{
          padding: "6px 8px",
          fontSize: 13,
          width: "95%",
        }}
      />
    </div>
  </div>
</div>
        </div>
      </div>
    </div>
  );
}

