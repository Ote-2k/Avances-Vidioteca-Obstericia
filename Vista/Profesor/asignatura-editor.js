import "./editor-store.js";

await window.VideotecaStoreReady;

(() => {
	const resourceGrid = document.querySelector("#resource-grid");
	const resourceCount = document.querySelector("#resource-count");
	const courseTitle = document.querySelector("#course-title");
	const courseDescription = document.querySelector("#course-description");
	const courseSaveStatus = document.querySelector("#course-save-status");
	const unitManager = document.querySelector("#unit-manager");
	const unitList = document.querySelector("#unit-list");
	const unitCreateForm = document.querySelector("#unit-create-form");
	const commentList = document.querySelector("#comment-list");
	const commentCount = document.querySelector("#comment-count");
	const commentForm = document.querySelector("#comment-form");
	const commentInput = document.querySelector("#comment-input");
	const mentionResourceOptions = document.querySelector("#mention-resource-options");
	const commentDrafts = new WeakMap();
	let isEditing = false;
	const isTeacher = window.VideotecaStore.isTeacher();
	document.body.classList.toggle("student-view", !isTeacher);
	document.querySelector("#profile-role").textContent = isTeacher ? "Profesor" : "Alumno";
	document.querySelector("#profile-avatar").textContent = isTeacher ? "P" : "A";
	document.querySelector(".brand-role").textContent = isTeacher ? "· Profesor" : "· Alumno";

	function renderUnitManager(units) {
		unitManager.hidden = !isEditing;
		unitList.replaceChildren();
		units.forEach((unit) => {
			const row = document.createElement("div");
			row.className = "unit-row";
			if (unit.id === "unidad-principal") {
				const label = document.createElement("div");
				label.className = "unit-primary-label";
				label.textContent = unit.name;
				const note = document.createElement("span");
				note.className = "unit-primary-note";
				note.textContent = "Unidad permanente";
				label.append(note);
				row.append(label);
			} else {
				const name = document.createElement("strong");
				name.textContent = unit.name;
				const form = document.createElement("form");
				form.className = "unit-edit-form";
				form.dataset.unitId = unit.id;
				const input = document.createElement("input");
				input.name = "name";
				input.value = unit.name;
				input.maxLength = 80;
				input.required = true;
				input.setAttribute("aria-label", `Nombre de la unidad ${unit.name}`);
				const rename = document.createElement("button");
				rename.type = "submit";
				rename.textContent = "Renombrar";
				const remove = document.createElement("button");
				remove.type = "button";
				remove.className = "unit-delete";
				remove.dataset.deleteUnitId = unit.id;
				remove.textContent = "Eliminar";
				form.append(input, rename, remove);
				row.append(name, form);
			}
			unitList.append(row);
		});
	}

	function renderCourse(statusMessage = "") {
		const data = window.VideotecaStore.get();
		document.title = `${data.course.title} | Videoteca`;
		courseTitle.textContent = data.course.title;
		courseDescription.textContent = data.course.description;
		const cover = document.querySelector("#course-cover");
		cover.src = data.course.coverUrl;
		cover.alt = `Portada de ${data.course.title}`;

		const resources = Object.entries(data.resources).filter(([, resource]) => !resource.isDraft);
		const visibleResources = resources.filter(([, resource]) => !resource.isHidden);
		const hiddenCount = resources.length - visibleResources.length;
		const materialCount = visibleResources.reduce((total, [, resource]) => total + resource.materials.length, 0);
		resourceCount.textContent = isEditing && hiddenCount
			? `${visibleResources.length} visibles · ${hiddenCount} ocultos`
			: `${visibleResources.length} recursos · ${materialCount} materiales asociados`;
		resourceGrid.replaceChildren();
		renderUnitManager(data.course.units);
		const unitGrids = new Map();
		data.course.units.forEach((unit) => {
			const section = document.createElement("section");
			section.className = "unit-section";
			section.dataset.unitSectionId = unit.id;
			const heading = document.createElement("header");
			heading.className = "unit-heading";
			const title = document.createElement("h3");
			title.textContent = unit.name;
			const unitResourceCount = resources.filter(([, resource]) => resource.unitId === unit.id && (isEditing || !resource.isHidden)).length;
			const count = document.createElement("span");
			count.textContent = `${unitResourceCount} ${unitResourceCount === 1 ? "recurso" : "recursos"}`;
			heading.append(title, count);
			const grid = document.createElement("div");
			grid.className = "resource-grid";
			const unitResources = resources.filter(([, resource]) => resource.unitId === unit.id && (isEditing || !resource.isHidden));
			if (!unitResources.length) {
				const empty = document.createElement("p");
				empty.className = "unit-empty";
				empty.textContent = "Sin recursos";
				grid.append(empty);
			}
			section.append(heading, grid);
			resourceGrid.append(section);
			unitGrids.set(unit.id, grid);
		});

		resources.filter(([, resource]) => isEditing || !resource.isHidden).forEach(([id, resource]) => {
			const card = document.createElement("article");
			card.className = `resource-card${resource.isHidden ? " is-hidden" : ""}`;
			card.dataset.resourceCardId = id;

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
			openLink.href = `recurso.html?asignatura=${encodeURIComponent(window.VideotecaStore.getAssignmentId())}&recurso=${encodeURIComponent(id)}`;
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
			const moveLabel = document.createElement("label");
			moveLabel.className = "unit-move-label";
			moveLabel.textContent = "Mover a unidad";
			const moveSelect = document.createElement("select");
			moveSelect.className = "unit-move-select";
			moveSelect.dataset.resourceAction = "move";
			moveSelect.dataset.resourceId = id;
			data.course.units.forEach((unit) => {
				const option = document.createElement("option");
				option.value = unit.id;
				option.textContent = unit.name;
				option.selected = unit.id === resource.unitId;
				moveSelect.append(option);
			});
			moveLabel.append(moveSelect);
			menuPanel.append(visibilityButton, deleteButton, moveLabel);
			menu.append(menuToggle, menuPanel);

			card.append(openLink, menu);
			(unitGrids.get(resource.unitId) || unitGrids.get("unidad-principal"))?.append(card);
		});
		courseSaveStatus.textContent = statusMessage;
	}

	if (!window.VideotecaStore.getCloudStatus()) {
		courseSaveStatus.textContent = "No se pudo conectar con Firebase. Comprueba el acceso del profesor.";
	}

	function getMentionableResources() {
		return Object.entries(window.VideotecaStore.get().resources)
			.filter(([, resource]) => !resource.isDraft && (!resource.isHidden || isEditing));
	}

	function getCommentDraft(textarea) {
		if (!commentDrafts.has(textarea)) commentDrafts.set(textarea, { text: textarea.value, mentions: [] });
		return commentDrafts.get(textarea);
	}

	function shiftMentions(mentions, start, end, replacementLength) {
		const difference = replacementLength - (end - start);
		return mentions.flatMap((mention) => {
			if (mention.end <= start) return [mention];
			if (mention.start >= end) return [{ ...mention, start: mention.start + difference, end: mention.end + difference }];
			return [];
		});
	}

	function updateCommentDraft(textarea) {
		const draft = getCommentDraft(textarea);
		const previousText = draft.text;
		const nextText = textarea.value;
		let start = 0;
		while (start < previousText.length && start < nextText.length && previousText[start] === nextText[start]) start++;
		let suffix = 0;
		while (suffix < previousText.length - start && suffix < nextText.length - start && previousText.at(-1 - suffix) === nextText.at(-1 - suffix)) suffix++;
		const previousEnd = previousText.length - suffix;
		const replacementLength = nextText.length - start - suffix;
		draft.mentions = shiftMentions(draft.mentions, start, previousEnd, replacementLength);
		draft.text = nextText;
	}

	function insertResourceMention(textarea, resourceId) {
		const resource = window.VideotecaStore.get().resources[resourceId];
		if (!resource || resource.isDraft || (resource.isHidden && !isEditing)) return;
		updateCommentDraft(textarea);
		const draft = getCommentDraft(textarea);
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const before = textarea.value.slice(0, start);
		const after = textarea.value.slice(end);
		const prefix = before && !/\s$/.test(before) ? " " : "";
		const suffix = after && !/^\s/.test(after) ? " " : "";
		const mentionText = `${prefix}${resource.title}${suffix}`;
		draft.mentions = shiftMentions(draft.mentions, start, end, mentionText.length);
		const mentionStart = start + prefix.length;
		draft.mentions.push({ resourceId, start: mentionStart, end: mentionStart + resource.title.length });
		textarea.value = `${before}${mentionText}${after}`;
		draft.text = textarea.value;
		textarea.focus();
		textarea.setSelectionRange(start + mentionText.length, start + mentionText.length);
	}

	function appendCommentText(target, comment) {
		const text = String(comment.text || "");
		const mentions = (comment.resourceMentions || [])
			.filter((mention) => Number.isInteger(mention.start) && Number.isInteger(mention.end) && mention.start >= 0 && mention.end <= text.length && mention.end > mention.start && window.VideotecaStore.get().resources[mention.resourceId])
			.sort((first, second) => first.start - second.start);
		let lastIndex = 0;
		mentions.forEach((mention) => {
			if (mention.start < lastIndex) return;
			target.append(document.createTextNode(text.slice(lastIndex, mention.start)));
			const link = document.createElement("button");
			link.type = "button";
			link.className = "comment-resource-mention";
			link.dataset.resourceMentionId = mention.resourceId;
			link.textContent = text.slice(mention.start, mention.end);
			link.setAttribute("aria-label", `Resaltar recurso ${link.textContent}`);
			target.append(link);
			lastIndex = mention.end;
		});
		target.append(document.createTextNode(text.slice(lastIndex)));
	}

	function createMentionMenu(textarea) {
		const menu = document.createElement("details");
		menu.className = "resource-mention-menu";
		const summary = document.createElement("summary");
		summary.textContent = "Mencionar recurso";
		const panel = document.createElement("div");
		panel.className = "resource-mention-panel";
		populateMentionOptions(panel);
		if (!panel.childElementCount) {
			const emptyState = document.createElement("span");
			emptyState.className = "resource-mention-empty";
			emptyState.textContent = "No hay recursos disponibles.";
			panel.append(emptyState);
		}
		menu.append(summary, panel);
		return menu;
	}

	function populateMentionOptions(panel) {
		panel.replaceChildren();
		getMentionableResources().forEach(([id, resource]) => {
			const option = document.createElement("button");
			option.type = "button";
			option.className = "resource-mention-option";
			option.dataset.resourceMentionOption = id;
			option.textContent = resource.title;
			panel.append(option);
		});
		if (!panel.childElementCount) {
			const emptyState = document.createElement("span");
			emptyState.className = "resource-mention-empty";
			emptyState.textContent = "No hay recursos disponibles.";
			panel.append(emptyState);
		}
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
		appendCommentText(text, comment);
		content.append(header, text);
		const actions = document.createElement("div");
		actions.className = "comment-inline-actions";
		if (!isReply) {
			const replyButton = document.createElement("button");
			replyButton.type = "button";
			replyButton.className = "comment-reply-toggle";
			replyButton.dataset.replyTo = comment.id;
			replyButton.setAttribute("aria-expanded", "false");
			replyButton.textContent = "Responder";
			actions.append(replyButton);
		}
		if (isEditing) {
			const removeButton = document.createElement("button");
			removeButton.type = "button";
			removeButton.className = "comment-remove";
			removeButton.dataset.commentId = comment.id;
			removeButton.textContent = "Eliminar comentario";
			actions.append(removeButton);
		}
		if (actions.childElementCount) content.append(actions);
		article.append(avatar, content);
		return { article, content };
	}

	function renderComments() {
		const comments = window.VideotecaStore.get().comments.course;
		commentCount.textContent = `${comments.length} ${comments.length === 1 ? "comentario" : "comentarios"}`;
		commentList.replaceChildren();
		populateMentionOptions(mentionResourceOptions);
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
			const replyActions = document.createElement("div");
			replyActions.className = "comment-actions";
			const replySubmit = document.createElement("button");
			replySubmit.type = "submit";
			replySubmit.className = "comment-submit";
			replySubmit.textContent = "Responder";
			replyActions.append(createMentionMenu(replyInput), replySubmit);
			replyForm.append(replyInput, replyActions);
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
	function saveCourseField(field) {
		const course = window.VideotecaStore.get().course;
		const key = field === courseTitle ? "title" : "description";
		const value = field.textContent.trim();
		window.VideotecaStore.saveCourse({ [key]: value || course[key] });
		renderCourse("Cambios sincronizados con Firebase.");
	}
	function setEditing(value) {
		if (!isTeacher) return;
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
	function createComment(text, resourceMentions = []) {
		window.VideotecaStore.addComment("course", {
			author: "Tú",
			initials: "T",
			date: "Ahora",
			text,
			resourceMentions
		});
		commentForm.reset();
		commentDrafts.set(commentInput, { text: "", mentions: [] });
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

	resourceGrid.addEventListener("change", (event) => {
		const selector = event.target.closest('select[data-resource-action="move"]');
		if (!selector) return;
		window.VideotecaStore.moveResourceToUnit(selector.dataset.resourceId, selector.value);
		renderCourse("Recurso movido de unidad.");
	});

	unitCreateForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const name = unitCreateForm.elements.name.value.trim();
		if (!name) return;
		try {
			window.VideotecaStore.createUnit(name);
			unitCreateForm.reset();
			renderCourse("Unidad añadida.");
		} catch (error) {
			courseSaveStatus.textContent = error.message;
		}
	});

	unitList.addEventListener("submit", (event) => {
		const form = event.target.closest("form[data-unit-id]");
		if (!form) return;
		event.preventDefault();
		const name = form.elements.name.value.trim();
		if (!name) return;
		try {
			window.VideotecaStore.renameUnit(form.dataset.unitId, name);
			renderCourse("Unidad renombrada.");
		} catch (error) {
			courseSaveStatus.textContent = error.message;
		}
	});

	unitList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-delete-unit-id]");
		if (!button) return;
		const unit = window.VideotecaStore.getUnits().find((item) => item.id === button.dataset.deleteUnitId);
		const resourcesToMove = Object.values(window.VideotecaStore.get().resources)
			.filter((resource) => resource.unitId === button.dataset.deleteUnitId).length;
		const message = resourcesToMove
			? `¿Eliminar ${unit.name}? Sus ${resourcesToMove} recursos pasarán a la Unidad principal.`
			: `¿Eliminar la unidad ${unit.name}?`;
		if (!window.confirm(message)) return;
		window.VideotecaStore.deleteUnit(button.dataset.deleteUnitId);
		renderCourse(resourcesToMove
			? `${unit.name} eliminada. ${resourcesToMove} recursos movidos a la Unidad principal.`
			: `${unit.name} eliminada.`);
	});

	document.querySelector("#add-resource-button").addEventListener("click", () => {
		window.location.href = `recurso.html?asignatura=${encodeURIComponent(window.VideotecaStore.getAssignmentId())}&nuevo=1`;
	});

	commentInput.addEventListener("input", () => updateCommentDraft(commentInput));
	commentForm.addEventListener("click", (event) => {
		const option = event.target.closest("[data-resource-mention-option]");
		if (!option) return;
		insertResourceMention(commentInput, option.dataset.resourceMentionOption);
		option.closest("details").open = false;
	});
	commentList.addEventListener("input", (event) => {
		const textarea = event.target.closest(".comment-reply-form textarea");
		if (textarea) updateCommentDraft(textarea);
	});

	commentList.addEventListener("click", (event) => {
		const mentionOption = event.target.closest("[data-resource-mention-option]");
		if (mentionOption) {
			const textarea = mentionOption.closest("form").querySelector("textarea");
			insertResourceMention(textarea, mentionOption.dataset.resourceMentionOption);
			mentionOption.closest("details").open = false;
			return;
		}
		const mention = event.target.closest("[data-resource-mention-id]");
		if (mention) {
			const card = [...resourceGrid.querySelectorAll("[data-resource-card-id]")]
				.find((item) => item.dataset.resourceCardId === mention.dataset.resourceMentionId);
			if (!card) {
				courseSaveStatus.textContent = "El recurso mencionado ya no está disponible en la página.";
				return;
			}
			card.scrollIntoView({ behavior: "smooth", block: "center" });
			card.classList.remove("resource-mentioned");
			void card.offsetWidth;
			card.classList.add("resource-mentioned");
			window.setTimeout(() => card.classList.remove("resource-mentioned"), 2600);
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
		window.VideotecaStore.deleteComment("course", removeButton.dataset.commentId);
		renderComments();
	});

	commentList.addEventListener("submit", (event) => {
		const form = event.target.closest("[data-reply-form-for]");
		if (!form) return;
		event.preventDefault();
		const textarea = form.elements.reply;
		const text = textarea.value.trim();
		if (!text) return;
		const draft = getCommentDraft(textarea);
		window.VideotecaStore.addComment("course", {
			parentId: form.dataset.replyFormFor,
			author: "Tú",
			initials: "T",
			date: "Ahora",
			text,
			resourceMentions: draft.mentions
		});
		renderComments();
		courseSaveStatus.textContent = "Respuesta publicada.";
	});

	commentForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = commentInput.value.trim();
		if (!text) return;
		createComment(text, getCommentDraft(commentInput).mentions);
		commentInput.focus();
	});

	renderCourse();
	renderComments();
})();
