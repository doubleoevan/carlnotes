// split a long document's text into bounded chunks for parallel summarization

// the most chunks a document splits into, bounding the summarize fan-out. the environment can override it
export const MAX_CHUNKS = Number(Bun.env.MAX_CHUNKS ?? "8")

// the target characters per chunk, before the max-chunks bound forces larger chunks to cover the whole document
export const CHUNK_CHARS = Number(Bun.env.CHUNK_CHARS ?? "8000")

// split text into at most maxChunks chunks that together cover the whole document
export function chunk(text: string, maxChunks: number, chunkChars: number): string[] {
	// no text is no chunks
	if (!text) {
		return []
	}

	// select the chunk count from the target size, limited to maxChunks, then size the chunks to cover the whole document
	const chunkCount = Math.min(maxChunks, Math.max(1, Math.ceil(text.length / chunkChars)))
	const chunkSize = Math.ceil(text.length / chunkCount)
	const chunks: string[] = []
	for (let chunkStart = 0; chunkStart < text.length; chunkStart += chunkSize) {
		chunks.push(text.slice(chunkStart, chunkStart + chunkSize))
	}
	return chunks
}
