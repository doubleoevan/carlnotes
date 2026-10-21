/**
 * The server-sanitized display of a note, rendered without the editor.
 */
export function NoteStatic({ html }: { html: string }) {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: the HTML is rendered and sanitized server-side from the ydoc
	return <div className="note-static py-2 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
}
