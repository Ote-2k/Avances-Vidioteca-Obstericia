(() => {
	const selectedId = new URLSearchParams(window.location.search).get("recurso");
	const initialResources = window.VideotecaStore.get().resources;
	const resourceId = initialResources[selectedId] ? selectedId : "introduccion";
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
	const documentElements = new Map();
	const commentForm = document.querySelector("#comment-form");
	const commentInput = document.querySelector("#comment-input");
	const commentList = document.querySelector("#comment-list");
	const commentCount = document.querySelector("#comment-count");
	const addDocumentDialog = document.querySelector("#add-document-dialog");
	const addDocumentForm = document.querySelector("#add-document-form");
	let isEditing = false;
	let editingPopupId = null;
	let visiblePopupIds = "";
	let videoDatabasePromise;
	let activeVideoObjectUrl = "";

	function openVideoDatabase() {
		if (!videoDatabasePromise) {
			videoDatabasePromise = new Promise((resolve, reject) => {
				const request = indexedDB.open("videoteca-profesor-media-v1", 1);
				request.onupgradeneeded = () => request.result.createObjectStore("videos");
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		}
		return videoDatabasePromise;
	}

	function storeVideoFile(file) {
		return openVideoDatabase().then((database) => new Promise((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			transaction.objectStore("videos").put(file, resourceId);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		}));
	}

	function readVideoFile() {
		return openVideoDatabase().then((database) => new Promise((resolve, reject) => {
			const request = database.transaction("videos", "readonly").objectStore("videos").get(resourceId);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		}));
	}

	function resolveVideoUrl(value) {
		const url = new URL(value, window.location.href);
		if (!["http:", "https:", "file:"].includes(url.protocol)) throw new Error("Protocolo de video no compatible.");
		const host = url.hostname.replace(/^www\./, "");

		if (host === "youtu.be" || host.endsWith("youtube.com")) {
			const videoId = host === "youtu.be"
				? url.pathname.split("/").filter(Boolean)[0]
				: url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
			if (videoId) return { kind: "embed", url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`, label: "YouTube" };
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
		let supportsTimedPopups = Boolean(resource.videoBlobId);
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
			detail.textContent = `${popup.x}% horizontal · ${popup.y}% vertical · ${material?.title || "Documento no disponible"}`;
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
		const active = !isEditing && !resourcePlayer.hidden
			? resource.popups.filter((popup) => resourcePlayer.currentTime >= popup.timestamp && resourcePlayer.currentTime < popup.timestamp + 5)
			: [];
		const activeIds = active.map((popup) => popup.id).join("|");
		if (!force && activeIds === visiblePopupIds) return;
		visiblePopupIds = activeIds;
		videoOverlays.replaceChildren();
		active.forEach((popup) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "video-popup";
			button.style.left = `${popup.x}%`;
			button.style.top = `${popup.y}%`;
			button.setAttribute("aria-label", `${popup.title}. Ver documento relacionado.`);
			const title = document.createElement("span");
			title.className = "video-popup-title";
			title.textContent = popup.title;
			const message = document.createElement("span");
			message.className = "video-popup-text";
			message.textContent = popup.message;
			const material = resource.materials.find((item) => item.id === popup.materialId);
			const documentLabel = document.createElement("span");
			documentLabel.className = "video-popup-document";
			documentLabel.textContent = material ? `Ver documento: ${material.title}` : "Ver documento relacionado";
			button.append(title, message, documentLabel);
			button.addEventListener("click", () => scrollToMaterial(popup.materialId));
			videoOverlays.append(button);
		});
	}

	async function loadVideo(resource) {
		if (activeVideoObjectUrl) URL.revokeObjectURL(activeVideoObjectUrl);
		activeVideoObjectUrl = "";
		videoEmbed.removeAttribute("src");
		videoEmbed.hidden = true;
		resourcePlayer.hidden = false;

		if (resource.videoBlobId) {
			try {
				const file = await readVideoFile();
				if (file && window.VideotecaStore.get().resources[resourceId].videoBlobId === resource.videoBlobId) {
					activeVideoObjectUrl = URL.createObjectURL(file);
					resourcePlayer.src = activeVideoObjectUrl;
					resourcePlayer.load();
					videoSourceStatus.textContent = `Archivo: ${resource.videoFileName || "video local"}`;
					document.querySelector('input[name="video-source-mode"][value="file"]').checked = true;
					updateSourceMode();
					return;
				}
			} catch {
				resourceSaveStatus.textContent = "No se pudo recuperar el video guardado.";
			}
		}

		const source = resolveVideoUrl(resource.videoUrl);
		videoSourceStatus.textContent = source.label;
		document.querySelector('input[name="video-source-mode"][value="url"]').checked = true;
		updateSourceMode();
		if (source.kind === "embed") {
			resourcePlayer.removeAttribute("src");
			resourcePlayer.load();
			resourcePlayer.hidden = true;
			videoEmbed.src = source.url;
			videoEmbed.hidden = false;
		} else {
			resourcePlayer.src = source.url;
			resourcePlayer.load();
		}
	}

	function renderResource() {
		const data = window.VideotecaStore.get();
		const resource = data.resources[resourceId];
		resourceTitle.textContent = resource.title;
		document.title = `${resource.title} | Videoteca`;
		resourceMeta.textContent = `${resource.unit} · Video educativo · ${resource.duration}`;
		resourceDescription.textContent = resource.description;
		document.querySelector("#course-nav-title").textContent = data.course.title;
		document.querySelector("#video-url-input").value = resource.videoUrl;
		loadVideo(resource);
		renderDocuments(resource);
		renderPopups(resource);
	}

	function renderComments() {
		const comments = window.VideotecaStore.get().comments[resourceId] || [];
		commentCount.textContent = `${comments.length} ${comments.length === 1 ? "comentario" : "comentarios"}`;
		commentList.replaceChildren();
		comments.forEach((comment) => {
			const article = document.createElement("article");
			article.className = "comment";
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
			text.textContent = comment.text;
			content.append(header, text);

			if (isEditing) {
				const remove = document.createElement("button");
				remove.type = "button";
				remove.className = "comment-remove";
				remove.dataset.commentId = comment.id;
				remove.textContent = "Eliminar comentario";
				content.append(remove);
			}
			article.append(avatar, content);
			commentList.append(article);
		});
	}

	function saveInlineField(field) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		const key = field === resourceTitle ? "title" : "description";
		const value = field.textContent.trim();
		window.VideotecaStore.saveResource(resourceId, { [key]: value || resource[key] });
		renderResource();
		resourceSaveStatus.textContent = "Cambios guardados en este navegador.";
	}

	function setEditing(value) {
		isEditing = value;
		document.body.classList.toggle("editing-resource", isEditing);
		resourceTitle.contentEditable = String(isEditing);
		resourceDescription.contentEditable = String(isEditing);
		resourceTitle.setAttribute("aria-readonly", String(!isEditing));
		resourceDescription.setAttribute("aria-readonly", String(!isEditing));
		document.querySelector("#edit-resource-button").textContent = isEditing ? "Terminar edición" : "Editar recurso";
		renderResource();
		renderComments();
	}

	document.querySelector("#edit-resource-button").addEventListener("click", () => setEditing(!isEditing));
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

	document.querySelector("#save-video-url-button").addEventListener("click", () => {
		const videoUrl = document.querySelector("#video-url-input").value.trim();
		if (!videoUrl) return;
		try {
			resolveVideoUrl(videoUrl);
		} catch {
			resourceSaveStatus.textContent = "Introduce una URL válida.";
			return;
		}
		window.VideotecaStore.saveResource(resourceId, { videoUrl, videoBlobId: null, videoFileName: "" });
		renderResource();
		resourceSaveStatus.textContent = "Video adjunto actualizado.";
	});

	document.querySelector("#use-sample-video-button").addEventListener("click", () => {
		document.querySelector("#video-url-input").value = "../../video%20de%20prueba.mp4";
		document.querySelector("#save-video-url-button").click();
	});

	document.querySelector("#replace-video-input").addEventListener("change", async (event) => {
		const file = event.target.files[0];
		if (!file) return;
		try {
			await storeVideoFile(file);
			window.VideotecaStore.saveResource(resourceId, { videoBlobId: resourceId, videoFileName: file.name });
			renderResource();
			resourceSaveStatus.textContent = `Video adjunto: ${file.name}`;
		} catch {
			resourceSaveStatus.textContent = "No se pudo guardar el video local.";
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
		popupDocumentSelect.value = popup?.materialId || resource.materials[0].id;
		document.querySelector("#popup-dialog-title").textContent = popup ? "Editar pop-up" : "Añadir pop-up";
		document.querySelector("#popup-x-output").value = `${popupForm.elements.x.value}%`;
		document.querySelector("#popup-y-output").value = `${popupForm.elements.y.value}%`;
		popupDialog.showModal();
	}

	document.querySelector("#add-popup-button").addEventListener("click", () => openPopupEditor());
	document.querySelector("#cancel-popup-button").addEventListener("click", () => popupDialog.close());
	popupForm.elements.x.addEventListener("input", () => {
		document.querySelector("#popup-x-output").value = `${popupForm.elements.x.value}%`;
	});
	popupForm.elements.y.addEventListener("input", () => {
		document.querySelector("#popup-y-output").value = `${popupForm.elements.y.value}%`;
	});
	document.querySelector("#popup-form").addEventListener("submit", (event) => {
		event.preventDefault();
		const formData = new FormData(popupForm);
		const resource = window.VideotecaStore.get().resources[resourceId];
		const popup = {
			id: editingPopupId || `popup-${Date.now().toString(36)}`,
			timestamp: Number(formData.get("time")),
			x: Number(formData.get("x")),
			y: Number(formData.get("y")),
			title: formData.get("title").trim(),
			message: formData.get("message").trim(),
			materialId: formData.get("materialId")
		};
		if (!Number.isFinite(popup.timestamp) || popup.timestamp < 0) return;
		const popups = editingPopupId
			? resource.popups.map((item) => item.id === editingPopupId ? popup : item)
			: [...resource.popups, popup];
		window.VideotecaStore.saveResource(resourceId, { popups });
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

	resourcePlayer.addEventListener("timeupdate", () => syncPopups());
	resourcePlayer.addEventListener("seeked", () => syncPopups(true));
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

	commentList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-comment-id]");
		if (!button || !window.confirm("¿Eliminar este comentario?")) return;
		window.VideotecaStore.deleteComment(resourceId, button.dataset.commentId);
		renderComments();
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

	renderResource();
	renderComments();
})();
