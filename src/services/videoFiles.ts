import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

let ffmpegPromise: Promise<FFmpeg> | null = null;

function openVideoDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("videoteca-local-videos", 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains("videos")) request.result.createObjectStore("videos");
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
	});
}

async function getFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
	if (!ffmpegPromise) {
		const ffmpeg = new FFmpeg();
		ffmpeg.on("progress", ({ progress }) => onProgress?.(Math.min(100, Math.round(progress * 100))));
		ffmpegPromise = ffmpeg.load({ coreURL, wasmURL }).then(() => ffmpeg);
	}
	return ffmpegPromise;
}

export async function saveTranscodedVideo(key: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
	if (file.size > 250 * 1024 * 1024) throw new Error("El video original supera el límite de 250 MB.");
	const ffmpeg = await getFFmpeg(onProgress);
	const inputName = `input-${crypto.randomUUID()}.${file.name.split(".").pop() || "video"}`;
	const outputName = `output-${crypto.randomUUID()}.webm`;
	try {
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		const result = await ffmpeg.exec(["-i", inputName, "-c:v", "libvpx", "-crf", "30", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-b:a", "96k", "-threads", "1", outputName]);
		if (result !== 0) throw new Error("FFmpeg no pudo convertir el archivo a WebM.");
		const output = await ffmpeg.readFile(outputName);
		const videoBytes = typeof output === "string" ? new TextEncoder().encode(output) : Uint8Array.from(output);
		const video = new Blob([videoBytes.buffer as ArrayBuffer], { type: "video/webm" });
		if (video.size > 300 * 1024 * 1024) throw new Error("El video WebM convertido supera el límite de 300 MB.");
		const database = await openVideoDatabase();
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			transaction.objectStore("videos").put(video, key);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el video."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del video."));
		});
		database.close();
	} finally {
		await Promise.all([inputName, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {})));
	}
}

export async function getLocalVideoUrl(key: string): Promise<string> {
	const database = await openVideoDatabase();
	const video = await new Promise<Blob | undefined>((resolve, reject) => {
		const request = database.transaction("videos", "readonly").objectStore("videos").get(key);
		request.onsuccess = () => resolve(request.result as Blob | undefined);
		request.onerror = () => reject(request.error || new Error("No se pudo leer el video local."));
	});
	database.close();
	if (!video) throw new Error("El archivo solo existe en el navegador donde se subió.");
	return URL.createObjectURL(video);
}