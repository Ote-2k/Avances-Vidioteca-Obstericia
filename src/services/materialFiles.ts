/**
 * Gestión de documentos adjuntos almacenados localmente en IndexedDB.
 *
 * La aplicación guarda archivos que el profesor adjunta a cada recurso y los
 * reutiliza en el navegador sin depender de un almacenamiento externo.
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"text/plain",
	"image/png",
	"image/jpeg"
]);

const TYPE_BY_EXTENSION: Record<string, string> = {
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	txt: "text/plain",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg"
};

export interface UploadedMaterial {
	localKey: string;
	format: string;
}

function openAttachmentDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("videoteca-local-attachments", 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains("attachments")) request.result.createObjectStore("attachments");
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local de documentos."));
	});
}

/**
 * Guarda un archivo de apoyo en IndexedDB validando tamaño y tipo.
 */
export async function saveLocalMaterial(localKey: string, file: File): Promise<UploadedMaterial> {
	if (file.size > MAX_FILE_SIZE) throw new Error("El documento supera el límite de 25 MB.");
	const extensionType = TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() || ""];
	const contentType = ALLOWED_TYPES.has(file.type) ? file.type : extensionType;
	if (!contentType || !ALLOWED_TYPES.has(contentType)) throw new Error("Formato no permitido. Usa PDF, Office, texto, PNG o JPEG.");
	const database = await openAttachmentDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("attachments", "readwrite");
			transaction.objectStore("attachments").put(file, localKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el documento."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del documento."));
		});
	} finally {
		database.close();
	}
	return { localKey, format: file.name.split(".").pop()?.toUpperCase() || "Archivo" };
}

/**
 * Genera una URL local para un archivo previamente guardado en el navegador.
 */
export async function getLocalMaterialUrl(localKey: string): Promise<string> {
	const database = await openAttachmentDatabase();
	try {
		const file = await new Promise<Blob | undefined>((resolve, reject) => {
			const request = database.transaction("attachments", "readonly").objectStore("attachments").get(localKey);
			request.onsuccess = () => resolve(request.result as Blob | undefined);
			request.onerror = () => reject(request.error || new Error("No se pudo leer el documento."));
		});
		if (!file) throw new Error("El documento solo está disponible en el navegador donde se adjuntó.");
		return URL.createObjectURL(file);
	} finally {
		database.close();
	}
}

/**
 * Elimina un documento adjunto del almacenamiento local del navegador.
 */
export async function deleteLocalMaterial(localKey: string): Promise<void> {
	const database = await openAttachmentDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction("attachments", "readwrite");
			transaction.objectStore("attachments").delete(localKey);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el documento local."));
		});
	} finally {
		database.close();
	}
}