/**
 * Almacenamiento local de miniaturas de asignaturas en IndexedDB.
 */
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function openCoverDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("videoteca-local-course-covers", 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains("covers")) request.result.createObjectStore("covers");
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local de miniaturas."));
	});
}

/**
 * Guarda una miniatura local y devuelve su clave para guardarla en Firestore.
 */
export async function saveCourseCover(localKey: string, file: File): Promise<void> {
	if (!ALLOWED_COVER_TYPES.has(file.type)) throw new Error("La miniatura debe estar en formato JPG, PNG o WebP.");
	if (file.size >= MAX_COVER_SIZE) throw new Error("La miniatura debe pesar menos de 5 MB.");
	const database = await openCoverDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("covers", "readwrite");
			transaction.objectStore("covers").put(file, localKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la miniatura."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado de la miniatura."));
		});
	} finally {
		database.close();
	}
}

/**
 * Recupera una URL temporal para mostrar una miniatura almacenada localmente.
 */
export async function getCourseCoverUrl(localKey: string): Promise<string> {
	const database = await openCoverDatabase();
	try {
		const cover = await new Promise<Blob | undefined>((resolve, reject) => {
			const request = database.transaction("covers", "readonly").objectStore("covers").get(localKey);
			request.onsuccess = () => resolve(request.result as Blob | undefined);
			request.onerror = () => reject(request.error || new Error("No se pudo leer la miniatura local."));
		});
		if (!cover) throw new Error("La miniatura solo está disponible en el navegador donde se creó.");
		return URL.createObjectURL(cover);
	} finally {
		database.close();
	}
}

/**
 * Elimina la miniatura local si falla la creación de su asignatura.
 */
export async function deleteCourseCover(localKey: string): Promise<void> {
	const database = await openCoverDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("covers", "readwrite");
			transaction.objectStore("covers").delete(localKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar la miniatura local."));
		});
	} finally {
		database.close();
	}
}
