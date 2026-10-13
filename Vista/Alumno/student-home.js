import "../Profesor/editor-store.js";
import { auth, db } from "../../firebase-config.js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";

await window.VideotecaStoreReady;

const store = window.VideotecaStore;
const assignmentList = document.querySelector("#student-assignment-list");
const courseTitle = document.querySelector("#student-course-title");
const courseContent = document.querySelector("#student-course-content");
const status = document.querySelector("#student-status");
const videoPagination = document.querySelector("#video-pagination");

// Pestañas laterales
const tabCourses = document.querySelector("#tab-courses");
const tabComments = document.querySelector("#tab-comments");
const sidebarCoursesView = document.querySelector("#sidebar-courses-view");
const sidebarCommentsView = document.querySelector("#sidebar-comments-view");
const studentCommentsList = document.querySelector("#student-comments-list");
const commentsPagination = document.querySelector("#comments-pagination");

let assignments = [];
let currentAssignmentDataGlobal = null;
let selectedAssignmentId = null;

// Variables de Paginación (10 items por página)
const ITEMS_PER_PAGE = 10;
let currentVideoPage = 1;
let currentCommentPage = 1;
let userCommentsGlobal = [];

function resourceUrl(assignmentId, resourceId) {
	return `Vista/Profesor/recurso.html?asignatura=${encodeURIComponent(assignmentId)}&recurso=${encodeURIComponent(resourceId)}`;
}

// --------------------------------------------------------------------------
// LÓGICA DE PESTAÑAS LATERALES
// --------------------------------------------------------------------------
if (tabCourses && tabComments) {
	tabCourses.addEventListener("click", () => {
		tabCourses.classList.add("active");
		tabComments.classList.remove("active");
		sidebarCoursesView.removeAttribute("hidden");
		sidebarCommentsView.setAttribute("hidden", "true");
	});

	tabComments.addEventListener("click", async () => {
		tabComments.classList.add("active");
		tabCourses.classList.remove("active");
		sidebarCommentsView.removeAttribute("hidden");
		sidebarCoursesView.setAttribute("hidden", "true");
		await loadSidebarComments();
	});
}

// --------------------------------------------------------------------------
// RENDERIZAR ÁRBOL LATERAL DE ASIGNATURAS
// --------------------------------------------------------------------------
function renderAssignmentTree(selectedId, assignmentData) {
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

// --------------------------------------------------------------------------
// RENDERIZAR ASIGNATURA Y VIDEOS (PAGINADOS DE 10 EN 10)
// --------------------------------------------------------------------------
function renderAssignment(assignment, selectedId, assignmentData) {
	currentAssignmentDataGlobal = assignment;
	selectedAssignmentId = selectedId;
	renderAssignmentTree(selectedId, assignmentData);

	courseTitle.textContent = assignment.course.title;
	courseContent.replaceChildren();

	const visibleResources = Object.entries(assignment.resources).filter(([, resource]) => !resource.isHidden && !resource.isDraft);
	
	if (!visibleResources.length) {
		status.textContent = "Esta asignatura aún no tiene clases publicadas.";
		videoPagination.replaceChildren();
		return;
	}

	status.textContent = "Selecciona una clase para abrirla.";

	// PAGINACIÓN: Obtener solo los 10 videos de la página actual
	const totalPages = Math.ceil(visibleResources.length / ITEMS_PER_PAGE);
	if (currentVideoPage > totalPages) currentVideoPage = 1;

	const startIndex = (currentVideoPage - 1) * ITEMS_PER_PAGE;
	const paginatedResources = visibleResources.slice(startIndex, startIndex + ITEMS_PER_PAGE);

	const classesTitle = document.createElement("h2");
	classesTitle.className = "student-classes-title";
	classesTitle.textContent = `Clases disponibles (${visibleResources.length} en total)`;
	courseContent.append(classesTitle);

	assignment.course.units.forEach((unit) => {
		// Filtrar recursos paginados correspondientes a esta unidad
		const resources = paginatedResources.filter(([, resource]) => resource.unitId === unit.id);
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

	// Renderizar botones de paginación para videos
	renderVideoPaginationControls(totalPages, assignmentData);
}

function renderVideoPaginationControls(totalPages, assignmentData) {
	videoPagination.replaceChildren();
	if (totalPages <= 1) return;

	const btnPrev = document.createElement("button");
	btnPrev.className = "pagination-btn";
	btnPrev.textContent = "« Anterior";
	btnPrev.disabled = currentVideoPage === 1;
	btnPrev.addEventListener("click", () => {
		currentVideoPage--;
		renderAssignment(currentAssignmentDataGlobal, selectedAssignmentId, assignmentData);
	});

	const info = document.createElement("span");
	info.className = "pagination-info";
	info.textContent = `Página ${currentVideoPage} de ${totalPages}`;

	const btnNext = document.createElement("button");
	btnNext.className = "pagination-btn";
	btnNext.textContent = "Siguiente »";
	btnNext.disabled = currentVideoPage === totalPages;
	btnNext.addEventListener("click", () => {
		currentVideoPage++;
		renderAssignment(currentAssignmentDataGlobal, selectedAssignmentId, assignmentData);
	});

	videoPagination.append(btnPrev, info, btnNext);
}

// --------------------------------------------------------------------------
// COMENTARIOS EN BARRA LATERAL (PAGINADOS DE 10 EN 10)
// --------------------------------------------------------------------------
async function loadSidebarComments() {
	const currentUser = auth.currentUser;
	if (!currentUser) return;

	studentCommentsList.innerHTML = '<p class="student-status">Buscando tus comentarios...</p>';
	userCommentsGlobal = [];

	try {
		for (const item of assignments) {
			const assignmentContent = await store.getStudentAssignment(item.id);
			if (!assignmentContent || !assignmentContent.resources) continue;

			Object.entries(assignmentContent.resources).forEach(([resourceId, resource]) => {
				if (!resource.comments || !Array.isArray(resource.comments)) return;

				resource.comments.forEach((comment, index) => {
					if (comment.authorUid === currentUser.uid) {
						const replies = resource.comments.filter(r => r.replyToId === comment.id || r.parentIndex === index);
						userCommentsGlobal.push({
							assignmentId: item.id,
							resourceId: resourceId,
							resourceTitle: resource.title || "Clase sin título",
							text: comment.text || comment.content,
							date: comment.createdAt ? new Date(comment.createdAt).toLocaleDateString("es-CL") : "Reciente",
							replies: replies
						});
					}
				});
			});
		}

		renderPaginatedComments();
	} catch (err) {
		console.error("Error al cargar comentarios:", err);
		studentCommentsList.innerHTML = '<p class="student-empty">Error al cargar comentarios.</p>';
	}
}

function renderPaginatedComments() {
	studentCommentsList.replaceChildren();
	commentsPagination.replaceChildren();

	if (!userCommentsGlobal.length) {
		studentCommentsList.innerHTML = '<p class="student-empty">Aún no tienes comentarios registrados.</p>';
		return;
	}

	const totalPages = Math.ceil(userCommentsGlobal.length / ITEMS_PER_PAGE);
	if (currentCommentPage > totalPages) currentCommentPage = 1;

	const startIndex = (currentCommentPage - 1) * ITEMS_PER_PAGE;
	const paginatedComments = userCommentsGlobal.slice(startIndex, startIndex + ITEMS_PER_PAGE);

	paginatedComments.forEach((item) => {
		const card = document.createElement("div");
		card.className = "sidebar-comment-card";

		const link = document.createElement("a");
		link.href = resourceUrl(item.assignmentId, item.resourceId);
		link.textContent = item.resourceTitle;

		const text = document.createElement("p");
		text.textContent = `"${item.text}"`;

		card.append(link, text);

		if (item.replies && item.replies.length > 0) {
			item.replies.forEach(reply => {
				const replyBox = document.createElement("div");
				replyBox.className = "comment-reply";
				replyBox.textContent = `Profesor: ${reply.text || reply.content}`;
				card.append(replyBox);
			});
		}

		studentCommentsList.append(card);
	});

	// Paginador para la barra lateral de comentarios
	if (totalPages > 1) {
		const btnPrev = document.createElement("button");
		btnPrev.className = "pagination-btn";
		btnPrev.textContent = "«";
		btnPrev.disabled = currentCommentPage === 1;
		btnPrev.addEventListener("click", () => {
			currentCommentPage--;
			renderPaginatedComments();
		});

		const info = document.createElement("span");
		info.className = "pagination-info";
		info.textContent = `${currentCommentPage}/${totalPages}`;

		const btnNext = document.createElement("button");
		btnNext.className = "pagination-btn";
		btnNext.textContent = "»";
		btnNext.disabled = currentCommentPage === totalPages;
		btnNext.addEventListener("click", () => {
			currentCommentPage++;
			renderPaginatedComments();
		});

		commentsPagination.append(btnPrev, info, btnNext);
	}
}

// --------------------------------------------------------------------------
// INICIALIZACIÓN Y AUTENTICACIÓN
// --------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
	if (!user) {
		window.location.href = "login.html";
		return;
	}

	const userNameElement = document.querySelector("#student-user-name");
	if (userNameElement) {
		userNameElement.textContent = user.displayName || user.email.split("@")[0];
	}

	try {
		const userEmail = user.email.toLowerCase();
		const allAssignments = await store.getAssignments();

		assignments = allAssignments.filter((item) => {
			if (!item.estudiantesInscritos || !Array.isArray(item.estudiantesInscritos)) {
				return true;
			}
			return item.estudiantesInscritos.map((e) => e.toLowerCase()).includes(userEmail);
		});

		if (!assignments.length) {
			status.textContent = "No tienes asignaturas inscritas o disponibles actualmente.";
			courseTitle.textContent = "Sin Asignaturas";
			courseContent.replaceChildren();
			assignmentList.replaceChildren();
			return;
		}

		const requestedId = new URLSearchParams(window.location.search).get("asignatura");
		const selected = assignments.find((item) => item.id === requestedId) || assignments[0];

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
	} catch (error) {
		status.textContent = "No se pudieron cargar las asignaturas. Comprueba tu sesión y la conexión.";
		console.error("Error al obtener asignaturas:", error);
	}

	// Escuchar notificaciones en tiempo real
	initNotificationsListener(user.uid);
});

// --------------------------------------------------------------------------
// NOTIFICACIONES
// --------------------------------------------------------------------------
function initNotificationsListener(userUid) {
	const btnNotif = document.querySelector("#btn-notifications");
	const notifDropdown = document.querySelector("#notif-dropdown");
	const notifBadge = document.querySelector("#notif-badge");
	const notifList = document.querySelector("#notif-list");
	const btnMarkAllRead = document.querySelector("#btn-mark-all-read");
	let currentUnreadDocs = [];

	if (btnNotif) {
		btnNotif.addEventListener("click", () => {
			if (notifDropdown.hasAttribute("hidden")) {
				notifDropdown.removeAttribute("hidden");
			} else {
				notifDropdown.setAttribute("hidden", "true");
			}
		});
	}

	const notifQuery = query(
		collection(db, "notificaciones"),
		where("usuarioUid", "==", userUid)
	);

	onSnapshot(notifQuery, (snapshot) => {
		const notifs = [];
		currentUnreadDocs = [];

		snapshot.forEach((docSnap) => {
			const data = docSnap.data();
			notifs.push({ id: docSnap.id, ...data });
			if (!data.leido) currentUnreadDocs.push(docSnap.id);
		});

		notifs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

		if (currentUnreadDocs.length > 0) {
			notifBadge.textContent = currentUnreadDocs.length;
			notifBadge.removeAttribute("hidden");
		} else {
			notifBadge.setAttribute("hidden", "true");
		}

		if (!notifs.length) {
			notifList.innerHTML = '<p class="student-status" style="padding: 12px;">No tienes notificaciones.</p>';
			return;
		}

		notifList.replaceChildren();
		notifs.forEach((item) => {
			const card = document.createElement("a");
			card.className = `notif-item ${item.leido ? "" : "unread"}`;
			card.href = item.link || "#";

			card.addEventListener("click", async () => {
				if (!item.leido) {
					try {
						await updateDoc(doc(db, "notificaciones", item.id), { leido: true });
					} catch (err) {
						console.error("Error al marcar leída:", err);
					}
				}
			});

			const title = document.createElement("p");
			title.className = "notif-item-title";
			title.textContent = item.titulo || "Notificación";

			const msg = document.createElement("p");
			msg.className = "notif-item-msg";
			msg.textContent = item.mensaje || "";

			card.append(title, msg);
			notifList.append(card);
		});
	});

	if (btnMarkAllRead) {
		btnMarkAllRead.addEventListener("click", async () => {
			if (!currentUnreadDocs.length) return;
			try {
				const batch = writeBatch(db);
				currentUnreadDocs.forEach((id) => {
					batch.update(doc(db, "notificaciones", id), { leido: true });
				});
				await batch.commit();
			} catch (err) {
				console.error("Error al marcar todas leídas:", err);
			}
		});
	}
}

// Cerrar sesión
document.querySelector("#btn-logout").addEventListener("click", async () => {
	const { signOut } = await import("firebase/auth");
	await signOut(auth);
	window.location.href = "login.html";
});