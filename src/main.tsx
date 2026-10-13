/**
 * Punto de entrada principal de la aplicación.
 *
 * Se monta el árbol React, se habilita el router y se envuelve la app con el
 * proveedor de autenticación para que todos los componentes tengan acceso al
 * perfil activo y al estado de sesión.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<AuthProvider>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</AuthProvider>
	</React.StrictMode>
);