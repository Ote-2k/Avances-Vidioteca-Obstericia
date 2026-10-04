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
				videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
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
				videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
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
				videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
				materials: [
					{ title: "Información de apoyo", format: "Lectura", description: "Señales de inicio y etapas del trabajo de parto.", url: "../../prueba.pdf" }
				]
			}
		}
	};

	function read() {
		let saved = {};
		try {
			saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
		} catch {
			saved = {};
		}

		return {
			course: { ...defaults.course, ...(saved.course || {}) },
			resources: Object.fromEntries(
				Object.entries(defaults.resources).map(([id, resource]) => [
					id,
					{ ...resource, ...(saved.resources?.[id] || {}) }
				])
			)
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
		}
	};
})();