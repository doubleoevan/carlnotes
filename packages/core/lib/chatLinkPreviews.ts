/**
 * Return whether a chat message can have a web link preview.
 */
export function hasPreviewableLink(text: string): boolean {
	return /https?:\/\//i.test(text)
}
