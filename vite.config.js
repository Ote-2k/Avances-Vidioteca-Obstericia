import { resolve } from "node:path";
import { defineConfig } from "vite";

const fromRoot = (path) => resolve(process.cwd(), path);

export default defineConfig({
	optimizeDeps: {
		// FFmpeg crea un worker módulo; preempaquetarlo rompe su URL durante el desarrollo.
		exclude: ["@ffmpeg/ffmpeg"]
	},
	build: {
		target: "esnext",
		rollupOptions: {
			// Cada página HTML es una entrada independiente del frontend multipágina.
			input: {
				index: fromRoot("index.html"),
				login: fromRoot("login.html"),
				videoteca: fromRoot("videoteca.html"),
				profesor: fromRoot("Vista/Profesor/main.html"),
				asignatura: fromRoot("Vista/Profesor/asignatura-1.html"),
				recurso: fromRoot("Vista/Profesor/recurso.html")
			}
		}
	}
});
