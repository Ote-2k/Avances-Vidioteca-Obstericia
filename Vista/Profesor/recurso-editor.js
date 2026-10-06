import { storage } from "../../firebase-config.js";
import { deleteObject, getBlob, ref } from "firebase/storage";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import "./editor-store.js";

await window.VideotecaStoreReady;

(() => {
	const pageParams = new URLSearchParams(window.location.search);
	const isTeacher = window.VideotecaStore.isTeacher();
	if (!isTeacher && pageParams.get("nuevo") === "1") {
		window.location.replace("../../index.html");
		return;
	}
	const selectedId = pageParams.get("recurso");
	const initialResources = window.VideotecaStore.get().resources;
	if (!isTeacher && (!selectedId || !initialResources[selectedId] || initialResources[selectedId].isHidden || initialResources[selectedId].isDraft)) {
		window.location.replace(`../../index.html?asignatura=${encodeURIComponent(window.VideotecaStore.getAssignmentId())}`);
		return;
	}
	let resourceId = initialResources[selectedId] ? selectedId : "introduccion";
	let isCreatingResource = pageParams.get("nuevo") === "1" && isTeacher;
	if (isCreatingResource && !initialResources[resourceId]?.isDraft) {
		resourceId = window.VideotecaStore.createResource({
			title: "",
			unit: "Unidad principal",
			unitId: "unidad-principal",
			duration: "Por definir",
			description: "",
			thumbnailUrl: initialResources.introduccion?.thumbnailUrl || "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80",
			videoUrl: "",
			materials: [],
			popups: [],
			isDraft: true
		});
		window.VideotecaStore.saveResource(resourceId, { isHidden: true });
		window.history.replaceState(null, "", `recurso.html?asignatura=${encodeURIComponent(window.VideotecaStore.getAssignmentId())}&recurso=${encodeURIComponent(resourceId)}&nuevo=1`);
	} else if (isCreatingResource) {
		resourceId = selectedId;
	}
	const resourceTitle = document.querySelector("#resource-title");
	const resourceDescription = document.querySelector("#resource-description");
	const resourcePlayer = document.querySelector("#resource-player");
	const videoEmbed = document.querySelector("#video-embed");
	const resourceMeta = document.querySelector("#resource-meta");
	const resourceSaveStatus = document.querySelector("#resource-save-status");
	const videoSourceStatus = document.querySelector("#video-source-status");
	const videoOverlays = document.querySelector("#video-overlays");
	const materialsList = document.querySelector("#materials-list");
	const materialsCount = document.querySelector("#materials-count");
	const popupList = document.querySelector("#popup-list");
	const popupDialog = document.querySelector("#popup-dialog");
	const popupForm = document.querySelector("#popup-form");
	const popupDocumentSelect = document.querySelector("#popup-document-input");
	const popupEditorNotice = document.querySelector("#popup-editor-notice");
	const popupImageInput = document.querySelector("#popup-image-input");
	const popupImagePreview = document.querySelector("#popup-image-preview");
	const popupImageStatus = document.querySelector("#popup-image-status");
	const popupFormStatus = document.querySelector("#popup-form-status");
	const removePopupImageButton = document.querySelector("#remove-popup-image-button");
	const popupPauseInput = document.querySelector("#popup-pause-input");
	const popupDismissInput = document.querySelector("#popup-dismiss-input");
	const popupHighlightInput = document.querySelector("#popup-highlight-input");
	const popupHighlightFields = document.querySelector("#popup-highlight-fields");
	const durationForm = document.querySelector("#duration-form");
	const trimStartInput = document.querySelector("#trim-start-input");
	const trimEndInput = document.querySelector("#trim-end-input");
	const durationEditorStatus = document.querySelector("#duration-editor-status");
	const saveDurationButton = document.querySelector("#save-duration-button");
	const documentElements = new Map();
	const commentForm = document.querySelector("#comment-form");
	const commentInput = document.querySelector("#comment-input");
	const commentList = document.querySelector("#comment-list");
	const commentCount = document.querySelector("#comment-count");
	const addDocumentDialog = document.querySelector("#add-document-dialog");
	const addDocumentForm = document.querySelector("#add-document-form");
	let isEditing = isCreatingResource;
	document.body.classList.toggle("student-view", !isTeacher);
	document.querySelector("#profile-role").textContent = isTeacher ? "Profesor" : "Alumno";
	document.querySelector("#profile-avatar").textContent = isTeacher ? "P" : "A";
	document.querySelector(".brand-role").textContent = isTeacher ? "· Profesor" : "· Alumno";
	let editingPopupId = null;
	let visiblePopupIds = "";
	let pausedPopupId = "";
	let pausedPopupTimestamp = 0;
	let popupImagePreviewUrl = "";
	let popupImageToRemove = false;
	const completedPopupIds = new Set();
	const maxPopupImageSize = 400 * 1024;
	let activeEditorAction = "popups";
	let activeVideoObjectUrl = "";
	let ffmpegPromise;
	let localVideoDatabasePromise;

	function openLocalVideoDatabase() {
		if (!localVideoDatabasePromise) {
			localVideoDatabasePromise = new Promise((resolve, reject) => {
				const request = indexedDB.open("videoteca-local-videos", 1);
				request.onupgradeneeded = () => request.result.createObjectStore("videos");
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
			});
		}
		return localVideoDatabasePromise;
	}

	async function saveLocalVideo(key, file) {
		const database = await openLocalVideoDatabase();
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			transaction.objectStore("videos").put(file, key);
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el video en IndexedDB."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado local del video."));
		});
	}

	async function readLocalVideo(key) {
		const database = await openLocalVideoDatabase();
		return new Promise((resolve, reject) => {
			const request = database.transaction("videos", "readonly").objectStore("videos").get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error || new Error("No se pudo leer el video desde IndexedDB."));
		});
	}

	async function removeLocalVideo(key) {
		const database = await openLocalVideoDatabase();
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			transaction.objectStore("videos").delete(key);
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el video local."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló la eliminación del video local."));
		});
	}

	async function transcodeVideoToWebM(file) {
		const maxInputSize = 250 * 1024 * 1024;
		if (file.size > maxInputSize) throw new Error("El video original supera el límite de 250 MB para conversión local.");
		if (!ffmpegPromise) {
			ffmpegPromise = (async () => {
				const ffmpeg = new FFmpeg();
				ffmpeg.on("progress", ({ progress }) => {
					resourceSaveStatus.textContent = `Comprimiendo video a WebM: ${Math.min(100, Math.round(progress * 100))}%`;
				});
				await ffmpeg.load({ coreURL, wasmURL });
				return ffmpeg;
			})();
		}
		const ffmpeg = await ffmpegPromise;
		const inputName = `input-${Date.now()}.${file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "video"}`;
		const outputName = `output-${Date.now()}.webm`;
		try {
			resourceSaveStatus.textContent = "Preparando la compresión WebM...";
			await ffmpeg.writeFile(inputName, await fetchFile(file));
			const result = await ffmpeg.exec([
				"-i", inputName,
				"-c:v", "libvpx",
				"-crf", "30",
				"-b:v", "0",
				"-deadline", "realtime",
				"-cpu-used", "8",
				"-c:a", "libopus",
				"-b:a", "96k",
				"-threads", "1",
				outputName
			]);
			if (result !== 0) throw new Error("FFmpeg no pudo convertir el archivo a WebM.");
			const output = await ffmpeg.readFile(outputName);
			const webmFile = new File([output], `${file.name.replace(/\.[^.]+$/, "")}.webm`, { type: "video/webm" });
			if (webmFile.size > 300 * 1024 * 1024) throw new Error("El WebM convertido supera el límite de Storage de 300 MB.");
			return webmFile;
		} finally {
			await Promise.all([inputName, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {})));
		}
	}

	async function storeVideoFile(file) {
		const webmFile = await transcodeVideoToWebM(file);
		const localKey = `${window.VideotecaStore.getAssignmentId()}/${resourceId}`;
		resourceSaveStatus.textContent = "WebM listo; guardando localmente en este navegador...";
		await saveLocalVideo(localKey, webmFile);
		return { localKey, fileName: webmFile.name };
	}

	async function captureVideoThumbnail(sourceUrl) {
		const preview = document.createElement("video");
		preview.crossOrigin = "anonymous";
		preview.muted = true;
		preview.playsInline = true;
		preview.preload = "auto";
		try {
			await new Promise((resolve, reject) => {
				const timeout = window.setTimeout(() => reject(new Error("Tiempo de espera agotado al cargar el video.")), 8000);
				preview.addEventListener("loadedmetadata", () => {
					window.clearTimeout(timeout);
					resolve();
				}, { once: true });
				preview.addEventListener("error", () => {
					window.clearTimeout(timeout);
					reject(new Error("No se pudo leer el video para generar la miniatura."));
				}, { once: true });
				preview.src = sourceUrl;
				preview.load();
			});

			const frameTime = Number.isFinite(preview.duration) && preview.duration > 0
				? Math.min(1, preview.duration * 0.08)
				: 0;
			if (frameTime > 0.05) {
				await new Promise((resolve, reject) => {
					const timeout = window.setTimeout(() => reject(new Error("No se pudo posicionar el fotograma.")), 5000);
					preview.addEventListener("seeked", () => {
						window.clearTimeout(timeout);
						resolve();
					}, { once: true });
					preview.currentTime = frameTime;
				});
			} else if (preview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
				await new Promise((resolve, reject) => {
					const timeout = window.setTimeout(() => reject(new Error("No se pudo decodificar el fotograma.")), 5000);
					preview.addEventListener("loadeddata", () => {
						window.clearTimeout(timeout);
						resolve();
					}, { once: true });
					preview.addEventListener("error", () => {
						window.clearTimeout(timeout);
						reject(new Error("No se pudo decodificar el fotograma."));
					}, { once: true });
				});
			}

			if (!preview.videoWidth || !preview.videoHeight) throw new Error("El video no tiene dimensiones legibles.");
			const canvas = document.createElement("canvas");
			canvas.width = 640;
			canvas.height = Math.max(1, Math.round(640 * preview.videoHeight / preview.videoWidth));
			const context = canvas.getContext("2d");
			context.drawImage(preview, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL("image/jpeg", 0.82);
		} finally {
			preview.pause();
			preview.removeAttribute("src");
			preview.load();
		}
	}

	async function getVideoThumbnail(videoUrl, source) {
		if (source.thumbnailUrl) return source.thumbnailUrl;
		if (source.kind !== "file") return "";
		return captureVideoThumbnail(new URL(videoUrl, window.location.href).href);
	}

	async function captureFileThumbnail(file) {
		const objectUrl = URL.createObjectURL(file);
		try {
			return await captureVideoThumbnail(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	function resolveVideoUrl(value) {
		const url = new URL(value, window.location.href);
		if (!["http:", "https:", "file:"].includes(url.protocol)) throw new Error("Protocolo de video no compatible.");
		const host = url.hostname.replace(/^www\./, "");

		if (host === "youtu.be" || host.endsWith("youtube.com")) {
			const videoId = host === "youtu.be"
				? url.pathname.split("/").filter(Boolean)[0]
				: url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
			if (videoId) return {
				kind: "embed",
				url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
				thumbnailUrl: `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
				label: "YouTube"
			};
		}

		if (host === "drive.google.com") {
			const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
			if (fileId) return { kind: "embed", url: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`, label: "Google Drive" };
		}

		if (host.endsWith("vimeo.com")) {
			const videoId = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
			if (videoId) return { kind: "embed", url: `https://player.vimeo.com/video/${videoId}`, label: "Vimeo" };
		}

		const extension = url.pathname.match(/\.(mp4|m4v|webm|ogg)$/i)?.[1]?.toLowerCase();
		if (extension) {
			const isSample = decodeURIComponent(url.pathname).endsWith("/video de prueba.mp4");
			return { kind: "file", url: url.href, label: isSample ? "Video de prueba local" : "Archivo de video" };
		}
		return { kind: "embed", url: url.href, label: "Video web" };
	}

	function updateSourceMode() {
		const mode = document.querySelector('input[name="video-source-mode"]:checked').value;
		document.querySelector("#url-source-panel").hidden = mode !== "url";
		document.querySelector("#file-source-panel").hidden = mode !== "file";
	}

	function renderDocuments(resource) {
		materialsCount.textContent = `${resource.materials.length} ${resource.materials.length === 1 ? "documento" : "documentos"}`;
		materialsList.replaceChildren();
		documentElements.clear();
		resource.materials.forEach((material, index) => {
			const row = document.createElement("article");
			row.className = "material-row";
			const link = document.createElement("a");
			link.className = "material-card";
			link.id = `material-${material.id}`;
			link.dataset.materialId = material.id;
			link.tabIndex = -1;
			link.href = material.url || "../../prueba.pdf";
			link.target = "_blank";
			link.rel = "noopener";
			const heading = document.createElement("h3");
			heading.textContent = material.title;
			const detail = document.createElement("p");
			detail.textContent = `${material.format} · ${material.description}`;
			link.append(heading, detail);
			row.append(link);
			documentElements.set(material.id, link);

			if (isEditing) {
				const menu = document.createElement("details");
				menu.className = "document-menu";
				const toggle = document.createElement("summary");
				toggle.textContent = "⋯";
				toggle.setAttribute("aria-label", `Opciones de ${material.title}`);
				const panel = document.createElement("div");
				panel.className = "document-menu-panel";
				const remove = document.createElement("button");
				remove.type = "button";
				remove.className = "remove-document";
				remove.dataset.documentIndex = String(index);
				remove.textContent = "Eliminar documento";
				panel.append(remove);
				menu.append(toggle, panel);
				row.append(menu);
			}
			materialsList.append(row);
		});
	}

	function formatTimestamp(seconds) {
		const value = Number(seconds) || 0;
		const minutes = Math.floor(value / 60);
		const remainder = (value % 60).toFixed(1).padStart(4, "0");
		return `${minutes}:${remainder}`;
	}

	function renderPopups(resource) {
		let supportsTimedPopups = Boolean(resource.videoStoragePath);
		if (!supportsTimedPopups) {
			try {
				supportsTimedPopups = resolveVideoUrl(resource.videoUrl).kind === "file";
			} catch {
				supportsTimedPopups = false;
			}
		}

		if (!supportsTimedPopups) {
			popupEditorNotice.textContent = "Los pop-ups sincronizados solo funcionan con archivos locales o URLs directas de video; YouTube y Drive no exponen el tiempo del video aquí.";
			popupEditorNotice.classList.add("visible");
		} else if (!resource.materials.length) {
			popupEditorNotice.textContent = "Adjunta un documento al recurso para poder vincularlo a un pop-up.";
			popupEditorNotice.classList.add("visible");
		} else {
			popupEditorNotice.classList.remove("visible");
		}
		document.querySelector("#add-popup-button").disabled = !supportsTimedPopups || !resource.materials.length;

		popupDocumentSelect.replaceChildren();
		resource.materials.forEach((material) => {
			const option = document.createElement("option");
			option.value = material.id;
			option.textContent = material.title;
			popupDocumentSelect.append(option);
		});

		popupList.replaceChildren();
		resource.popups.forEach((popup) => {
			const row = document.createElement("article");
			row.className = "popup-editor-row";
			const info = document.createElement("div");
			info.className = "popup-editor-info";
			const title = document.createElement("strong");
			title.textContent = `${formatTimestamp(popup.timestamp)} · ${popup.title}`;
			const material = resource.materials.find((item) => item.id === popup.materialId);
			const detail = document.createElement("span");
			const behaviorLabel = popup.pauseVideo ? "Pausa hasta continuar" : `Se cierra en ${popup.dismissAfter ?? 5} s`;
			const optionsLabel = [popup.highlightEnabled && "resaltado", popup.imageDataUrl && "con imagen"].filter(Boolean).join(" · ");
			detail.textContent = [behaviorLabel, `${popup.x}% horizontal · ${popup.y}% vertical`, material?.title || "Documento no disponible", optionsLabel].filter(Boolean).join(" · ");
			info.append(title, detail);

			const actions = document.createElement("div");
			actions.className = "popup-editor-actions";
			const edit = document.createElement("button");
			edit.type = "button";
			edit.dataset.popupAction = "edit";
			edit.dataset.popupId = popup.id;
			edit.textContent = "Editar";
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "popup-delete";
			remove.dataset.popupAction = "delete";
			remove.dataset.popupId = popup.id;
			remove.textContent = "Eliminar";
			actions.append(edit, remove);
			row.append(info, actions);
			popupList.append(row);
		});
		syncPopups(true);
	}

	function scrollToMaterial(materialId) {
		const target = documentElements.get(materialId);
		if (!target) {
			resourceSaveStatus.textContent = "El documento vinculado ya no está adjunto.";
			return;
		}
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target.focus({ preventScroll: true });
		target.classList.remove("document-highlight");
		void target.offsetWidth;
		target.classList.add("document-highlight");
		window.setTimeout(() => target.classList.remove("document-highlight"), 2600);
	}

	function syncPopups(force = false) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		let active = [];
		if (!isEditing && !resourcePlayer.hidden) {
			if (pausedPopupId) {
				const pausedPopup = resource.popups.find((popup) => popup.id === pausedPopupId);
				if (pausedPopup) active = [pausedPopup];
				else pausedPopupId = "";
			}
			if (!pausedPopupId) {
				const nextPausePopup = resource.popups
					.filter((popup) => popup.pauseVideo && !completedPopupIds.has(popup.id) && resourcePlayer.currentTime >= popup.timestamp)
					.sort((first, second) => first.timestamp - second.timestamp)[0];
				if (nextPausePopup) {
					pausedPopupId = nextPausePopup.id;
					pausedPopupTimestamp = nextPausePopup.timestamp;
					resourcePlayer.pause();
					active = [nextPausePopup];
				} else {
					active = resource.popups.filter((popup) => {
						if (popup.pauseVideo || completedPopupIds.has(popup.id)) return false;
						const dismissAfter = Math.max(1, Number(popup.dismissAfter) || 5);
						return resourcePlayer.currentTime >= popup.timestamp && resourcePlayer.currentTime < popup.timestamp + dismissAfter;
					});
				}
			}
		}
		const activeIds = active.map((popup) => popup.id).join("|");
		if (!force && activeIds === visiblePopupIds) return;
		visiblePopupIds = activeIds;
		videoOverlays.replaceChildren();
		active.forEach((popup) => {
			if (popup.highlightEnabled) {
				const circle = document.createElement("span");
				circle.className = "video-highlight-circle";
				circle.style.left = `${popup.highlightX ?? 50}%`;
				circle.style.top = `${popup.highlightY ?? 50}%`;
				circle.setAttribute("aria-hidden", "true");
				videoOverlays.append(circle);
			}
			const card = document.createElement("div");
			card.className = "video-popup";
			card.style.left = `${popup.x}%`;
			card.style.top = `${popup.y}%`;
			card.setAttribute("role", "group");
			card.setAttribute("aria-label", popup.title);
			const title = document.createElement("span");
			title.className = "video-popup-title";
			title.textContent = popup.title;
			const message = document.createElement("span");
			message.className = "video-popup-text";
			message.textContent = popup.message;
			card.append(title, message);
			if (popup.imageDataUrl) {
				const image = document.createElement("img");
				image.className = "video-popup-image";
				image.src = popup.imageDataUrl;
				image.alt = popup.imageName || "Imagen adjunta al pop-up";
				card.append(image);
			}
			const material = resource.materials.find((item) => item.id === popup.materialId);
			const actions = document.createElement("div");
			actions.className = "video-popup-actions";
			const documentLabel = document.createElement("button");
			documentLabel.type = "button";
			documentLabel.className = "video-popup-document";
			documentLabel.dataset.materialId = popup.materialId;
			documentLabel.textContent = material ? `Ver documento: ${material.title}` : "Ver documento relacionado";
			actions.append(documentLabel);
			if (popup.pauseVideo) {
				const continueButton = document.createElement("button");
				continueButton.type = "button";
				continueButton.className = "video-popup-continue";
				continueButton.setAttribute("aria-label", "Continuar reproducción");
				continueButton.title = "Continuar reproducción";
				continueButton.textContent = "→";
				continueButton.addEventListener("click", () => {
					completedPopupIds.add(popup.id);
					pausedPopupId = "";
					resourcePlayer.play().catch(() => {});
					syncPopups(true);
				});
				actions.append(continueButton);
			}
			card.append(actions);
			videoOverlays.append(card);
		});
	}

	async function loadVideo(resource) {
		if (activeVideoObjectUrl) URL.revokeObjectURL(activeVideoObjectUrl);
		activeVideoObjectUrl = "";
		videoEmbed.removeAttribute("src");
		videoEmbed.hidden = true;
		resourcePlayer.hidden = false;

		if (!resource.videoStoragePath && !resource.videoLocalKey && !resource.videoUrl.trim()) {
			resourcePlayer.removeAttribute("src");
			resourcePlayer.load();
				videoSourceStatus.textContent = "";
			updateDurationAvailability();
			return;
		}

		if (resource.videoLocalKey) {
			try {
				const videoBlob = await readLocalVideo(resource.videoLocalKey);
				if (!videoBlob) throw new Error("No se encontró el archivo en IndexedDB de este navegador.");
				activeVideoObjectUrl = URL.createObjectURL(videoBlob);
				resourcePlayer.src = activeVideoObjectUrl;
				resourcePlayer.load();
				videoSourceStatus.textContent = "";
			} catch (error) {
				videoSourceStatus.textContent = error.message || "No se pudo leer el video local.";
				console.error("No se pudo cargar el video desde IndexedDB.", error);
				return;
			}
			document.querySelector('input[name="video-source-mode"][value="file"]').checked = true;
		} else if (resource.videoStoragePath) {
			try {
				const videoBlob = await getBlob(ref(storage, resource.videoStoragePath));
				activeVideoObjectUrl = URL.createObjectURL(videoBlob);
				resourcePlayer.src = activeVideoObjectUrl;
				resourcePlayer.load();
				videoSourceStatus.textContent = "";
			} catch (error) {
				videoSourceStatus.textContent = `No se pudo leer el video desde Firebase Storage${error.code ? ` (${error.code})` : "."}`;
				console.error("No se pudo cargar el video desde Firebase Storage.", error);
				return;
			}
			document.querySelector('input[name="video-source-mode"][value="file"]').checked = true;
		} else {
			const source = resolveVideoUrl(resource.videoUrl);
			videoSourceStatus.textContent = source.label;
			document.querySelector('input[name="video-source-mode"][value="url"]').checked = true;
			if (source.kind === "embed") {
				resourcePlayer.removeAttribute("src");
				resourcePlayer.load();
				resourcePlayer.hidden = true;
				videoEmbed.src = source.url;
				videoEmbed.hidden = false;
				updateDurationAvailability();
			} else {
				resourcePlayer.src = source.url;
				resourcePlayer.load();
			}
		}
		updateSourceMode();
	}

	function renderResource() {
		const data = window.VideotecaStore.get();
		const resource = data.resources[resourceId];
		resourceTitle.textContent = resource.title;
		document.title = `${resource.title} | Videoteca`;
		resourceMeta.textContent = `${resource.unit} · Video educativo`;
		resourceDescription.textContent = resource.description;
		document.querySelector("#video-url-input").value = resource.videoUrl;
		trimStartInput.value = Number.isFinite(Number(resource.trimStart)) ? String(resource.trimStart) : "0";
		trimEndInput.value = resource.trimEnd !== null && resource.trimEnd !== undefined && Number.isFinite(Number(resource.trimEnd)) ? String(resource.trimEnd) : "";
		trimEndInput.min = trimStartInput.value;
		saveDurationButton.disabled = true;
		durationEditorStatus.textContent = "Cargando duración del video...";
		loadVideo(resource);
		renderDocuments(resource);
		renderPopups(resource);
	}

	if (!window.VideotecaStore.getCloudStatus()) {
		resourceSaveStatus.textContent = "No se pudo conectar con Firebase. Vuelve a iniciar sesión o comprueba tu perfil.";
	}

	function appendCommentText(target, value) {
		const text = String(value || "");
		const timestampPattern = /(^|[^\d:])((?:(\d{1,2}):)?(\d{1,2}):([0-5]\d))(?![\d:])/g;
		let lastIndex = 0;
		let match;
		while ((match = timestampPattern.exec(text))) {
			target.append(document.createTextNode(text.slice(lastIndex, match.index) + match[1]));
			const timestamp = (Number(match[3] || 0) * 60 + Number(match[4])) * 60 + Number(match[5]);
			const link = document.createElement("a");
			link.className = "comment-timestamp-link";
			link.href = "#resource-player";
			link.dataset.commentTimestamp = String(timestamp);
			link.textContent = match[2];
			target.append(link);
			lastIndex = timestampPattern.lastIndex;
		}
		target.append(document.createTextNode(text.slice(lastIndex)));
	}

	function createCommentArticle(comment, isReply = false) {
		const article = document.createElement("article");
		article.className = isReply ? "comment comment-reply" : "comment";
		const avatar = document.createElement("span");
		avatar.className = "comment-avatar";
		avatar.setAttribute("aria-hidden", "true");
		avatar.textContent = comment.initials;
		const content = document.createElement("div");
		content.className = "comment-layout";
		const header = document.createElement("div");
		header.className = "comment-header";
		const author = document.createElement("span");
		author.className = "comment-author";
		author.textContent = comment.author;
		const date = document.createElement("time");
		date.className = "comment-date";
		date.textContent = comment.date;
		header.append(author, date);
		const text = document.createElement("p");
		text.className = "comment-text";
		appendCommentText(text, comment.text);
		content.append(header, text);

		const actions = document.createElement("div");
		actions.className = "comment-inline-actions";
		if (!isReply) {
			const reply = document.createElement("button");
			reply.type = "button";
			reply.className = "comment-reply-toggle";
			reply.dataset.replyTo = comment.id;
			reply.setAttribute("aria-expanded", "false");
			reply.textContent = "Responder";
			actions.append(reply);
		}
		if (isEditing) {
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "comment-remove";
			remove.dataset.commentId = comment.id;
			remove.textContent = "Eliminar comentario";
			actions.append(remove);
		}
		if (actions.childElementCount) content.append(actions);
		article.append(avatar, content);
		return { article, content };
	}

	function renderComments() {
		const comments = window.VideotecaStore.get().comments[resourceId] || [];
		commentCount.textContent = `${comments.length} ${comments.length === 1 ? "comentario" : "comentarios"}`;
		commentList.replaceChildren();
		comments.filter((comment) => !comment.parentId).forEach((comment) => {
			const { article, content } = createCommentArticle(comment);
			const replyForm = document.createElement("form");
			replyForm.className = "comment-reply-form";
			replyForm.dataset.replyFormFor = comment.id;
			replyForm.hidden = true;
			const replyInput = document.createElement("textarea");
			replyInput.name = "reply";
			replyInput.setAttribute("aria-label", `Respuesta a ${comment.author}`);
			replyInput.placeholder = "Escribe una respuesta...";
			replyInput.required = true;
			const replySubmit = document.createElement("button");
			replySubmit.type = "submit";
			replySubmit.className = "comment-submit";
			replySubmit.textContent = "Responder";
			replyForm.append(replyInput, replySubmit);
			content.append(replyForm);

			const replies = comments.filter((item) => item.parentId === comment.id);
			if (replies.length) {
				const replyList = document.createElement("div");
				replyList.className = "comment-replies";
				replies.forEach((reply) => replyList.append(createCommentArticle(reply, true).article));
				article.append(replyList);
			}
			commentList.append(article);
		});
	}

	function saveInlineField(field) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		const key = field === resourceTitle ? "title" : "description";
		const value = field.textContent.trim();
		window.VideotecaStore.saveResource(resourceId, { [key]: value || resource[key] });
		renderResource();
		resourceSaveStatus.textContent = "Cambios sincronizados con Firebase.";
	}

	function setEditing(value) {
		if (!isTeacher) return;
		if (value && pausedPopupId) {
			completedPopupIds.add(pausedPopupId);
			pausedPopupId = "";
		}
		isEditing = value;
		document.body.classList.toggle("editing-resource", isEditing);
		resourceTitle.contentEditable = String(isEditing);
		resourceDescription.contentEditable = String(isEditing);
		resourceTitle.setAttribute("aria-readonly", String(!isEditing));
		resourceDescription.setAttribute("aria-readonly", String(!isEditing));
		document.body.classList.toggle("resource-creation-pending", isCreatingResource);
		document.querySelector("#edit-resource-button").textContent = isCreatingResource ? "Crear recurso" : isEditing ? "Terminar edición" : "Editar recurso";
		renderResource();
		renderComments();
	}

	async function finishResourceCreation() {
		const title = resourceTitle.textContent.trim();
		const description = resourceDescription.textContent.trim();
		const resource = window.VideotecaStore.get().resources[resourceId];
		if (!title) {
			resourceSaveStatus.textContent = "Escribe el título del recurso para continuar.";
			resourceTitle.focus();
			return;
		}
		if (!description) {
			resourceSaveStatus.textContent = "Escribe la descripción del recurso para continuar.";
			resourceDescription.focus();
			return;
		}
		if (!resource.videoStoragePath && !resource.videoLocalKey && !resource.videoUrl.trim()) {
			resourceSaveStatus.textContent = "Adjunta un video mediante URL o archivo para crear el recurso.";
			return;
		}
		if (!resource.videoStoragePath && !resource.videoLocalKey && resource.videoUrl.trim()) {
			try {
				resolveVideoUrl(resource.videoUrl);
			} catch {
				resourceSaveStatus.textContent = "La URL del video no es válida.";
				return;
			}
		}
		if (!window.VideotecaStore.getCloudStatus()) {
			resourceSaveStatus.textContent = "No se puede crear el recurso: Firestore no pudo cargar la asignatura. Revisa las reglas y el UID propietario.";
			return;
		}

		const duration = Number.isFinite(resourcePlayer.duration) && resourcePlayer.duration > 0
			? `${Math.ceil(resourcePlayer.duration / 60)} min`
			: resource.duration;
		window.VideotecaStore.saveResource(resourceId, { title, description, duration, isDraft: false, isHidden: false });
		window.VideotecaStore.setResourceHidden(resourceId, false);
		try {
			await window.VideotecaStore.flush();
		} catch (error) {
			resourceSaveStatus.textContent = `No se pudo guardar el recurso en Firestore${error.code ? ` (${error.code})` : "."}`;
			return;
		}
		isCreatingResource = false;
		document.body.classList.remove("resource-creation-pending");
		window.history.replaceState(null, "", `recurso.html?asignatura=${encodeURIComponent(window.VideotecaStore.getAssignmentId())}&recurso=${encodeURIComponent(resourceId)}`);
		setEditing(false);
		resourceSaveStatus.textContent = "Recurso creado. Ya aparece en la asignatura.";
	}

	function setEditorAction(action) {
		activeEditorAction = action;
		document.querySelectorAll("[data-editor-action]").forEach((button) => {
			const isSelected = button.dataset.editorAction === action;
			button.setAttribute("aria-pressed", String(isSelected));
		});
		document.querySelectorAll("[data-editor-panel]").forEach((panel) => {
			panel.hidden = panel.dataset.editorPanel !== action;
		});
	}

	function updateDurationAvailability() {
		const resource = window.VideotecaStore.get().resources[resourceId];
		const canTrim = !resourcePlayer.hidden && Number.isFinite(resourcePlayer.duration);
		saveDurationButton.disabled = !canTrim;
		if (!canTrim) {
			durationEditorStatus.textContent = "El recorte requiere un archivo local o una URL directa de video; los reproductores embebidos no exponen esta función.";
			return;
		}

		const duration = resourcePlayer.duration;
		trimStartInput.max = String(duration);
		trimEndInput.max = String(duration);
		trimEndInput.min = trimStartInput.value || "0";
		durationEditorStatus.textContent = `Duración original: ${formatTimestamp(duration)}. El tramo se aplica mientras se reproduce este recurso.`;
	}

	function applyPlaybackRange() {
		const resource = window.VideotecaStore.get().resources[resourceId];
		if (resourcePlayer.hidden || !Number.isFinite(resourcePlayer.duration)) return;
		const start = Math.max(0, Number(resource.trimStart) || 0);
		const hasTrimEnd = resource.trimEnd !== null && resource.trimEnd !== undefined && resource.trimEnd !== "";
		const end = hasTrimEnd && Number.isFinite(Number(resource.trimEnd)) ? Number(resource.trimEnd) : resourcePlayer.duration;
		if (end <= start) return;

		if (resourcePlayer.currentTime < start) {
			resourcePlayer.currentTime = start;
		} else if (resourcePlayer.currentTime > end) {
			resourcePlayer.currentTime = end;
		}
		if (resourcePlayer.currentTime >= end && !resourcePlayer.paused) {
			resourcePlayer.pause();
			resourcePlayer.currentTime = end;
		}
	}

	document.querySelector("#edit-resource-button").addEventListener("click", () => {
		if (isCreatingResource) finishResourceCreation();
		else setEditing(!isEditing);
	});
	document.querySelectorAll("[data-editor-action]").forEach((button) => {
		button.addEventListener("click", () => setEditorAction(button.dataset.editorAction));
	});
	[resourceTitle, resourceDescription].forEach((field) => {
		field.addEventListener("blur", () => {
			if (isEditing) saveInlineField(field);
		});
		field.addEventListener("keydown", (event) => {
			if (field === resourceTitle && event.key === "Enter") {
				event.preventDefault();
				field.blur();
			}
		});
	});

	document.querySelectorAll('input[name="video-source-mode"]').forEach((radio) => {
		radio.addEventListener("change", updateSourceMode);
	});

	document.querySelector("#save-video-url-button").addEventListener("click", async () => {
		const videoUrl = document.querySelector("#video-url-input").value.trim();
		if (!videoUrl) return;
		let source;
		try {
			source = resolveVideoUrl(videoUrl);
		} catch {
			resourceSaveStatus.textContent = "Introduce una URL válida.";
			return;
		}
		resourceSaveStatus.textContent = "Generando miniatura del video...";
		let thumbnailUrl = "";
		try {
			thumbnailUrl = await getVideoThumbnail(videoUrl, source);
		} catch (error) {
			console.warn("No se pudo generar la miniatura del video.", error);
		}
		const previousStoragePath = window.VideotecaStore.get().resources[resourceId].videoStoragePath;
		const previousLocalKey = window.VideotecaStore.get().resources[resourceId].videoLocalKey;
		window.VideotecaStore.saveResource(resourceId, {
			videoUrl,
			videoStoragePath: "",
			videoLocalKey: "",
			videoFileName: "",
			...(thumbnailUrl ? { thumbnailUrl } : {})
		});
		if (previousStoragePath) deleteObject(ref(storage, previousStoragePath)).catch(() => {});
		if (previousLocalKey) removeLocalVideo(previousLocalKey).catch(() => {});
		renderResource();
		resourceSaveStatus.textContent = thumbnailUrl
			? "Video y miniatura actualizados."
			: "Video actualizado; no se pudo capturar un fotograma y se conserva la miniatura anterior.";
	});

	trimStartInput.addEventListener("input", () => {
		trimEndInput.min = trimStartInput.value || "0";
	});
	durationForm.addEventListener("submit", (event) => {
		event.preventDefault();
		if (resourcePlayer.hidden || !Number.isFinite(resourcePlayer.duration)) return;
		const start = Number(trimStartInput.value);
		const end = trimEndInput.value === "" ? resourcePlayer.duration : Number(trimEndInput.value);
		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || end > resourcePlayer.duration) {
			durationEditorStatus.textContent = "Revisa los tiempos: el inicio debe ser menor que el final y ambos deben estar dentro del video.";
			return;
		}

		window.VideotecaStore.saveResource(resourceId, { trimStart: start, trimEnd: trimEndInput.value === "" ? null : end });
		resourcePlayer.currentTime = start;
		durationEditorStatus.textContent = `Tramo guardado: ${formatTimestamp(start)} a ${formatTimestamp(end)}.`;
		resourceSaveStatus.textContent = "Duración del video actualizada.";
	});

	document.querySelector("#replace-video-input").addEventListener("change", async (event) => {
		const file = event.target.files[0];
		if (!file) return;
		try {
			resourceSaveStatus.textContent = "Generando miniatura y preparando la compresión WebM...";
			let thumbnailUrl = "";
			try {
				thumbnailUrl = await captureFileThumbnail(file);
			} catch (error) {
				console.warn("No se pudo generar la miniatura del archivo.", error);
			}
			const previousStoragePath = window.VideotecaStore.get().resources[resourceId].videoStoragePath;
			const previousLocalKey = window.VideotecaStore.get().resources[resourceId].videoLocalKey;
			const uploadedVideo = await storeVideoFile(file);
			window.VideotecaStore.saveResource(resourceId, {
				videoUrl: "",
				videoStoragePath: "",
				videoLocalKey: uploadedVideo.localKey,
				videoFileName: uploadedVideo.fileName,
				...(thumbnailUrl ? { thumbnailUrl } : {})
			});
			if (previousStoragePath) deleteObject(ref(storage, previousStoragePath)).catch(() => {});
			if (previousLocalKey && previousLocalKey !== uploadedVideo.localKey) removeLocalVideo(previousLocalKey).catch(() => {});
			renderResource();
			resourceSaveStatus.textContent = thumbnailUrl
				? `Video convertido a WebM y guardado localmente: ${uploadedVideo.fileName}`
				: `Video convertido a WebM y guardado localmente: ${uploadedVideo.fileName}. No se pudo capturar una miniatura nueva.`;
		} catch (error) {
			console.error("No se pudo convertir o subir el video.", error);
			if (error.name === "QuotaExceededError") {
				resourceSaveStatus.textContent = "No hay espacio suficiente en el almacenamiento local del navegador para este video.";
			} else {
				resourceSaveStatus.textContent = error.message || "No se pudo convertir el video a WebM.";
			}
		}
		event.target.value = "";
	});

	function openPopupEditor(popup = null) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		if (!resource.materials.length) {
			resourceSaveStatus.textContent = "Adjunta primero un documento para vincularlo al pop-up.";
			return;
		}
		editingPopupId = popup?.id || null;
		popupForm.elements.time.value = popup?.timestamp ?? Number(resourcePlayer.currentTime.toFixed(1));
		popupForm.elements.title.value = popup?.title || "";
		popupForm.elements.message.value = popup?.message || "";
		popupForm.elements.x.value = popup?.x ?? 72;
		popupForm.elements.y.value = popup?.y ?? 55;
		popupPauseInput.checked = Boolean(popup?.pauseVideo);
		popupDismissInput.value = popup?.dismissAfter ?? 5;
		popupHighlightInput.checked = Boolean(popup?.highlightEnabled);
		popupForm.elements.highlightX.value = popup?.highlightX ?? 50;
		popupForm.elements.highlightY.value = popup?.highlightY ?? 50;
		popupImageInput.value = "";
		popupImageToRemove = false;
		popupImageStatus.textContent = "";
		popupFormStatus.textContent = "";
		setPopupImagePreview(popup?.imageDataUrl || "");
		updatePopupOptions();
		popupDocumentSelect.value = popup?.materialId || resource.materials[0].id;
		document.querySelector("#popup-dialog-title").textContent = popup ? "Editar pop-up" : "Añadir pop-up";
		document.querySelector("#popup-x-output").value = `${popupForm.elements.x.value}%`;
		document.querySelector("#popup-y-output").value = `${popupForm.elements.y.value}%`;
		popupDialog.showModal();
	}

	function updatePopupOptions() {
		const pausesVideo = popupPauseInput.checked;
		document.querySelector("#popup-dismiss-field").hidden = pausesVideo;
		popupDismissInput.required = !pausesVideo;
		popupDismissInput.disabled = pausesVideo;
		popupHighlightFields.hidden = !popupHighlightInput.checked;
	}

	function setPopupImagePreview(source) {
		if (popupImagePreviewUrl) URL.revokeObjectURL(popupImagePreviewUrl);
		popupImagePreviewUrl = source?.startsWith("blob:") ? source : "";
		popupImagePreview.src = source || "";
		popupImagePreview.classList.toggle("visible", Boolean(source));
		removePopupImageButton.hidden = !source;
	}

	function readImageAsDataUrl(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	document.querySelector("#add-popup-button").addEventListener("click", () => openPopupEditor());
	document.querySelector("#cancel-popup-button").addEventListener("click", () => popupDialog.close());
	popupDialog.addEventListener("close", () => {
		if (popupImagePreviewUrl) URL.revokeObjectURL(popupImagePreviewUrl);
		popupImagePreviewUrl = "";
		if (popupImagePreview.src.startsWith("blob:")) setPopupImagePreview("");
	});
	popupPauseInput.addEventListener("change", updatePopupOptions);
	popupHighlightInput.addEventListener("change", updatePopupOptions);
	popupForm.elements.x.addEventListener("input", () => {
		document.querySelector("#popup-x-output").value = `${popupForm.elements.x.value}%`;
	});
	popupForm.elements.y.addEventListener("input", () => {
		document.querySelector("#popup-y-output").value = `${popupForm.elements.y.value}%`;
	});
	popupForm.elements.highlightX.addEventListener("input", () => {
		document.querySelector("#popup-highlight-x-output").value = `${popupForm.elements.highlightX.value}%`;
	});
	popupForm.elements.highlightY.addEventListener("input", () => {
		document.querySelector("#popup-highlight-y-output").value = `${popupForm.elements.highlightY.value}%`;
	});
	popupImageInput.addEventListener("change", () => {
		const image = popupImageInput.files[0];
		if (!image) return;
		if (!image.type.startsWith("image/") || image.size > maxPopupImageSize) {
			popupImageInput.value = "";
			popupImageStatus.textContent = "Elige una imagen válida de hasta 400 KB.";
			return;
		}
		popupImageToRemove = false;
		popupImageStatus.textContent = "";
		setPopupImagePreview(URL.createObjectURL(image));
	});
	removePopupImageButton.addEventListener("click", () => {
		popupImageToRemove = true;
		popupImageInput.value = "";
		popupImageStatus.textContent = "La imagen se quitará al guardar.";
		setPopupImagePreview("");
	});
	popupForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const formData = new FormData(popupForm);
		const resource = window.VideotecaStore.get().resources[resourceId];
		const selectedImage = popupImageInput.files[0];
		if (selectedImage && (!selectedImage.type.startsWith("image/") || selectedImage.size > maxPopupImageSize)) {
			popupImageStatus.textContent = "Elige una imagen válida de hasta 400 KB.";
			return;
		}
		const existingPopup = resource.popups.find((item) => item.id === editingPopupId);
		let imageDataUrl = popupImageToRemove ? "" : existingPopup?.imageDataUrl || "";
		let imageName = popupImageToRemove ? "" : existingPopup?.imageName || "";
		if (selectedImage) {
			try {
				imageDataUrl = await readImageAsDataUrl(selectedImage);
				imageName = selectedImage.name;
			} catch {
				popupImageStatus.textContent = "No se pudo leer la imagen seleccionada.";
				return;
			}
		}
		const pauseVideo = formData.get("pauseVideo") === "on";
		const dismissAfter = Number(formData.get("dismissAfter"));
		if (!pauseVideo && (!Number.isFinite(dismissAfter) || dismissAfter < 1 || dismissAfter > 60)) {
			popupFormStatus.textContent = "Indica un tiempo de cierre entre 1 y 60 segundos.";
			return;
		}
		const popup = {
			id: editingPopupId || `popup-${Date.now().toString(36)}`,
			timestamp: Number(formData.get("time")),
			x: Number(formData.get("x")),
			y: Number(formData.get("y")),
			title: formData.get("title").trim(),
			message: formData.get("message").trim(),
			materialId: formData.get("materialId"),
			pauseVideo,
			dismissAfter: pauseVideo ? null : dismissAfter,
			highlightEnabled: formData.get("highlightEnabled") === "on",
			highlightX: Number(formData.get("highlightX")),
			highlightY: Number(formData.get("highlightY")),
			imageDataUrl,
			imageName
		};
		if (!Number.isFinite(popup.timestamp) || popup.timestamp < 0) return;
		const popups = editingPopupId
			? resource.popups.map((item) => item.id === editingPopupId ? popup : item)
			: [...resource.popups, popup];
		window.VideotecaStore.saveResource(resourceId, { popups });
		completedPopupIds.delete(popup.id);
		if (pausedPopupId === popup.id) pausedPopupId = "";
		popupDialog.close();
		renderResource();
		resourceSaveStatus.textContent = editingPopupId ? "Pop-up actualizado." : "Pop-up añadido.";
		editingPopupId = null;
	});

	popupList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-popup-action]");
		if (!button) return;
		const resource = window.VideotecaStore.get().resources[resourceId];
		const popup = resource.popups.find((item) => item.id === button.dataset.popupId);
		if (!popup) return;
		if (button.dataset.popupAction === "edit") {
			openPopupEditor(popup);
			return;
		}
		if (button.dataset.popupAction === "delete" && window.confirm("¿Eliminar este pop-up?")) {
			window.VideotecaStore.saveResource(resourceId, { popups: resource.popups.filter((item) => item.id !== popup.id) });
			renderResource();
			resourceSaveStatus.textContent = "Pop-up eliminado.";
		}
	});

	resourcePlayer.addEventListener("loadedmetadata", () => {
		updateDurationAvailability();
		applyPlaybackRange();
	});
	resourcePlayer.addEventListener("error", () => {
		if (resourcePlayer.hidden) return;
		saveDurationButton.disabled = true;
		durationEditorStatus.textContent = "No se pudo cargar el video. Verifica la URL o el archivo adjunto.";
	});
	resourcePlayer.addEventListener("timeupdate", () => {
		applyPlaybackRange();
		syncPopups();
	});
	resourcePlayer.addEventListener("seeking", () => {
		if (pausedPopupId) {
			resourcePlayer.currentTime = pausedPopupTimestamp;
			return;
		}
		applyPlaybackRange();
	});
	resourcePlayer.addEventListener("seeked", () => {
		applyPlaybackRange();
		syncPopups(true);
	});
	videoOverlays.addEventListener("click", (event) => {
		const button = event.target.closest("[data-material-id]");
		if (button) scrollToMaterial(button.dataset.materialId);
	});

	document.querySelector("#add-document-button").addEventListener("click", () => addDocumentDialog.showModal());
	document.querySelector("#cancel-add-document").addEventListener("click", () => addDocumentDialog.close());
	addDocumentForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const formData = new FormData(addDocumentForm);
		const resource = window.VideotecaStore.get().resources[resourceId];
		window.VideotecaStore.saveResource(resourceId, {
			materials: [...resource.materials, {
				title: formData.get("title").trim(),
				format: formData.get("format").trim(),
				description: formData.get("description").trim(),
				url: formData.get("url").trim()
			}]
		});
		addDocumentForm.reset();
		addDocumentDialog.close();
		renderResource();
		resourceSaveStatus.textContent = "Documento añadido.";
	});

	materialsList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-document-index]");
		if (!button || !window.confirm("¿Eliminar este documento adjunto?")) return;
		const resource = window.VideotecaStore.get().resources[resourceId];
		const removedMaterial = resource.materials[Number(button.dataset.documentIndex)];
		const materials = resource.materials.filter((material) => material.id !== removedMaterial.id);
		const popups = resource.popups.filter((popup) => popup.materialId !== removedMaterial.id);
		window.VideotecaStore.saveResource(resourceId, { materials, popups });
		renderResource();
		resourceSaveStatus.textContent = "Documento eliminado.";
	});

	function seekToCommentTimestamp(seconds, label) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		if (resourcePlayer.hidden || !Number.isFinite(resourcePlayer.duration)) {
			resourceSaveStatus.textContent = "Los timestamps requieren un video local o una URL directa.";
			return;
		}
		const start = Math.max(0, Number(resource.trimStart) || 0);
		const end = resource.trimEnd !== null && resource.trimEnd !== undefined
			? Number(resource.trimEnd)
			: resourcePlayer.duration;
		if (seconds < start || seconds > end || seconds > resourcePlayer.duration) {
			resourceSaveStatus.textContent = "Ese momento está fuera del tramo reproducible del video.";
			return;
		}
		if (pausedPopupId) {
			completedPopupIds.add(pausedPopupId);
			pausedPopupId = "";
		}
		resourcePlayer.currentTime = seconds;
		resourcePlayer.scrollIntoView({ behavior: "smooth", block: "center" });
		resourceSaveStatus.textContent = `Video en ${label}.`;
		syncPopups(true);
	}

	commentList.addEventListener("click", (event) => {
		const timestampLink = event.target.closest("[data-comment-timestamp]");
		if (timestampLink) {
			event.preventDefault();
			seekToCommentTimestamp(Number(timestampLink.dataset.commentTimestamp), timestampLink.textContent);
			return;
		}
		const replyButton = event.target.closest("[data-reply-to]");
		if (replyButton) {
			const replyForm = replyButton.closest(".comment-layout").querySelector(".comment-reply-form");
			replyForm.hidden = !replyForm.hidden;
			replyButton.setAttribute("aria-expanded", String(!replyForm.hidden));
			if (!replyForm.hidden) replyForm.querySelector("textarea").focus();
			return;
		}
		const removeButton = event.target.closest("[data-comment-id]");
		if (!removeButton || !window.confirm("¿Eliminar este comentario y sus respuestas?")) return;
		window.VideotecaStore.deleteComment(resourceId, removeButton.dataset.commentId);
		renderComments();
	});

	commentList.addEventListener("submit", (event) => {
		const replyForm = event.target.closest("[data-reply-form-for]");
		if (!replyForm) return;
		event.preventDefault();
		const text = replyForm.elements.reply.value.trim();
		if (!text) return;
		window.VideotecaStore.addComment(resourceId, {
			parentId: replyForm.dataset.replyFormFor,
			author: "Tú",
			initials: "T",
			date: "Ahora",
			text
		});
		renderComments();
		resourceSaveStatus.textContent = "Respuesta publicada.";
	});

	commentForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = commentInput.value.trim();
		if (!text) return;
		window.VideotecaStore.addComment(resourceId, { author: "Tú", initials: "T", date: "Ahora", text });
		commentForm.reset();
		renderComments();
		commentInput.focus();
	});

	window.addEventListener("pagehide", () => {
		if (isCreatingResource && window.VideotecaStore.get().resources[resourceId]?.isDraft) {
			window.VideotecaStore.deleteResource(resourceId);
		}
	});
	if (isCreatingResource) setEditing(true);
	else {
		renderResource();
		renderComments();
	}
	setEditorAction(activeEditorAction);
})();
