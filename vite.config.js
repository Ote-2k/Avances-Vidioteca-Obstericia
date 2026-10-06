import { resolve } from "node:path";
import { defineConfig } from "vite";

const fromRoot = (path) => resolve(process.cwd(), path);

export default defineConfig({
	optimizeDeps: {
		exclude: ["@ffmpeg/ffmpeg"]
	},
	build: {
		target: "esnext",
		rollupOptions: {
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
