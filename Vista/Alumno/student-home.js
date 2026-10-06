import "../Profesor/editor-store.js";

await window.VideotecaStoreReady;

// Conecta la selección del acordeón con los datos publicados y las tarjetas de clase.
const store = window.VideotecaStore;
const assignmentList = document.querySelector("#student-assignment-list");
const courseTitle = document.querySelector("#student-course-title");
const courseContent = document.querySelector("#student-course-content");
const status = document.querySelector("#student-status");
let assignments = [];

function resourceUrl(assignmentId, resourceId) {
	return `Vista/Profesor/recurso.html?asignatura=${encodeURIComponent(assignmentId)}&recurso=${encodeURIComponent(resourceId)}`;
}

function renderAssignmentTree(assignment, selectedId, assignmentData) {
	// El árbol lateral representa asignatura > unidad > recurso con elementos nativos <details>.
	assignmentList.replaceChildren();
	assignments.forEach((item) => {
		const assignmentDetails = document.createElement("details");
		assignmentDetails.className = "student-assignment";
		assignmentDetails.open = item.id === selectedId;
		const assignmentSummary = document.createElement("summary");
		assignmentSummary.textContent = item.title || "Asignatura sin nombre";
		assignmentDetails.append(assignmentSummary);

		const assignmentContent = assignmentData.get(item.id);
		if (!assignmentContent) {
			const unavailable = document.createElement("p");
			unavailable.className = "student-empty";
			unavailable.textContent = "No se pudieron cargar sus clases.";
			assignmentDetails.append(unavailable);
			assignmentList.append(assignmentDetails);
			return;
		}

		const visibleResources = Object.entries(assignmentContent.resources)
			.filter(([, resource]) => !resource.isHidden && !resource.isDraft);
		const firstPopulatedUnit = assignmentContent.course.units.find((unit) =>
			visibleResources.some(([, resource]) => resource.unitId === unit.id)
		)?.id;
		assignmentContent.course.units.forEach((unit) => {
			const unitResources = visibleResources.filter(([, resource]) => resource.unitId === unit.id);
			const unitDetails = document.createElement("details");
			unitDetails.className = "student-unit-tree";
			unitDetails.open = item.id === selectedId && unit.id === firstPopulatedUnit;
			const unitSummary = document.createElement("summary");
			const unitName = document.createElement("span");
			unitName.textContent = unit.name;
			const unitCount = document.createElement("span");
			unitCount.textContent = `${unitResources.length} ${unitResources.length === 1 ? "clase" : "clases"}`;
			unitSummary.append(unitName, unitCount);
			const resourceList = document.createElement("div");
			resourceList.className = "student-resource-list";
			if (!unitResources.length) {
				const empty = document.createElement("p");
				empty.className = "student-empty";
				empty.textContent = "Sin clases";
				resourceList.append(empty);
			}
			unitResources.forEach(([resourceId, resource]) => {
				const link = document.createElement("a");
				link.className = "student-resource-link";
				link.href = resourceUrl(item.id, resourceId);
				link.textContent = resource.title || "Recurso sin título";
				resourceList.append(link);
			});
			unitDetails.append(unitSummary, resourceList);
			assignmentDetails.append(unitDetails);
		});
		assignmentList.append(assignmentDetails);
	});
}

function renderAssignment(assignment, selectedId, assignmentData) {
	renderAssignmentTree(assignment, selectedId, assignmentData);
	courseTitle.textContent = assignment.course.title;
	courseContent.replaceChildren();
	const visibleResources = Object.entries(assignment.resources).filter(([, resource]) => !resource.isHidden && !resource.isDraft);
	const classesTitle = document.createElement("h2");
	classesTitle.className = "student-classes-title";
	classesTitle.textContent = "Clases disponibles";
	courseContent.append(classesTitle);
	assignment.course.units.forEach((unit) => {
		const resources = visibleResources.filter(([, resource]) => resource.unitId === unit.id);
		if (!resources.length) return;
		const section = document.createElement("section");
		section.className = "student-unit";
		const heading = document.createElement("header");
		heading.className = "student-unit-heading";
		const title = document.createElement("h3");
		title.textContent = unit.name;
		const count = document.createElement("span");
		count.textContent = `${resources.length} ${resources.length === 1 ? "clase" : "clases"}`;
		heading.append(title, count);
		const grid = document.createElement("div");
		grid.className = "student-resource-grid";
		resources.forEach(([resourceId, resource]) => {
			const card = document.createElement("a");
			card.className = "student-resource-card";
			card.href = resourceUrl(assignment.id, resourceId);
			const image = document.createElement("img");
			image.src = resource.thumbnailUrl || "";
			image.alt = `Miniatura de ${resource.title}`;
			const content = document.createElement("div");
			content.className = "student-resource-content";
			const resourceTitle = document.createElement("h3");
			resourceTitle.textContent = resource.title || "Recurso sin título";
			const details = document.createElement("p");
			details.textContent = `${resource.duration || "Video"} · ${resource.materials?.length || 0} materiales`;
			content.append(resourceTitle, details);
			card.append(image, content);
			grid.append(card);
		});
		section.append(heading, grid);
		courseContent.append(section);
	});
	status.textContent = visibleResources.length ? "Selecciona una clase para abrirla." : "Esta asignatura aún no tiene clases publicadas.";
}

try {
	assignments = await store.getAssignments();
	if (!assignments.length) {
		status.textContent = "Todavía no hay asignaturas publicadas.";
	} else {
		const requestedId = new URLSearchParams(window.location.search).get("asignatura");
		const selected = assignments.find((item) => item.id === requestedId) || assignments[0];
		// Carga las unidades de las demás asignaturas para construir el árbol lateral.
		const assignmentData = new Map(await Promise.all(assignments.map(async (item) => {
			try {
				return [item.id, await store.getStudentAssignment(item.id)];
			} catch (error) {
				console.error(`No se pudieron cargar las clases de ${item.title || item.id}.`, error);
				return [item.id, null];
			}
		})));
		const assignment = assignmentData.get(selected.id);
		if (!assignment) {
			status.textContent = "No se pudo cargar esta asignatura.";
		} else {
			renderAssignment({ ...selected, ...assignment }, selected.id, assignmentData);
		}
	}
} catch (error) {
	status.textContent = "No se pudieron cargar las asignaturas. Comprueba tu sesión y la conexión.";
	console.error(error);
}

document.querySelector("#btn-logout").addEventListener("click", async () => {
	const { auth } = await import("../../firebase-config.js");
	const { signOut } = await import("firebase/auth");
	await signOut(auth);
	window.location.href = "login.html";
});
