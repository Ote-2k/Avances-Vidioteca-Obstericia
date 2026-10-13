import {
	addDoc,
	arrayUnion,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	updateDoc,
	where,
	writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import type { CourseComment, CourseSummary, CourseUnit, ResourceSummary, UserRole } from "../types";

export interface CourseView extends CourseSummary {
	units: CourseUnit[];
	comments: CourseComment[];
	resources: ResourceSummary[];
}

const assignments = collection(db, "asignaturas");

function normalizeResource(id: string, data: Record<string, unknown>): ResourceSummary {
	return {
		id,
		title: String(data.title || "Recurso sin título"),
		description: String(data.description || ""),
		thumbnailUrl: String(data.thumbnailUrl || ""),
		duration: String(data.duration || ""),
		unitId: String(data.unitId || "unidad-principal"),
		unit: String(data.unit || "Unidad principal"),
		isHidden: data.isHidden === true,
		isDraft: data.isDraft === true,
		videoUrl: typeof data.videoUrl === "string" ? data.videoUrl : undefined,
		videoLocalKey: typeof data.videoLocalKey === "string" ? data.videoLocalKey : undefined,
		trimStart: typeof data.trimStart === "number" ? data.trimStart : 0,
		trimEnd: typeof data.trimEnd === "number" ? data.trimEnd : null,
		materials: Array.isArray(data.materials) ? data.materials as ResourceSummary["materials"] : [],
		popups: Array.isArray(data.popups) ? data.popups as ResourceSummary["popups"] : []
	};
}

export async function listAssignments(role: UserRole, uid: string, email = ""): Promise<CourseSummary[]> {
	const normalizedEmail = email.trim().toLowerCase();
	if (role === "alumno" && !normalizedEmail) return [];
	const assignmentsQuery = role === "alumno"
		? query(assignments, where("published", "==", true), where("estudiantesInscritos", "array-contains", normalizedEmail))
		: query(assignments, where("ownerUid", "==", uid));
	const snapshot = await getDocs(assignmentsQuery);
	return snapshot.docs.map((item) => {
		const data = item.data();
		return {
			id: item.id,
			title: String(data.course?.title || "Asignatura sin nombre"),
			description: String(data.course?.description || ""),
			coverUrl: String(data.course?.coverUrl || ""),
			ownerUid: data.ownerUid,
			published: data.published === true,
			estudiantesInscritos: Array.isArray(data.estudiantesInscritos) ? data.estudiantesInscritos : undefined
		};
	}).filter((assignment) => role !== "alumno"
		|| assignment.estudiantesInscritos?.some((studentEmail) => studentEmail.toLowerCase() === normalizedEmail));
}

export async function getCourse(assignmentId: string, role: UserRole, email = ""): Promise<CourseView | null> {
	const assignmentRef = doc(db, "asignaturas", assignmentId);
	const snapshot = await getDoc(assignmentRef);
	if (!snapshot.exists()) return null;
	const saved = snapshot.data();
	const enrolledEmails = Array.isArray(saved.estudiantesInscritos) ? saved.estudiantesInscritos as string[] : [];
	if (role === "alumno" && (saved.published !== true || !enrolledEmails.some((studentEmail) => studentEmail.toLowerCase() === email.trim().toLowerCase()))) return null;
	const resourceCollection = collection(assignmentRef, "recursos");
	const resourceSnapshot = await getDocs(role === "alumno"
		? query(resourceCollection, where("isHidden", "==", false))
		: resourceCollection);
	const units = Array.isArray(saved.course?.units) ? saved.course.units as CourseUnit[] : [{ id: "unidad-principal", name: "Unidad principal" }];
	const resources = resourceSnapshot.docs
		.map((item) => normalizeResource(item.id, item.data()))
		.filter((item) => role !== "alumno" || (!item.isHidden && !item.isDraft));
	return {
		id: snapshot.id,
		title: String(saved.course?.title || "Asignatura sin nombre"),
		description: String(saved.course?.description || ""),
		coverUrl: String(saved.course?.coverUrl || ""),
		ownerUid: saved.ownerUid,
		published: saved.published === true,
		estudiantesInscritos: enrolledEmails,
		units,
		comments: Array.isArray(saved.comments?.course) ? saved.comments.course as CourseComment[] : [],
		resources
	};
}

export async function createAssignment(title: string, uid: string): Promise<string> {
	const created = await addDoc(assignments, {
		course: { title, description: "", coverUrl: "", units: [{ id: "unidad-principal", name: "Unidad principal" }] },
		comments: { course: [] },
		ownerUid: uid,
		published: true,
		createdAt: serverTimestamp()
	});
	return created.id;
}

export async function renameAssignment(id: string, title: string): Promise<void> {
	await updateDoc(doc(db, "asignaturas", id), { "course.title": title, updatedAt: serverTimestamp() });
}

export async function deleteAssignment(id: string): Promise<void> {
	const resourceSnapshot = await getDocs(collection(db, "asignaturas", id, "recursos"));
	for (let offset = 0; offset < resourceSnapshot.docs.length; offset += 450) {
		const batch = writeBatch(db);
		resourceSnapshot.docs.slice(offset, offset + 450).forEach((resource) => batch.delete(resource.ref));
		await batch.commit();
	}
	await deleteDoc(doc(db, "asignaturas", id));
}

export async function createResource(assignmentId: string, unit: CourseUnit, title: string): Promise<string> {
	const created = await addDoc(collection(db, "asignaturas", assignmentId, "recursos"), {
		title,
		description: "",
		unitId: unit.id,
		unit: unit.name,
		isHidden: true,
		isDraft: true,
		materials: [],
		popups: [],
		comments: []
	});
	return created.id;
}

export async function getResource(assignmentId: string, resourceId: string, role: UserRole): Promise<ResourceSummary | null> {
	const resourceRef = doc(db, "asignaturas", assignmentId, "recursos", resourceId);
	const snapshot = await getDoc(resourceRef);
	if (!snapshot.exists()) return null;
	const resource = normalizeResource(snapshot.id, snapshot.data());
	if (role === "alumno" && (resource.isHidden || resource.isDraft)) return null;
	return resource;
}

export async function updateResource(assignmentId: string, resourceId: string, changes: Partial<ResourceSummary>): Promise<void> {
	await updateDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId), changes);
}

export async function deleteResource(assignmentId: string, resourceId: string): Promise<void> {
	await deleteDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId));
}

export async function addCourseComment(assignmentId: string, comment: CourseComment): Promise<void> {
	const assignmentRef = doc(db, "asignaturas", assignmentId);
	await updateDoc(assignmentRef, { "comments.course": arrayUnion(comment), updatedAt: serverTimestamp() });
}

export async function addResourceComment(assignmentId: string, resourceId: string, comment: CourseComment): Promise<void> {
	const resourceRef = doc(db, "asignaturas", assignmentId, "recursos", resourceId);
	await updateDoc(resourceRef, { comments: arrayUnion(comment), updatedAt: serverTimestamp() });
}

export async function getResourceComments(assignmentId: string, resourceId: string): Promise<CourseComment[]> {
	const snapshot = await getDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId));
	const comments = snapshot.data()?.comments;
	return Array.isArray(comments) ? comments as CourseComment[] : [];
}

export async function updateCourse(assignmentId: string, changes: { title?: string; description?: string; units?: CourseUnit[] }): Promise<void> {
	const updates = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`course.${key}`, value]));
	await updateDoc(doc(db, "asignaturas", assignmentId), { ...updates, updatedAt: serverTimestamp() });
}

export async function updateCourseStudents(assignmentId: string, emails: string[]): Promise<void> {
	await updateDoc(doc(db, "asignaturas", assignmentId), {
		estudiantesInscritos: [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))],
		updatedAt: serverTimestamp()
	});
}