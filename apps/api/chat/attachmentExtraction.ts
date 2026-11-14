// extracting an attached file's text in a child process of the api, so a large PDF, Word file, or workbook never
// stalls the event loop that serves every request and open stream, and a file whose read takes too much memory ends
// its own child process alone. a few child processes read at once, one file each, and a user's files are read one at
// a time, so one user's files never hold every child process
import { extractChatAttachmentText } from "@carlnotes/pipeline/attachExtraction"

// how long a request's files may take to read, counted from the request's first file and waiting included, under the
// server's two-minute idle timeout so the request always gets a response
const EXTRACTION_TIME_LIMIT_MS = 90_000

// the file to extract: its content type, its bytes, when the request's time to read its files runs out, in
// performance.now milliseconds, and the user who sent it, whose files take their turns one at a time
type ExtractTextInChildProcessOptions = { contentType: string; bytes: Uint8Array; deadline: number; userId: string }

/**
 * Returns when the time to read a request's files runs out, for every file of that request to share.
 */
export function toExtractionDeadline(): number {
	return performance.now() + EXTRACTION_TIME_LIMIT_MS
}

/**
 * Returns an attached file's text, held to the attachment text limit, extracted in a child process once the user's
 * older files are read and a child process is free. Rejects with the error's message if the file cannot be read, and
 * with an AttachmentExtractionLimitError that names the limit if the deadline passes while the file waits, if the
 * deadline passes while it is read, or if its read passes the memory limit. A file past its deadline or the memory
 * limit stops only its own child process, and every other file is read by another one.
 */
export function extractTextInChildProcess({
	contentType,
	bytes,
	deadline,
	userId,
}: ExtractTextInChildProcessOptions): Promise<string> {
	return extractChatAttachmentText({ contentType, bytes, deadline, turnKey: userId })
}
