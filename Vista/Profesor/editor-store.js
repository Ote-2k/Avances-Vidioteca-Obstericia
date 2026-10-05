(() => {
	const storageKey = "videoteca-profesor-edits-v1";
	const defaults = {
		course: {
			title: "Asignatura 1",
			description: "Recursos y contenidos disponibles para esta asignatura.",
			coverUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=80"
		},
		resources: {
			introduccion: {
				title: "Introducción a la asignatura",
				unit: "Unidad 1",
				duration: "12 min",
				description: "Presentación de los objetivos, contenidos y organización de la asignatura.",
				thumbnailUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Guía de estudio", format: "PDF", description: "Orientaciones y contenidos principales de la asignatura.", url: "../../prueba.pdf" },
					{ title: "Material complementario", format: "PDF", description: "Lecturas sugeridas para profundizar los temas de la unidad.", url: "../../prueba.pdf" }
				]
			},
			"controles-prenatales": {
				title: "Controles prenatales",
				unit: "Unidad 1",
				duration: "18 min",
				description: "Revisión de los controles prenatales y su importancia en el seguimiento del embarazo.",
				thumbnailUrl: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Material complementario", format: "PDF", description: "Apuntes y contenidos de apoyo para revisar junto con el video.", url: "../../prueba.pdf" }
				]
			},
			"trabajo-de-parto": {
				title: "Signos y etapas del trabajo de parto",
				unit: "Unidad 2",
				duration: "24 min",
				description: "Descripción de las señales de inicio y las etapas del trabajo de parto.",
				thumbnailUrl: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Información de apoyo", format: "Lectura", description: "Señales de inicio y etapas del trabajo de parto.", url: "../../prueba.pdf" }
				]
			}
		},
		comments: {
			course: [
				{ id: "course-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿La guía de estudio incluye los puntos clave del primer video?" },
				{ id: "course-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "El material complementario me ayudó a repasar la unidad." }
			],
			introduccion: [
				{ id: "intro-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "intro-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			],
			"controles-prenatales": [
				{ id: "prenatal-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "prenatal-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			],
			"trabajo-de-parto": [
				{ id: "labor-comment-maria", author: "MP", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "labor-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			]
		}
	};

	function read() {
		let saved = {};
		try {
			saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
		} catch {
			saved = {};
		}

		const deletedResources = new Set(saved.deletedResources || []);
		const resources = {};
		const previousSampleVideo = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
		Object.entries(defaults.resources).forEach(([id, resource]) => {
			if (deletedResources.has(id)) return;
			const savedResource = saved.resources?.[id] || {};
			const mergedResource = { ...resource, ...savedResource };
			mergedResource.materials = (mergedResource.materials || []).map((material, index) => ({
				...material,
				id: material.id || `${id}-document-${index + 1}`
			}));
			mergedResource.popups = Array.isArray(mergedResource.popups) ? mergedResource.popups : [];
			resources[id] = mergedResource;
			if (savedResource.videoUrl === previousSampleVideo && !savedResource.videoBlobId) {
				resources[id].videoUrl = resource.videoUrl;
			}
		});
		Object.entries(saved.resources || {}).forEach(([id, resource]) => {
			if (defaults.resources[id] || deletedResources.has(id)) return;
			resources[id] = {
				...resource,
				materials: (resource.materials || []).map((material, index) => ({
					...material,
					id: material.id || `${id}-document-${index + 1}`
				})),
				popups: Array.isArray(resource.popups) ? resource.popups : []
			};
		});

		return {
			course: { ...defaults.course, ...(saved.course || {}) },
			resources,
			comments: { ...defaults.comments, ...(saved.comments || {}) },
			deletedResources: [...deletedResources]
		};
	}

	function write(data) {
		localStorage.setItem(storageKey, JSON.stringify(data));
	}

	window.VideotecaStore = {
		get: read,
		saveCourse(updates) {
			const data = read();
			data.course = { ...data.course, ...updates };
			write(data);
			return data;
		},
		saveResource(id, updates) {
			const data = read();
			if (!data.resources[id]) return null;
			data.resources[id] = { ...data.resources[id], ...updates };
			write(data);
			return data;
		},
		createResource(resource) {
			const data = read();
			const id = `recurso-${Date.now().toString(36)}`;
			data.resources[id] = { ...resource, isHidden: false };
			write(data);
			return id;
		},
		setResourceHidden(id, isHidden) {
			const data = read();
			if (!data.resources[id]) return false;
			data.resources[id].isHidden = isHidden;
			write(data);
			return true;
		},
		deleteResource(id) {
			const data = read();
			if (!data.resources[id]) return false;
			delete data.resources[id];
			data.deletedResources = [...new Set([...data.deletedResources, id])];
			write(data);
			return true;
		},
		addComment(scope, comment) {
			const data = read();
			const newComment = { ...comment, id: `comentario-${Date.now().toString(36)}` };
			data.comments[scope] = [...(data.comments[scope] || []), newComment];
			write(data);
			return newComment;
		},
		deleteComment(scope, id) {
			const data = read();
			if (!data.comments[scope]) return false;
			data.comments[scope] = data.comments[scope].filter((comment) => comment.id !== id);
			write(data);
			return true;
		}
	};
})();