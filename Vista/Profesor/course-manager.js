import "./editor-store.js";

await window.VideotecaStoreReady;
const store = window.VideotecaStore;
const createForm = document.querySelector("#assignment-create-form");
const assignmentList = document.querySelector("#assignment-management-list");
const assignmentCount = document.querySelector("#assignment-count");
const assignmentStatus = document.querySelector("#assignment-status");
if (!store.getCloudStatus()) {
	assignmentStatus.textContent = "Inicia sesión con una cuenta Firebase y habilita Firestore para gestionar asignaturas.";
} else {
	assignmentStatus.textContent = "Asignaturas sincronizadas con Firebase.";
}

function assignmentUrl(id) {
	return `asignatura-1.html?asignatura=${encodeURIComponent(id)}`;
}

async function renderAssignments() {
	const assignments = await store.getAssignments();
	assignmentList.replaceChildren();
	assignmentCount.textContent = `${assignments.length} ${assignments.length === 1 ? "asignatura" : "asignaturas"}`;
	if (!assignments.length) {
		const empty = document.createElement("p");
		empty.className = "assignment-empty";
		empty.textContent = "Todavía no hay asignaturas.";
		assignmentList.append(empty);
		return;
	}
	assignments.forEach((assignment) => {
		const row = document.createElement("article");
		row.className = "assignment-row";
		const link = document.createElement("a");
		link.href = assignmentUrl(assignment.id);
		link.textContent = assignment.title || "Asignatura sin nombre";
		const form = document.createElement("form");
		form.dataset.assignmentId = assignment.id;
		const input = document.createElement("input");
		input.name = "title";
		input.value = assignment.title || "";
		input.maxLength = 80;
		input.required = true;
		input.setAttribute("aria-label", `Nuevo nombre para ${assignment.title || "la asignatura"}`);
		const button = document.createElement("button");
		button.type = "submit";
		button.textContent = "Cambiar nombre";
		form.append(input, button);
		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "assignment-delete";
		deleteButton.dataset.assignmentId = assignment.id;
		deleteButton.setAttribute("aria-label", `Eliminar ${assignment.title || "asignatura sin nombre"}`);
		deleteButton.textContent = "Eliminar";
		row.append(link, form, deleteButton);
		assignmentList.append(row);
	});
}

createForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const title = createForm.elements.title.value.trim();
	if (!title) return;
	const button = createForm.querySelector("button");
	button.disabled = true;
	assignmentStatus.textContent = "Creando asignatura...";
	try {
		const id = await store.createAssignment(title);
		window.location.href = assignmentUrl(id);
	} catch (error) {
		assignmentStatus.textContent = "No se pudo crear. Comprueba tu conexión, el inicio de sesión y las reglas de Firestore.";
		console.error(error);
		button.disabled = false;
	}
});

assignmentList.addEventListener("submit", async (event) => {
	const form = event.target.closest("form[data-assignment-id]");
	if (!form) return;
	event.preventDefault();
	const title = form.elements.title.value.trim();
	if (!title) return;
	const button = form.querySelector("button");
	button.disabled = true;
	try {
		await store.renameAssignment(form.dataset.assignmentId, title);
		assignmentStatus.textContent = "Nombre de asignatura actualizado.";
		await renderAssignments();
	} catch (error) {
		assignmentStatus.textContent = "No se pudo cambiar el nombre. Comprueba tu conexión y las reglas de Firestore.";
		console.error(error);
		button.disabled = false;
	}
});

assignmentList.addEventListener("click", async (event) => {
	const button = event.target.closest("button.assignment-delete");
	if (!button) return;
	const row = button.closest(".assignment-row");
	const title = row.querySelector("a").textContent;
	if (!window.confirm(`¿Eliminar "${title}" y todos sus recursos? Esta acción no se puede deshacer.`)) return;
	button.disabled = true;
	assignmentStatus.textContent = `Eliminando "${title}" y sus recursos...`;
	try {
		const deleted = await store.deleteAssignment(button.dataset.assignmentId);
		if (!deleted) {
			assignmentStatus.textContent = "La asignatura ya no existe.";
		} else {
			assignmentStatus.textContent = `Asignatura "${title}" eliminada.`;
		}
		await renderAssignments();
		await store.refreshAssignmentNavigation();
	} catch (error) {
		assignmentStatus.textContent = "No se pudo eliminar. Comprueba la conexión, el acceso y las reglas de Firestore.";
		console.error(error);
		button.disabled = false;
	}
});

renderAssignments().catch((error) => {
	assignmentStatus.textContent = "No se pudieron cargar las asignaturas desde Firebase.";
	console.error(error);
});
