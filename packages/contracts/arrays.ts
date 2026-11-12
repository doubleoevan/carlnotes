// the array helpers that every workspace shares

/**
 * Returns the items in chunks of the chunk size, the last chunk holding the rest.
 */
export function toChunks<Item>(items: Item[], chunkSize: number): Item[][] {
	const chunks: Item[][] = []
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize))
	}
	return chunks
}
