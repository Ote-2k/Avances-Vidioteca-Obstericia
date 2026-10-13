import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import { useAuth } from "../context/AuthContext";
import { CommentThread } from "../components/CommentThread";
import { auth, db } from "../firebase";
import { addCourseComment, addResourceComment, createAssignment, createResource, deleteAssignment, deleteResource, getCourse, getResource, getResourceComments, listAssignments, renameAssignment, updateCourse, updateResource } from "../services/courses";
import type { CourseView } from "../services/courses";
import type { CourseComment, CourseSummary, ResourceMaterial, ResourcePopup, ResourceSummary } from "../types";

function WorkspaceLayout({ title, children }: React.PropsWithChildren<{ title: string }>) {
	const { profile, logout } = useAuth();
	return (
		<div className="workspace">
			<header className="app-header">
				<Link className="brand" to="/">Videoteca <span>UCEN</span></Link>
				<div className="header-actions">
					<span className="identity">{profile?.displayName} · {profile?.role}</span>
					<button className="button button-quiet" onClick={() => void logout()}>Cerrar sesión</button>
				</div>
			</header>
			<main className="workspace-main"><p className="eyebrow">{profile?.role}</p><h1>{title}</h1>{children}</main>
		</div>
	);
}

function MaterialLink({ material }: { material: ResourceMaterial }) {
	const [href, setHref] = useState(material.url || "");
	const [missing, setMissing] = useState(false);
	useEffect(() => {
		if (!material.localKey) {
			setHref(material.url || "");
			setMissing(false);
			return;
		}
		let active = true;
		let objectUrl = "";
		import("../services/materialFiles").then(({ getLocalMaterialUrl }) => getLocalMaterialUrl(material.localKey!)).then((url) => {
			objectUrl = url;
			if (active) setHref(url);
			else URL.revokeObjectURL(url);
		}).catch(() => { if (active) setMissing(true); });
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [material.localKey, material.url]);
	return <a className="material-link" href={href || undefined} target={material.localKey ? undefined : "_blank"} rel="noreferrer" download={material.localKey ? material.title : undefined}>
		<strong>{material.title}</strong>
		<span>{missing ? "Archivo no disponible en este navegador" : `${material.format}${material.description ? ` · ${material.description}` : ""}`}</span>
	</a>;
}

interface NotificationItem {
	id: string;
	title: string;
	message: string;
	link: string;
	read: boolean;
	date: number;
}

function NotificationCenter() {
	const { profile } = useAuth();
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState("");
	useEffect(() => {
		if (!profile) return;
		const notificationsQuery = query(collection(db, "notificaciones"), where("usuarioUid", "==", profile.uid));
		return onSnapshot(notificationsQuery, (snapshot) => {
			setItems(snapshot.docs.map((item) => {
				const data = item.data();
				const date = typeof data.fecha?.toDate === "function" ? data.fecha.toDate().getTime() : new Date(data.fecha || 0).getTime();
				return { id: item.id, title: String(data.titulo || "Notificación"), message: String(data.mensaje || ""), link: String(data.link || "#"), read: data.leido === true, date };
			}).sort((first, second) => second.date - first.date));
		}, (error) => { console.error(error); setStatus("No se pudieron cargar las notificaciones."); });
	}, [profile?.uid]);
	const unread = items.filter((item) => !item.read);
	async function markRead(item: NotificationItem) {
		if (item.read) return;
		try { await updateDoc(doc(db, "notificaciones", item.id), { leido: true }); }
		catch (error) { console.error(error); setStatus("No se pudo marcar como leída."); }
	}
	async function markAllRead() {
		if (!unread.length) return;
		try {
			const batch = writeBatch(db);
			unread.forEach((item) => batch.update(doc(db, "notificaciones", item.id), { leido: true }));
			await batch.commit();
		} catch (error) { console.error(error); setStatus("No se pudieron marcar todas como leídas."); }
	}
	return <section className="notification-center">
		<button className="button button-quiet" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Notificaciones{unread.length > 0 ? ` (${unread.length})` : ""}</button>
		{open && <div className="notification-panel"><header><strong>Notificaciones</strong><button className="text-button" type="button" onClick={() => void markAllRead()} disabled={!unread.length}>Marcar leídas</button></header>
			{status && <p className="status">{status}</p>}
			{items.length === 0 ? <p className="muted">No tienes notificaciones.</p> : items.map((item) => <a className={`notification-item${item.read ? "" : " is-unread"}`} href={item.link} key={item.id} onClick={() => void markRead(item)}><strong>{item.title}</strong><span>{item.message}</span></a>)}
		</div>}
	</section>;
}

export function StudentPage() {
	const { profile } = useAuth();
	const [courses, setCourses] = useState<CourseSummary[]>([]);
	const [status, setStatus] = useState("Cargando asignaturas...");
	useEffect(() => {
		if (!profile) return;
		listAssignments("alumno", profile.uid, profile.email).then((items) => {
			setCourses(items);
			setStatus(items.length ? "" : "No hay asignaturas publicadas.");
		}).catch((error: unknown) => {
			console.error(error);
			setStatus("No se pudieron cargar las asignaturas desde Firebase.");
		});
	}, [profile]);
	return <WorkspaceLayout title="Mis asignaturas">
		<NotificationCenter />
		{status && <p className="status" role="status">{status}</p>}
		<div className="course-grid">{courses.map((course) => <Link className="course-card" key={course.id} to={`/profesor/asignaturas/${course.id}`}>
			{course.coverUrl && <img src={course.coverUrl} alt="" />}
			<div><h2>{course.title}</h2><p>{course.description || "Recursos de la asignatura"}</p></div>
		</Link>)}</div>
	</WorkspaceLayout>;
}

export function ProfessorPage() {
	const { profile } = useAuth();
	const navigate = useNavigate();
	const [courses, setCourses] = useState<CourseSummary[]>([]);
	const [title, setTitle] = useState("");
	const [status, setStatus] = useState("Cargando asignaturas...");
	const [busy, setBusy] = useState(false);
	const refresh = async () => {
		if (!profile) return;
		const items = await listAssignments("profesor", profile.uid);
		setCourses(items);
		setStatus(items.length ? "" : "Todavía no tienes asignaturas.");
	};
	useEffect(() => { void refresh().catch(() => setStatus("No se pudieron cargar las asignaturas.")); }, [profile]);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!profile || !title.trim()) return;
		setBusy(true);
		try {
			const id = await createAssignment(title.trim(), profile.uid);
			setTitle("");
			await refresh();
			navigate(`/profesor/asignaturas/${id}`);
		} catch (error) {
			console.error(error);
			setStatus("No se pudo crear la asignatura. Revisa la conexión y las reglas de Firestore.");
		} finally { setBusy(false); }
	}
	async function rename(course: CourseSummary) {
		const nextTitle = window.prompt("Nuevo nombre de la asignatura", course.title)?.trim();
		if (!nextTitle) return;
		try { await renameAssignment(course.id, nextTitle); await refresh(); }
		catch (error) { console.error(error); setStatus("No se pudo cambiar el nombre."); }
	}
	async function remove(course: CourseSummary) {
		if (!window.confirm(`¿Eliminar “${course.title}” y sus recursos?`)) return;
		try { await deleteAssignment(course.id); await refresh(); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar la asignatura."); }
	}
	return <WorkspaceLayout title="Mis asignaturas">
		<form className="inline-form" onSubmit={submit}><label className="visually-hidden" htmlFor="new-course">Nueva asignatura</label><input id="new-course" maxLength={80} placeholder="Nombre de la asignatura" value={title} onChange={(event) => setTitle(event.target.value)} required /><button className="button button-primary" disabled={busy}>{busy ? "Creando..." : "Crear asignatura"}</button></form>
		{status && <p className="status" role="status">{status}</p>}
		<div className="management-list">{courses.map((course) => <article className="management-row" key={course.id}><Link to={`/profesor/asignaturas/${course.id}`}>{course.title}</Link><div><button className="button button-quiet" onClick={() => void rename(course)}>Renombrar</button><button className="button button-danger" onClick={() => void remove(course)}>Eliminar</button></div></article>)}</div>
	</WorkspaceLayout>;
}

export function CoursePage() {
	const { assignmentId } = useParams();
	const { profile } = useAuth();
	const [course, setCourse] = useState<CourseView | null>(null);
	const [status, setStatus] = useState("Cargando asignatura...");
	const [resourceTitle, setResourceTitle] = useState("");
	const [newUnit, setNewUnit] = useState("");
	const [commentText, setCommentText] = useState("");
	const [editTitle, setEditTitle] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const navigate = useNavigate();
	const isTeacher = profile?.role === "profesor";
	const load = async () => {
		if (!assignmentId || !profile) return;
		const loaded = await getCourse(assignmentId, profile.role);
		setCourse(loaded);
		setEditTitle(loaded?.title || "");
		setEditDescription(loaded?.description || "");
		setStatus(loaded ? "" : "No se encontró la asignatura o no está publicada.");
	};
	useEffect(() => { void load().catch((error: unknown) => { console.error(error); setStatus("No se pudo cargar la asignatura."); }); }, [assignmentId, profile]);
	async function createNewResource(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !course || !resourceTitle.trim()) return;
		try {
			const id = await createResource(assignmentId, course.units[0], resourceTitle.trim());
			await load();
			navigate(`/profesor/asignaturas/${assignmentId}/recursos/${id}`);
		} catch (error) { console.error(error); setStatus("No se pudo crear el recurso."); }
	}
	async function saveCourse(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId) return;
		try {
			await updateCourse(assignmentId, { title: editTitle.trim(), description: editDescription.trim() });
			await load();
			setStatus("Cambios guardados.");
		} catch (error) { console.error(error); setStatus("No se pudieron guardar los cambios."); }
	}
	async function addUnit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !course || !newUnit.trim()) return;
		const units = [...course.units, { id: `unidad-${crypto.randomUUID()}`, name: newUnit.trim() }];
		try { await updateCourse(assignmentId, { units }); setNewUnit(""); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo agregar la unidad."); }
	}
	async function removeUnit(unitId: string) {
		if (!assignmentId || !course || unitId === "unidad-principal") return;
		if (course.resources.some((resource) => resource.unitId === unitId)) {
			setStatus("Mueve o elimina sus recursos antes de borrar esta unidad.");
			return;
		}
		try { await updateCourse(assignmentId, { units: course.units.filter((unit) => unit.id !== unitId) }); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar la unidad."); }
	}
	async function addComment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !profile || !commentText.trim()) return;
		const comment: CourseComment = { id: crypto.randomUUID(), authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text: commentText.trim(), createdAt: new Date().toISOString() };
		try { await addCourseComment(assignmentId, comment); setCommentText(""); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el comentario."); }
	}
	async function replyToCourseComment(parentId: string, text: string) {
		if (!assignmentId || !profile) return;
		const reply: CourseComment = { id: crypto.randomUUID(), parentId, authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text, createdAt: new Date().toISOString() };
		try { await addCourseComment(assignmentId, reply); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo enviar la respuesta."); throw error; }
	}
	async function removeResource(resourceId: string, title: string) {
		if (!assignmentId || !window.confirm(`¿Eliminar “${title}”?`)) return;
		try { await deleteResource(assignmentId, resourceId); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar el recurso."); }
	}
	return <WorkspaceLayout title={course?.title || "Asignatura"}>
		<nav className="breadcrumbs"><Link to={isTeacher ? "/profesor" : "/alumno"}>{isTeacher ? "Mis asignaturas" : "Asignaturas"}</Link><span>/</span><span>{course?.title || assignmentId}</span></nav>
		{status && <p className="status" role="status">{status}</p>}
		{course && <>
			{isTeacher ? <form className="course-edit-form" onSubmit={saveCourse}><label>Título<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required /></label><label>Descripción<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} /></label><button className="button button-primary">Guardar asignatura</button></form> : course.description && <p className="course-description">{course.description}</p>}
			{isTeacher && <><form className="inline-form" onSubmit={createNewResource}><input aria-label="Título del nuevo recurso" placeholder="Título del nuevo recurso" value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} required /><button className="button button-primary">Crear recurso</button></form><form className="inline-form" onSubmit={addUnit}><input aria-label="Nombre de la unidad" placeholder="Nueva unidad" value={newUnit} onChange={(event) => setNewUnit(event.target.value)} required /><button className="button button-quiet">Agregar unidad</button></form></>}
			{course.units.map((unit) => <section className="unit-block" key={unit.id}><header><h2>{unit.name}</h2><span>{course.resources.filter((resource) => resource.unitId === unit.id).length} recursos</span>{isTeacher && unit.id !== "unidad-principal" && <button className="button button-quiet" onClick={() => void removeUnit(unit.id)}>Eliminar unidad</button>}</header><div className="resource-list">{course.resources.filter((resource) => resource.unitId === unit.id).map((resource) => <article className="resource-row" key={resource.id}><Link to={`/profesor/asignaturas/${assignmentId}/recursos/${resource.id}`}><span>{resource.title}</span><small>{resource.duration || "Video educativo"}</small></Link>{isTeacher && <button className="button button-danger" onClick={() => void removeResource(resource.id, resource.title)}>Eliminar</button>}</article>)}</div></section>)}
			{!course.resources.length && <p className="empty-state">Todavía no hay recursos disponibles.</p>}
			<section className="comments-section"><h2>Comentarios de la asignatura</h2>{profile && <CommentThread comments={course.comments} profile={profile} onReply={replyToCourseComment} />}<form className="inline-form" onSubmit={addComment}><input aria-label="Escribe un comentario" placeholder="Escribe un comentario" value={commentText} onChange={(event) => setCommentText(event.target.value)} required /><button className="button button-primary">Comentar</button></form></section>
		</>}
	</WorkspaceLayout>;
}

export function ResourcePage() {
	const { resourceId } = useParams();
	const { assignmentId } = useParams();
	const { profile } = useAuth();
	const [resource, setResource] = useState<ResourceSummary | null>(null);
	const [comments, setComments] = useState<CourseComment[]>([]);
	const [status, setStatus] = useState("Cargando recurso...");
	const [videoUrl, setVideoUrl] = useState("");
	const [videoDuration, setVideoDuration] = useState(0);
	const [commentText, setCommentText] = useState("");
	const [playbackTime, setPlaybackTime] = useState(0);
	const [dismissedPopups, setDismissedPopups] = useState<Set<string>>(() => new Set());
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const isTeacher = profile?.role === "profesor";
	const load = async () => {
		if (!assignmentId || !resourceId || !profile) return;
		const [loaded, loadedComments] = await Promise.all([getResource(assignmentId, resourceId, profile.role), getResourceComments(assignmentId, resourceId)]);
		setResource(loaded);
		setComments(loadedComments);
		setStatus(loaded ? "" : "No se encontró el recurso o no está publicado.");
	};
	useEffect(() => { void load().catch((error: unknown) => { console.error(error); setStatus("No se pudo cargar el recurso."); }); }, [assignmentId, resourceId, profile]);
	useEffect(() => {
		let objectUrl = "";
		if (resource?.videoLocalKey) import("../services/videoFiles").then(({ getLocalVideoUrl }) => getLocalVideoUrl(resource.videoLocalKey!)).then((url) => { objectUrl = url; setVideoUrl(url); }).catch(() => setStatus("El video local no está disponible en este navegador."));
		else setVideoUrl(resource?.videoUrl || "");
		return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
	}, [resource?.videoLocalKey, resource?.videoUrl]);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const form = new FormData(event.currentTarget);
		const file = form.get("video");
		try {
			let videoLocalKey = resource.videoLocalKey;
			if (file instanceof File && file.size) {
				setStatus("Comprimiendo y guardando video en este navegador...");
				videoLocalKey = `${assignmentId}/${resourceId}`;
				const { saveTranscodedVideo } = await import("../services/videoFiles");
				await saveTranscodedVideo(videoLocalKey, file, (progress) => setStatus(`Comprimiendo video: ${progress}%`));
			}
			await updateResource(assignmentId, resourceId, {
				title: String(form.get("title") || "").trim(),
				description: String(form.get("description") || "").trim(),
				videoUrl: String(form.get("videoUrl") || "").trim(),
				...(videoLocalKey ? { videoLocalKey } : {}),
				trimStart: Math.max(0, Number(form.get("trimStart") || 0)),
				trimEnd: form.get("trimEnd") ? Number(form.get("trimEnd")) : null,
				isDraft: false,
				isHidden: form.get("isHidden") === "on"
			});
			setStatus("Recurso guardado.");
			await load();
		} catch (error) { console.error(error); setStatus(error instanceof Error ? error.message : "No se pudo guardar el recurso."); }
	}
	async function addComment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!profile || !assignmentId || !resourceId || !commentText.trim()) return;
		const comment: CourseComment = { id: crypto.randomUUID(), authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text: commentText.trim(), createdAt: new Date().toISOString() };
		try { await addResourceComment(assignmentId, resourceId, comment); setComments((previous) => [...previous, comment]); setCommentText(""); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el comentario."); }
	}
	async function replyToResourceComment(parentId: string, text: string) {
		if (!profile || !assignmentId || !resourceId) return;
		const reply: CourseComment = { id: crypto.randomUUID(), parentId, authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text, createdAt: new Date().toISOString() };
		try {
			await addResourceComment(assignmentId, resourceId, reply);
			setComments((previous) => [...previous, reply]);
		} catch (error) { console.error(error); setStatus("No se pudo enviar la respuesta."); throw error; }
	}
	async function addMaterial(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const formElement = event.currentTarget;
		const form = new FormData(formElement);
		const file = form.get("file");
		const url = String(form.get("url") || "").trim();
		if (!(file instanceof File && file.size) && !url) {
			setStatus("Selecciona un archivo o escribe una URL.");
			return;
		}
		let localKey = "";
		let material: ResourceMaterial = { id: crypto.randomUUID(), title: String(form.get("title") || "").trim(), format: String(form.get("format") || "Enlace"), description: String(form.get("description") || "").trim(), url };
		try {
			if (file instanceof File && file.size) {
				setStatus("Guardando documento en este navegador...");
				const { saveLocalMaterial } = await import("../services/materialFiles");
				localKey = `${assignmentId}/${resourceId}/${material.id}`;
				const saved = await saveLocalMaterial(localKey, file);
				material = { ...material, localKey, format: saved.format };
			}
			const nextMaterials = [...resource.materials, material];
			try {
				await updateResource(assignmentId, resourceId, { materials: nextMaterials });
			} catch (error) {
				if (localKey) {
					const { deleteLocalMaterial } = await import("../services/materialFiles");
					await deleteLocalMaterial(localKey).catch(() => {});
				}
				throw error;
			}
			setResource({ ...resource, materials: nextMaterials });
			setStatus(localKey ? "Documento guardado en este navegador." : "Enlace adjunto guardado.");
			formElement.reset();
		} catch (error) { console.error(error); setStatus(error instanceof Error ? error.message : "No se pudo guardar el material."); }
	}
	async function removeMaterial(materialId: string) {
		if (!resource || !assignmentId || !resourceId) return;
		const materials = resource.materials.filter((material) => material.id !== materialId);
		const popups = resource.popups.filter((popup) => popup.materialId !== materialId);
		try {
			await updateResource(assignmentId, resourceId, { materials, popups });
			setResource({ ...resource, materials, popups });
			const localKey = resource.materials.find((material) => material.id === materialId)?.localKey;
			if (localKey) {
				const { deleteLocalMaterial } = await import("../services/materialFiles");
				await deleteLocalMaterial(localKey).catch((error) => console.warn("El documento se quitó del recurso, pero IndexedDB no pudo borrarlo.", error));
			}
		}
		catch (error) { console.error(error); setStatus("No se pudo eliminar el material."); }
	}
	async function addPopup(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const formElement = event.currentTarget;
		const form = new FormData(formElement);
		const pauseVideo = form.get("pauseVideo") === "on";
		const popup: ResourcePopup = {
			id: crypto.randomUUID(),
			title: String(form.get("title") || "").trim(),
			message: String(form.get("message") || "").trim(),
			timestamp: Number(form.get("timestamp")),
			materialId: String(form.get("materialId") || ""),
			pauseVideo,
			dismissAfter: pauseVideo ? null : Math.max(1, Number(form.get("dismissAfter") || 5)),
			x: 72,
			y: 58
		};
		if (!Number.isFinite(popup.timestamp) || popup.timestamp < 0 || !popup.materialId) return;
		const popups = [...resource.popups, popup];
		try { await updateResource(assignmentId, resourceId, { popups }); setResource({ ...resource, popups }); formElement.reset(); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el pop-up."); }
	}
	async function removePopup(popupId: string) {
		if (!resource || !assignmentId || !resourceId) return;
		const popups = resource.popups.filter((popup) => popup.id !== popupId);
		try { await updateResource(assignmentId, resourceId, { popups }); setResource({ ...resource, popups }); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar el pop-up."); }
	}
	function dismissPopup(popupId: string) {
		setDismissedPopups((current) => new Set(current).add(popupId));
		void videoRef.current?.play();
	}
	const externalUrl = resource?.videoUrl ? toEmbedUrl(resource.videoUrl) : "";
	const isEmbed = !!externalUrl && externalUrl !== resource?.videoUrl;
	const activePopup = resource?.popups.find((popup) => !dismissedPopups.has(popup.id) && playbackTime >= popup.timestamp && (popup.pauseVideo || playbackTime <= popup.timestamp + (popup.dismissAfter || 5)));
	useEffect(() => { if (activePopup?.pauseVideo) videoRef.current?.pause(); }, [activePopup?.id]);
	return <WorkspaceLayout title={resource?.title || "Recurso"}>
		<p className="breadcrumbs"><Link to={`/profesor/asignaturas/${assignmentId}`}>Volver a la asignatura</Link></p>
		{status && <p className="status" role="status">{status}</p>}
		{resource && <>
			{resource.videoLocalKey && videoUrl && <div className="player-shell"><video ref={videoRef} className="resource-player" src={videoUrl} controls poster={resource.thumbnailUrl || undefined} onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); event.currentTarget.currentTime = resource.trimStart || 0; }} onTimeUpdate={(event) => { setPlaybackTime(event.currentTarget.currentTime); if (resource.trimEnd && event.currentTarget.currentTime >= resource.trimEnd) event.currentTarget.pause(); }} />{activePopup && <aside className="video-popup" style={{ left: `${activePopup.x}%`, top: `${activePopup.y}%` }}><strong>{activePopup.title}</strong><p>{activePopup.message}</p>{activePopup.imageDataUrl && <img src={activePopup.imageDataUrl} alt="" />}{resource.materials.find((material) => material.id === activePopup.materialId)?.url && <a href={resource.materials.find((material) => material.id === activePopup.materialId)?.url} target="_blank" rel="noreferrer">Abrir material</a>}{activePopup.pauseVideo && <button className="button button-primary" onClick={() => dismissPopup(activePopup.id)}>Continuar video</button>}</aside>}</div>}
			{!resource.videoLocalKey && resource.videoUrl && (isEmbed ? <iframe className="resource-player" src={externalUrl} title={resource.title} allowFullScreen /> : <div className="player-shell"><video ref={videoRef} className="resource-player" src={resource.videoUrl} controls poster={resource.thumbnailUrl || undefined} onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); event.currentTarget.currentTime = resource.trimStart || 0; }} onTimeUpdate={(event) => { setPlaybackTime(event.currentTarget.currentTime); if (resource.trimEnd && event.currentTarget.currentTime >= resource.trimEnd) event.currentTarget.pause(); }} />{activePopup && <aside className="video-popup" style={{ left: `${activePopup.x}%`, top: `${activePopup.y}%` }}><strong>{activePopup.title}</strong><p>{activePopup.message}</p>{activePopup.imageDataUrl && <img src={activePopup.imageDataUrl} alt="" />}{resource.materials.find((material) => material.id === activePopup.materialId)?.url && <a href={resource.materials.find((material) => material.id === activePopup.materialId)?.url} target="_blank" rel="noreferrer">Abrir material</a>}{activePopup.pauseVideo && <button className="button button-primary" onClick={() => dismissPopup(activePopup.id)}>Continuar video</button>}</aside>}</div>)}
			{isTeacher ? <form className="resource-edit-form" onSubmit={save}><label>Título<input name="title" defaultValue={resource.title} required /></label><label>Descripción<textarea name="description" defaultValue={resource.description} rows={4} /></label><label>URL de video<input name="videoUrl" type="url" defaultValue={resource.videoUrl} placeholder="https://..." /></label><label>Archivo de video<input name="video" type="file" accept="video/*" /></label><label>Inicio de reproducción (segundos)<input name="trimStart" type="number" min="0" max={videoDuration || undefined} step="0.1" defaultValue={resource.trimStart || 0} /></label><label>Fin de reproducción (segundos)<input name="trimEnd" type="number" min={resource.trimStart || 0} max={videoDuration || undefined} step="0.1" defaultValue={resource.trimEnd ?? ""} /></label><label className="check-label"><input name="isHidden" type="checkbox" defaultChecked={resource.isHidden} /> Ocultar a estudiantes</label><button className="button button-primary">Guardar recurso</button></form> : <p>{resource.description}</p>}
			{resource.materials.length > 0 && <section className="unit-block"><h2>Material de apoyo</h2>{resource.materials.map((material) => <div className="material-row" key={material.id}><MaterialLink material={material} />{isTeacher && <button className="button button-danger" onClick={() => void removeMaterial(material.id)}>Eliminar</button>}</div>)}</section>}
			{isTeacher && <form className="material-upload-form" onSubmit={addMaterial}><input name="title" placeholder="Nombre del material" required /><input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" /><input name="url" type="url" placeholder="o pega una URL externa" /><input name="description" placeholder="Descripción (opcional)" /><button className="button button-quiet">Adjuntar documento</button></form>}
			{isTeacher && resource.materials.length > 0 && !isEmbed && <section className="popup-manager"><h2>Pop-ups temporizados</h2><form className="popup-form" onSubmit={addPopup}><input name="title" placeholder="Título" required /><input name="timestamp" type="number" min="0" step="0.1" placeholder="Segundo del video" defaultValue={Math.floor(playbackTime)} required /><textarea name="message" placeholder="Mensaje" rows={2} required /><select name="materialId" defaultValue={resource.materials[0]?.id}>{resource.materials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}</select><label><input name="pauseVideo" type="checkbox" /> Pausar hasta continuar</label><label>Cierre automático (segundos)<input name="dismissAfter" type="number" min="1" max="60" defaultValue="5" /></label><button className="button button-quiet">Agregar pop-up</button></form>{resource.popups.map((popup) => <article className="management-row" key={popup.id}><span>{popup.timestamp}s · {popup.title}</span><button className="button button-danger" onClick={() => void removePopup(popup.id)}>Eliminar</button></article>)}</section>}
			<section className="comments-section"><h2>Comentarios</h2>{profile && <CommentThread comments={comments} profile={profile} onReply={replyToResourceComment} />}<form className="inline-form" onSubmit={addComment}><input aria-label="Escribe un comentario" placeholder="Escribe un comentario" value={commentText} onChange={(event) => setCommentText(event.target.value)} required /><button className="button button-primary">Comentar</button></form></section>
		</>}
	</WorkspaceLayout>;
}

export function AdminPage() {
	const [users, setUsers] = useState<{ uid: string; email: string; displayName: string; role: string }[]>([]);
	const [status, setStatus] = useState("Cargando usuarios...");
	const [search, setSearch] = useState("");
	const [teacherEmail, setTeacherEmail] = useState("");
	const [teacherName, setTeacherName] = useState("");
	const [teacherPassword, setTeacherPassword] = useState("");
	const filteredUsers = users.filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
	const loadUsers = async () => {
		const snapshot = await getDocs(collection(db, "usuarios"));
		setUsers(snapshot.docs.map((item) => ({ uid: item.id, email: String(item.data().email || ""), displayName: String(item.data().displayName || item.data().nombre || "Sin nombre"), role: String(item.data().role || "alumno") })));
		setStatus("");
	};
	useEffect(() => { void loadUsers().catch((error: unknown) => { console.error(error); setStatus("No se pudieron cargar usuarios. Revisa las reglas de Firebase."); }); }, []);
	async function changeRole(uid: string, role: string) {
		try { await updateDoc(doc(db, "usuarios", uid), { role }); await loadUsers(); setStatus("Rol actualizado."); }
		catch (error) { console.error(error); setStatus("No se pudo actualizar el rol."); }
	}
	async function removeUser(uid: string) {
		if (!window.confirm("¿Eliminar el perfil de este usuario?")) return;
		if (uid === auth.currentUser?.uid) { setStatus("No puedes eliminar tu propio perfil activo."); return; }
		try { await deleteDoc(doc(db, "usuarios", uid)); await loadUsers(); setStatus("Perfil eliminado."); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar el perfil."); }
	}
	async function createTeacher(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const secondaryName = "VideotecaAdminSecondary";
		const secondaryApp = getApps().find((app) => app.name === secondaryName) || initializeApp(auth.app.options, secondaryName);
		const secondaryAuth = getAuth(secondaryApp);
		try {
			const credential = await createUserWithEmailAndPassword(secondaryAuth, teacherEmail.trim(), teacherPassword);
			await setDoc(doc(db, "usuarios", credential.user.uid), { displayName: teacherName.trim(), email: teacherEmail.trim(), role: "profesor", createdAt: new Date().toISOString() });
			await signOut(secondaryAuth);
			await loadUsers();
			setTeacherEmail(""); setTeacherName(""); setTeacherPassword(""); setStatus("Cuenta de profesor creada.");
		} catch (error) { console.error(error); setStatus(error instanceof Error ? error.message : "No se pudo crear el profesor."); }
	}
	return <WorkspaceLayout title="Gestión de usuarios">
		{status && <p className="status" role="status">{status}</p>}
		<form className="teacher-form" onSubmit={createTeacher}><input type="email" placeholder="Correo docente" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} required /><input placeholder="Nombre" value={teacherName} onChange={(event) => setTeacherName(event.target.value)} required /><input type="password" minLength={6} placeholder="Contraseña inicial" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} required /><button className="button button-primary">Crear profesor</button></form>
		<label className="search-label">Buscar usuario<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
		<div className="management-list">{filteredUsers.map((user) => <article className="management-row" key={user.uid}><span><strong>{user.displayName}</strong><small>{user.email}</small></span><div><select aria-label={`Rol de ${user.email}`} value={user.role} onChange={(event) => void changeRole(user.uid, event.target.value)}><option value="alumno">Alumno</option><option value="profesor">Profesor</option><option value="admin">Admin</option></select><button className="button button-danger" onClick={() => void removeUser(user.uid)}>Eliminar perfil</button></div></article>)}</div>
	</WorkspaceLayout>;
}

function toEmbedUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.hostname.includes("youtube.com")) return `https://www.youtube.com/embed/${parsed.searchParams.get("v") || ""}`;
		if (parsed.hostname === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
	} catch { return url; }
	return url;
}