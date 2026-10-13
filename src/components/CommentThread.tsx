import { useState, type FormEvent } from "react";
import type { CourseComment, UserProfile } from "../types";

interface CommentThreadProps {
	comments: CourseComment[];
	profile: UserProfile;
	onReply: (parentId: string, text: string) => Promise<void>;
}

function displayAuthor(comment: CourseComment, profile: UserProfile): string {
	const author = comment.author?.trim();
	if (author && !["usuario", "tú", "tu", "you"].includes(author.toLocaleLowerCase())) return author;
	if (comment.authorUid === profile.uid) return profile.displayName;
	if (comment.authorEmail) return comment.authorEmail.split("@")[0];
	return comment.authorUid ? `Usuario ${comment.authorUid.slice(-6).toLocaleUpperCase()}` : "Participante";
}

function formatDate(value: string): string {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

export function CommentThread({ comments, profile, onReply }: CommentThreadProps) {
	const [replyTo, setReplyTo] = useState("");
	const [replyText, setReplyText] = useState("");
	const [replyError, setReplyError] = useState("");
	const [busy, setBusy] = useState(false);
	const roots = comments.filter((comment) => !comment.parentId);

	async function submitReply(event: FormEvent<HTMLFormElement>, parentId: string) {
		event.preventDefault();
		const text = replyText.trim();
		if (!text) return;
		setBusy(true);
		setReplyError("");
		try {
			await onReply(parentId, text);
			setReplyText("");
			setReplyTo("");
		} catch {
			setReplyError("No se pudo enviar la respuesta. Inténtalo nuevamente.");
		} finally {
			setBusy(false);
		}
	}

	if (!roots.length) return <p className="muted">Todavía no hay comentarios.</p>;

	return <div className="comment-thread">
		{roots.map((comment) => {
			const replies = comments.filter((reply) => reply.parentId === comment.id);
			return <article className="comment-thread-item" key={comment.id}>
				<header><strong>{displayAuthor(comment, profile)}</strong><time>{formatDate(comment.createdAt)}</time></header>
				<p>{comment.text}</p>
				{replies.length > 0 && <div className="comment-replies">{replies.map((reply) => <article className="comment-reply" key={reply.id}><header><strong>{displayAuthor(reply, profile)}</strong><time>{formatDate(reply.createdAt)}</time></header><p>{reply.text}</p></article>)}</div>}
				<button className="text-button" type="button" onClick={() => { setReplyTo(replyTo === comment.id ? "" : comment.id); setReplyText(""); }}>{replyTo === comment.id ? "Cancelar" : "Responder"}</button>
				{replyTo === comment.id && <form className="inline-form reply-form" onSubmit={(event) => void submitReply(event, comment.id)}><input aria-label={`Responder a ${displayAuthor(comment, profile)}`} placeholder="Escribe una respuesta" value={replyText} onChange={(event) => setReplyText(event.target.value)} required /><button className="button button-primary" disabled={busy}>{busy ? "Enviando..." : "Enviar respuesta"}</button>{replyError && <p className="status" role="status">{replyError}</p>}</form>}
			</article>;
		})}
	</div>;
}