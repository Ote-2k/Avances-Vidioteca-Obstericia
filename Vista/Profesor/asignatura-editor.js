(() => {
	const resourceGrid = document.querySelector("#resource-grid");
	const resourceCount = document.querySelector("#resource-count");
	const courseTitle = document.querySelector("#course-title");
	const courseDescription = document.querySelector("#course-description");
	const courseSaveStatus = document.querySelector("#course-save-status");
	const addResourceDialog = document.querySelector("#add-resource-dialog");
	const addResourceForm = document.querySelector("#add-resource-form");
	const commentList = document.querySelector("#comment-list");
	const commentCount = document.querySelector("#comment-count");
	const commentForm = document.querySelector("#comment-form");
	const commentInput = document.querySelector("#comment-input");
	let isEditing = false;

	function renderCourse(statusMessage = "") {
		const data = window.VideotecaStore.get();
		document.title = `${data.course.title} | Videoteca`;
		courseTitle.textContent = data.course.title;
		document.querySelector("#course-nav-title").textContent = data.course.title;
		courseDescription.textContent = data.course.description;
		const cover = document.querySelector("#course-cover");
		cover.src = data.course.coverUrl;
		cover.alt = `Portada de ${data.course.title}`;

		const resources = Object.entries(data.resources);
		const visibleResources = resources.filter(([, resource]) => !resource.isHidden);
		const hiddenCount = resources.length - visibleResources.length;
		const materialCount = visibleResources.reduce((total, [, resource]) => total + resource.materials.length, 0);
		resourceCount.textContent = isEditing && hiddenCount
			? `${visibleResources.length} visibles · ${hiddenCount} ocultos`
			: `${visibleResources.length} recursos · ${materialCount} materiales asociados`;
		resourceGrid.replaceChildren();

		resources.filter(([, resource]) => isEditing || !resource.isHidden).forEach(([id, resource]) => {
			const card = document.createElement("article");
			card.className = `resource-card${resource.isHidden ? " is-hidden" : ""}`;

			const preview = document.createElement("div");
			preview.className = "video-preview";
			const image = document.createElement("img");
			image.src = resource.thumbnailUrl;
			image.alt = `Miniatura de ${resource.title}`;
			const playMark = document.createElement("span");
			playMark.className = "play-mark";
			playMark.setAttribute("aria-hidden", "true");
			const duration = document.createElement("span");
			duration.className = "duration";
			duration.textContent = resource.duration;
			const hiddenBadge = document.createElement("span");
			hiddenBadge.className = "hidden-badge";
			hiddenBadge.textContent = "Oculto a estudiantes";
			preview.append(image, playMark, duration, hiddenBadge);

			const content = document.createElement("div");
			content.className = "resource-content";
			const title = document.createElement("h3");
			title.className = "resource-title";
			title.textContent = resource.title;
			const meta = document.createElement("p");
			meta.className = "resource-meta";
			meta.textContent = `${resource.unit} · Video educativo`;
			content.append(title, meta);

			const material = resource.materials[0];
			if (material) {
				const support = document.createElement("div");
				support.className = "support-info";
				const label = document.createElement("p");
				label.className = "support-label";
				label.textContent = "Material asociado";
				const detail = document.createElement("p");
				detail.className = "support-detail";
				detail.textContent = `${material.title} · ${material.format}`;
				support.append(label, detail);
				content.append(support);
			}

			const openLink = document.createElement("a");
			openLink.className = "resource-open";
			openLink.href = `recurso.html?recurso=${encodeURIComponent(id)}`;
			openLink.setAttribute("aria-label", `Abrir recurso ${resource.title}`);
			openLink.append(preview, content);

			const menu = document.createElement("details");
			menu.className = "resource-menu";
			const menuToggle = document.createElement("summary");
			menuToggle.textContent = "⋯";
			menuToggle.setAttribute("aria-label", `Opciones de ${resource.title}`);
			const menuPanel = document.createElement("div");
			menuPanel.className = "resource-menu-panel";
			const visibilityButton = document.createElement("button");
			visibilityButton.type = "button";
			visibilityButton.dataset.resourceAction = "visibility";
			visibilityButton.dataset.resourceId = id;
			visibilityButton.textContent = resource.isHidden ? "Mostrar recurso" : "Ocultar recurso";
			const deleteButton = document.createElement("button");
			deleteButton.type = "button";
			deleteButton.className = "delete-resource";
			deleteButton.dataset.resourceAction = "delete";
			deleteButton.dataset.resourceId = id;
			deleteButton.textContent = "Eliminar recurso";
			menuPanel.append(visibilityButton, deleteButton);
			menu.append(menuToggle, menuPanel);

			card.append(openLink, menu);
			resourceGrid.append(card);
		});
		courseSaveStatus.textContent = statusMessage;
	}

	function renderComments() {
		const comments = window.VideotecaStore.get().comments.course;
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
				const removeButton = document.createElement("button");
				removeButton.type = "button";
				removeButton.className = "comment-remove";
				removeButton.dataset.commentId = comment.id;
				removeButton.textContent = "Eliminar comentario";
				content.append(removeButton);
			}
			article.append(avatar, content);
			commentList.append(article);
		});
	}
	function saveCourseField(field) {
		const course = window.VideotecaStore.get().course;
		const key = field === courseTitle ? "title" : "description";
		const value = field.textContent.trim();
		window.VideotecaStore.saveCourse({ [key]: value || course[key] });
		renderCourse("Cambios guardados en este navegador.");
	}
	function setEditing(value) {
		isEditing = value;
		document.body.classList.toggle("editing", isEditing);
		const button = document.querySelector("#edit-course-button");
		button.textContent = isEditing ? "Terminar edición" : "Editar asignatura";
		courseTitle.contentEditable = String(isEditing);
		courseDescription.contentEditable = String(isEditing);
		courseTitle.setAttribute("aria-readonly", String(!isEditing));
		courseDescription.setAttribute("aria-readonly", String(!isEditing));
		renderCourse();
		renderComments();
	}
	function createComment(text) {
		window.VideotecaStore.addComment("course", {
			author: "Tú",
			initials: "T",
			date: "Ahora",
			text
		});
		commentForm.reset();
		renderComments();
	}
	document.querySelector("#edit-course-button").addEventListener("click", () => setEditing(!isEditing));
	[courseTitle, courseDescription].forEach((field) => {
		field.addEventListener("blur", () => {
			if (isEditing) saveCourseField(field);
		});
		field.addEventListener("keydown", (event) => {
			if (field === courseTitle && event.key === "Enter") {
				event.preventDefault();
				field.blur();
			}
		});
	});

	document.querySelector("#change-cover-button").addEventListener("click", () => document.querySelector("#cover-file-input").click());
	document.querySelector("#cover-file-input").addEventListener("change", (event) => {
		const file = event.target.files[0];
		if (!file) return;
		if (file.size > 2 * 1024 * 1024) {
			courseSaveStatus.textContent = "La imagen debe pesar menos de 2 MB.";
			event.target.value = "";
			return;
		}
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			window.VideotecaStore.saveCourse({ coverUrl: reader.result });
			renderCourse("Portada actualizada.");
			event.target.value = "";
		});
		reader.readAsDataURL(file);
	});

	resourceGrid.addEventListener("click", (event) => {
		const action = event.target.closest("[data-resource-action]");
		if (!action) return;
		const { resourceId, resourceAction } = action.dataset;
		if (resourceAction === "visibility") {
			const resource = window.VideotecaStore.get().resources[resourceId];
			window.VideotecaStore.setResourceHidden(resourceId, !resource.isHidden);
			renderCourse(resource.isHidden ? "Recurso visible para estudiantes." : "Recurso oculto a estudiantes.");
			return;
		}
		if (resourceAction === "delete" && window.confirm("¿Eliminar este recurso de la asignatura?")) {
			window.VideotecaStore.deleteResource(resourceId);
			renderCourse("Recurso eliminado.");
		}
	});

	document.querySelector("#add-resource-button").addEventListener("click", () => addResourceDialog.showModal());
	document.querySelector("#cancel-add-resource").addEventListener("click", () => addResourceDialog.close());
	addResourceForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const formData = new FormData(addResourceForm);
		const materialTitle = formData.get("materialTitle").trim();
		window.VideotecaStore.createResource({
			title: formData.get("title").trim(),
			unit: formData.get("unit").trim(),
			duration: formData.get("duration").trim(),
			description: formData.get("description").trim(),
			thumbnailUrl: formData.get("thumbnailUrl").trim(),
			videoUrl: formData.get("videoUrl").trim(),
			materials: [{
				title: materialTitle,
				format: formData.get("materialFormat").trim(),
				description: formData.get("materialDescription").trim(),
				url: formData.get("materialUrl").trim()
			}]
		});
		addResourceForm.reset();
		addResourceDialog.close();
		renderCourse("Recurso añadido.");
	});

	commentList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-comment-id]");
		if (!button || !window.confirm("¿Eliminar este comentario?")) return;
		window.VideotecaStore.deleteComment("course", button.dataset.commentId);
		renderComments();
	});

	commentForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = commentInput.value.trim();
		if (!text) return;
		createComment(text);
		commentInput.focus();
	});

	renderCourse();
	renderComments();
})();
