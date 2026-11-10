/**
 * Gestión de videos locales con conversión a WebM y almacenamiento local.
 *
 * FFmpeg.wasm convierte los videos en el navegador antes de guardarlos en
 * IndexedDB, sin depender de un almacenamiento remoto.
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

let ffmpegPromise: Promise<FFmpeg> | null = null;

/**
 * Generates a JPEG preview from a local video file or a directly playable URL.
 * YouTube links use YouTube's public thumbnail endpoint because embeds cannot be
 * captured to canvas across origins.
 */
export async function generateVideoThumbnail(source: Blob | string): Promise<string> {
	if (typeof source === "string") {
		try {
			const url = new URL(source);
			const youtubeId = url.hostname === "youtu.be"
				? url.pathname.slice(1)
				: url.hostname.endsWith("youtube.com") ? url.searchParams.get("v") : null;
			if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
		} catch {
			throw new Error("La URL del video no es válida.");
		}
	}

	const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
	const video = document.createElement("video");
	video.preload = "metadata";
	video.muted = true;
	video.playsInline = true;
	if (!objectUrl) video.crossOrigin = "anonymous";
	video.src = objectUrl || source as string;
	try {
		await new Promise<void>((resolve, reject) => {
			const timeout = window.setTimeout(() => reject(new Error("No se pudo cargar el video para generar la miniatura.")), 15000);
			const cleanup = () => {
				window.clearTimeout(timeout);
				video.removeEventListener("loadedmetadata", onMetadata);
				video.removeEventListener("loadeddata", onLoadedData);
				video.removeEventListener("seeked", onSeeked);
				video.removeEventListener("error", onError);
			};
			const onError = () => {
				cleanup();
				reject(new Error("No se pudo leer el video para generar la miniatura. Sube un archivo de video compatible."));
			};
			const onSeeked = () => {
				cleanup();
				resolve();
			};
			const onLoadedData = () => {
				cleanup();
				resolve();
			};
			const onMetadata = () => {
				const captureAt = Number.isFinite(video.duration) && video.duration > 0.5
					? Math.min(1, video.duration / 2)
					: 0;
				if (captureAt === 0) {
					if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoadedData();
					else video.addEventListener("loadeddata", onLoadedData);
				} else {
					video.currentTime = captureAt;
				}
			};
			video.addEventListener("loadedmetadata", onMetadata);
			video.addEventListener("seeked", onSeeked);
			video.addEventListener("error", onError);
			video.load();
		});
		const canvas = document.createElement("canvas");
		canvas.width = 480;
		canvas.height = 270;
		const context = canvas.getContext("2d");
		if (!context || !video.videoWidth || !video.videoHeight) throw new Error("No se pudo generar la miniatura del video.");
		const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
		const width = video.videoWidth * scale;
		const height = video.videoHeight * scale;
		context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
		try {
			return canvas.toDataURL("image/jpeg", 0.78);
		} catch {
			throw new Error("El video externo no permite generar una miniatura. Sube el archivo de video para continuar.");
		}
	} catch (error) {
		if (source instanceof Blob) return await generateVideoThumbnailWithFFmpeg(source);
		throw error;
	} finally {
		video.removeAttribute("src");
		video.load();
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	}
}

async function generateVideoThumbnailWithFFmpeg(source: Blob): Promise<string> {
	const ffmpeg = await getFFmpeg();
	const inputName = `thumbnail-${crypto.randomUUID()}`;
	const outputName = `thumbnail-${crypto.randomUUID()}.jpg`;
	try {
		await ffmpeg.writeFile(inputName, await fetchFile(source));
		const result = await ffmpeg.exec([
			"-ss", "0",
			"-i", inputName,
			"-frames:v", "1",
			"-vf", "scale=480:270:force_original_aspect_ratio=increase,crop=480:270",
			"-an",
			outputName
		]);
		if (result !== 0) throw new Error("FFmpeg no pudo generar la miniatura del video.");
		const image = await ffmpeg.readFile(outputName);
		const bytes = typeof image === "string" ? new TextEncoder().encode(image) : Uint8Array.from(image);
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return `data:image/jpeg;base64,${btoa(binary)}`;
	} finally {
		await Promise.all([inputName, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {})));
	}
}

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

async function getFFmpeg(): Promise<FFmpeg> {
	if (!ffmpegPromise) {
		const ffmpeg = new FFmpeg();
		ffmpegPromise = ffmpeg.load({ coreURL, wasmURL })
			.then(() => ffmpeg)
			.catch((error: unknown) => {
				ffmpegPromise = null;
				throw error;
			});
	}
	return ffmpegPromise;
}

/**
 * Convierte un video a WebM y lo guarda en IndexedDB usando una clave estable.
 */
export async function saveTranscodedVideo(key: string, file: File, onProgress?: (progress: number) => void): Promise<Blob> {
	if (file.size > 250 * 1024 * 1024) throw new Error("El video original supera el límite de 250 MB.");
	onProgress?.(0);
	const ffmpeg = await getFFmpeg();
	const inputName = `input-${crypto.randomUUID()}.${file.name.split(".").pop() || "video"}`;
	const outputName = `output-${crypto.randomUUID()}.webm`;
	const handleProgress = ({ progress }: { progress: number }) => onProgress?.(Math.min(100, Math.max(0, Math.round(progress * 100))));
	const ffmpegLogs: string[] = [];
	const handleLog = ({ message }: { message: string }) => {
		ffmpegLogs.push(message);
		if (ffmpegLogs.length > 20) ffmpegLogs.shift();
	};
	ffmpeg.on("progress", handleProgress);
	ffmpeg.on("log", handleLog);
	try {
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		let result: number;
		try {
			result = await ffmpeg.exec([
				"-threads", "1",
				"-i", inputName,
				"-c:v", "libvpx",
				"-crf", "30",
				"-b:v", "0",
				"-deadline", "realtime",
				"-cpu-used", "4",
				"-pix_fmt", "yuv420p",
				"-c:a", "libvorbis",
				"-q:a", "4",
				"-threads", "1",
				outputName
			]);
		} catch (error) {
			console.error("Falló la conversión WebM. Salida de FFmpeg:", ffmpegLogs.slice(-8));
			const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
				? error.message
				: String(error);
			throw new Error(message);
		}
		if (result !== 0) {
			console.error("FFmpeg no pudo convertir el archivo a WebM:", ffmpegLogs.slice(-5));
			throw new Error("FFmpeg no pudo convertir el archivo a WebM.");
		}
		const output = await ffmpeg.readFile(outputName);
		const videoBytes = typeof output === "string" ? new TextEncoder().encode(output) : Uint8Array.from(output);
		const video = new Blob([videoBytes.buffer as ArrayBuffer], { type: "video/webm" });
		if (video.size > 300 * 1024 * 1024) throw new Error("El video WebM convertido supera el límite de 300 MB.");
		const database = await openVideoDatabase();
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction("videos", "readwrite");
				transaction.objectStore("videos").put(video, key);
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el video."));
				transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del video."));
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "QuotaExceededError") {
				throw new Error("No hay suficiente espacio disponible en el navegador para guardar este video.");
			}
			throw error;
		} finally {
			database.close();
		}
		return video;
	} finally {
		await Promise.all([inputName, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {})));
		ffmpeg.off("progress", handleProgress);
		ffmpeg.off("log", handleLog);
	}
}

/**
 * Recupera la URL de un video local almacenado en el navegador.
 */
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

/**
 * Removes a locally stored video when resource creation fails or the resource is deleted.
 */
export async function deleteLocalVideo(key: string): Promise<void> {
	const database = await openVideoDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			transaction.objectStore("videos").delete(key);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el video local."));
		});
	} finally {
		database.close();
	}
}