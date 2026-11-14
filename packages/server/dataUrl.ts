// the data url of an image's or a file's bytes, which a model reads and a card draws

/**
 * Returns bytes as a base64 data url of their content type.
 */
export function toDataUrl(contentType: string, bytes: Uint8Array): string {
	return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
}
