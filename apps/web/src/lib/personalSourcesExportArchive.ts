// bounded ZIP extraction reads only conversation JSON and never materializes attachments
import { TOPIC_ATTACHMENT_MAX_BYTES } from "@carlnotes/contracts/attachmentTypes"
import { type Entry, type FileEntry, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js"

/**
 * Extracts one supported conversation file after validating every archive entry's bounds and path.
 */
export async function readPersonalSourcesArchive(bytes: Uint8Array): Promise<Uint8Array> {
	// decompression runs inside the import worker with a bounded output sink
	const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false, checkSignature: true })
	try {
		const entry = await selectConversationFile(reader)
		return await readBoundedEntry(entry)
	} finally {
		await reader.close()
	}
}

// reject ambiguous conversation files, excessive archives, encrypted entries, and traversal before decoding content
async function selectConversationFile(reader: ZipReader<Uint8Array>): Promise<FileEntry> {
	let totalBytes = 0
	let entryCount = 0
	let conversationFile: FileEntry | null = null
	for await (const entry of reader.getEntriesGenerator()) {
		entryCount += 1
		totalBytes += entry.uncompressedSize
		if (entryCount > 2048 || totalBytes > TOPIC_ATTACHMENT_MAX_BYTES || !isSafeArchiveEntry(entry)) {
			throw new Error("This archive has unsafe paths, encryption, or exceeds the 10 MiB extraction limit.")
		}
		if (entry.directory || entry.filename.split("/").at(-1) !== "conversations.json") {
			continue
		}
		if (conversationFile) {
			throw new Error("Choose an archive containing one conversations.json file.")
		}
		conversationFile = entry
	}
	if (!conversationFile) {
		throw new Error("This archive has no supported conversations.json file. Paste a transcript instead.")
	}
	return conversationFile
}

// no archive entry is extracted to the filesystem or treated as a URL
function isSafeArchiveEntry(entry: Entry): boolean {
	const segments = entry.filename.split("/")
	return (
		!entry.encrypted &&
		!entry.symlink &&
		!/[\\:]/.test(entry.filename) &&
		!entry.filename.includes("\0") &&
		!entry.filename.startsWith("/") &&
		!segments.includes("..") &&
		Number.isSafeInteger(entry.uncompressedSize) &&
		entry.uncompressedSize >= 0 &&
		Number.isSafeInteger(entry.compressedSize) &&
		entry.compressedSize >= 0 &&
		(entry.directory || [0, 8].includes(entry.compressionMethod)) &&
		entry.uncompressedSize <= Math.max(1, entry.compressedSize) * 100
	)
}

// count actual inflated bytes too, so forged ZIP metadata cannot bypass the bound
async function readBoundedEntry(entry: FileEntry): Promise<Uint8Array> {
	const chunks: Uint8Array[] = []
	let byteCount = 0
	await entry.getData(
		new WritableStream<Uint8Array>({
			write(chunk) {
				byteCount += chunk.byteLength
				if (byteCount > TOPIC_ATTACHMENT_MAX_BYTES || byteCount > entry.uncompressedSize) {
					throw new Error("The expanded archive exceeds its allowed size.")
				}
				chunks.push(chunk)
			},
		}),
		{ checkSignature: true },
	)
	const output = new Uint8Array(byteCount)
	let offset = 0
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.byteLength
	}
	return output
}
