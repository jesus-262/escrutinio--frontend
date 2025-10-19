// App.jsx
// Vista principal que expone dos rutas: /filters y /pdf
// Usa react-router-dom v6. Asegúrate de tener las dependencias instaladas:
// npm i react-router-dom

import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";

// Importa tus componentes reales (ajusta las rutas si están en otra carpeta)
import FiltersAndQuery from "./FiltersAndQuery";
import PdfViewer from "./PdfViewer";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 p-6">
        <header className="max-w-5xl mx-auto mb-6">
          <nav className="flex items-center justify-between bg-white shadow-md rounded-2xl p-4">
            <h1 className="text-xl font-semibold">Mi App</h1>
            <div className="flex gap-4"> {/* separacion entre botones aumentada */}
              <Link
                to="/filters"
                className="px-5 py-2 bg-blue-600 text-white font-medium rounded-md shadow hover:bg-blue-700 transition-colors duration-200"
              >
                Filters
              </Link>
              <Link
                to="/pdf"
                className="px-5 py-2 bg-blue-600 text-white font-medium rounded-md shadow hover:bg-blue-700 transition-colors duration-200"
              >
                PDF Viewer
              </Link>
            </div>
          </nav>
        </header>

        <main className="max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-2xl shadow-sm">
            <Routes>
              <Route path="/" element={<Navigate to="/filters" replace />} />
              <Route path="/filters" element={<FiltersAndQuery />} />
              <Route path="/pdf" element={<PdfViewer />} />

              {/* Ruta fallback */}
              <Route path="*" element={<div>404 - Página no encontrada</div>} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}