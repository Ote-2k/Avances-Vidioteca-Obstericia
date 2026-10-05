import "../Profesor/editor-store.js";

await window.VideotecaStoreReady;

const store = window.VideotecaStore;
const assignmentList = document.querySelector("#student-assignment-list");
const courseTitle = document.querySelector("#student-course-title");
const courseContent = document.querySelector("#student-course-content");
const status = document.querySelector("#student-status");
let assignments = [];

function renderAssignment(assignment, selectedId) {
	assignmentList.replaceChildren();
	assignments.forEach((item) => {
		const link = document.createElement("a");
		link.className = "student-assignment-link";
		link.href = `?asignatura=${encodeURIComponent(item.id)}`;
		link.textContent = item.title || "Asignatura sin nombre";
		link.setAttribute("aria-current", String(item.id === selectedId));
		assignmentList.append(link);
	});

	courseTitle.textContent = assignment.course.title;
	courseContent.replaceChildren();
	const visibleResources = Object.entries(assignment.resources).filter(([, resource]) => !resource.isHidden && !resource.isDraft);
	assignment.course.units.forEach((unit) => {
		const section = document.createElement("section");
		section.className = "student-unit";
		const heading = document.createElement("h2");
		heading.textContent = unit.name;
		const grid = document.createElement("div");
		grid.className = "student-resource-grid";
		const resources = visibleResources.filter(([, resource]) => resource.unitId === unit.id);
		if (!resources.length) {
			const empty = document.createElement("p");
			empty.className = "student-empty";
			empty.textContent = "Aún no hay recursos en esta unidad.";
			section.append(heading, empty);
		} else {
			resources.forEach(([resourceId, resource]) => {
				const card = document.createElement("a");
				card.className = "student-resource-card";
				card.href = `Vista/Profesor/recurso.html?asignatura=${encodeURIComponent(assignment.id)}&recurso=${encodeURIComponent(resourceId)}`;
				const image = document.createElement("img");
				image.src = resource.thumbnailUrl || "";
				image.alt = `Miniatura de ${resource.title}`;
				const content = document.createElement("div");
				content.className = "student-resource-content";
				const title = document.createElement("h3");
				title.textContent = resource.title;
				const details = document.createElement("p");
				details.textContent = `${resource.duration || "Video"} · ${resource.materials?.length || 0} materiales`;
				content.append(title, details);
				card.append(image, content);
				grid.append(card);
			});
			section.append(heading, grid);
		}
		courseContent.append(section);
	});
	status.textContent = `${visibleResources.length} ${visibleResources.length === 1 ? "recurso disponible" : "recursos disponibles"}`;
}

try {
	assignments = await store.getAssignments();
	if (!assignments.length) {
		status.textContent = "Todavía no hay asignaturas publicadas.";
	} else {
		const requestedId = new URLSearchParams(window.location.search).get("asignatura");
		const selected = assignments.find((item) => item.id === requestedId) || assignments[0];
		const assignment = await store.getStudentAssignment(selected.id);
		if (!assignment) {
			status.textContent = "No se pudo cargar esta asignatura.";
		} else {
			renderAssignment({ ...selected, ...assignment }, selected.id);
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
