import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	optimizeDeps: {
		// FFmpeg crea un worker módulo; preempaquetarlo rompe su URL durante el desarrollo.
		exclude: ["@ffmpeg/ffmpeg"]
	},
	build: { target: "esnext" }
});
