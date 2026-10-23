// extracting an attached file's text in one worker thread per process, so a large PDF, Word file, or workbook never
// stalls the event loop that serves every request and open stream. the worker thread reads one file at a time, in the
// order the files arrived

// how long a request's files may take to read, counted from the request's first file and waiting included, under the
// server's two-minute idle timeout so the request always gets a response
const EXTRACTION_TIME_LIMIT_MS = 90_000

// the file to extract: its content type, its bytes, and when the request's time to read its files runs out, in
// performance.now milliseconds
type ExtractTextInWorkerOptions = { contentType: string; bytes: Uint8Array; deadline: number }

// what the worker thread is asked: the request's id, the file's content type, and its bytes, transferred
export type ExtractionRequest = { requestId: number; contentType: string; bytes: ArrayBuffer }

// what the worker thread posts back: the request's id with the file's text, or with the error's message
export type ExtractionResult = { requestId: number; text: string } | { requestId: number; error: string }

// a file waiting for the worker thread or being read by it: its request, the timer for its deadline, and its resolve
// and reject functions
type PendingExtraction = {
	request: ExtractionRequest
	deadlineTimer: ReturnType<typeof setTimeout>
	resolve: (text: string) => void
	reject: (error: Error) => void
}

// the process's one worker thread, created for the first file and again after a stopped one
let extractionWorker: Worker | undefined

// the files waiting for the worker thread, oldest first, and the one it is reading
const queuedExtractions: PendingExtraction[] = []
let runningExtraction: PendingExtraction | undefined

// the id the next file is posted under
let nextRequestId = 0

/**
 * The error a file rejects with if its deadline passes while the worker thread reads it, or before it is posted: the
 * file is too large to read in time.
 */
export class AttachmentTimeLimitError extends Error {}

/**
 * The error a file rejects with if its deadline passes while it waits behind other files: the worker thread is busy.
 */
export class AttachmentBusyError extends Error {}

/**
 * Returns when the time to read a request's files runs out, for every file of that request to share.
 */
export function toExtractionDeadline(): number {
	return performance.now() + EXTRACTION_TIME_LIMIT_MS
}

/**
 * Returns an attached file's text, held to the attachment text limit, extracted in the worker thread once the files
 * ahead of it are read. The bytes are transferred to the worker thread, so the caller must not read them afterwards.
 * Rejects with the error's message if the file cannot be read, with an AttachmentBusyError if the deadline passes
 * while it waits, and with an AttachmentTimeLimitError if the deadline passes while it is read. A file past its deadline stops only its own read, and the files behind it go to a new worker thread.
 */
export function extractTextInWorker({ contentType, bytes, deadline }: ExtractTextInWorkerOptions): Promise<string> {
	// a file whose request is already out of time rejects at once, so the worker thread is never stopped for it
	if (deadline <= performance.now()) {
		return Promise.reject(toTimeLimitError())
	}

	// the request, with the bytes' own buffer, or a copy of the view's bytes if it shares a larger one
	const ownBuffer =
		bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer
	const request: ExtractionRequest = { requestId: nextRequestId++, contentType, bytes: ownBuffer as ArrayBuffer }

	// queue the file, with a timer that rejects it wherever it is once the deadline passes
	return new Promise<string>((resolve, reject) => {
		const deadlineTimer = setTimeout(
			() => rejectPastDeadline(request.requestId),
			Math.max(0, deadline - performance.now()),
		)
		queuedExtractions.push({ request, deadlineTimer, resolve, reject })
		startNextExtraction()
	})
}

// post the oldest waiting file to the worker thread, if the worker thread is free
function startNextExtraction(): void {
	if (runningExtraction) {
		return
	}

	// take the oldest waiting file, if there is one
	runningExtraction = queuedExtractions.shift()
	if (!runningExtraction) {
		return
	}

	// transfer the bytes, so the copy is never made. a request the worker thread cannot take rejects, and the next file
	// starts
	const { request } = runningExtraction
	try {
		loadExtractionWorker().postMessage(request, [request.bytes])
	} catch (error) {
		finishRunningExtraction((pendingExtraction) =>
			pendingExtraction.reject(error instanceof Error ? error : new Error(String(error))),
		)
	}
}

// reject a file whose deadline passed. a waiting file leaves the queue as busy, and the file being read stops the
// worker thread as too large, so the next file starts on a new one
function rejectPastDeadline(requestId: number): void {
	// a waiting file leaves the queue
	const queueIndex = queuedExtractions.findIndex((queued) => queued.request.requestId === requestId)
	if (queueIndex >= 0) {
		queuedExtractions
			.splice(queueIndex, 1)[0]
			?.reject(new AttachmentBusyError("the worker thread was reading other files"))
		return
	}

	// the file being read stops the worker thread
	if (runningExtraction?.request.requestId === requestId) {
		stopExtractionWorker()
		finishRunningExtraction((pendingExtraction) => pendingExtraction.reject(toTimeLimitError()))
	}
}

// the running worker thread, or a new one whose results finish the files they name
function loadExtractionWorker(): Worker {
	if (extractionWorker) {
		return extractionWorker
	}

	// start the worker thread from its own file beside this one, unreferenced so it never keeps the process alive
	const worker = new Worker(new URL("./attachmentExtractionWorker.ts", import.meta.url).href, { ref: false })

	// finish the file being read: a result with text resolves, and a result with an error rejects
	worker.onmessage = ({ data }: MessageEvent<ExtractionResult>) => {
		if (runningExtraction?.request.requestId !== data.requestId) {
			return
		}
		finishRunningExtraction((pendingExtraction) =>
			"text" in data ? pendingExtraction.resolve(data.text) : pendingExtraction.reject(new Error(data.error)),
		)
	}

	// a worker thread that fails or exits on its own stops, rejects the file it was reading, and the next file starts on
	// a new one. a worker thread this module stopped is gone already, so its close changes nothing
	const failExtractionWorker = (reason: string): void => {
		if (extractionWorker === worker) {
			stopExtractionWorker()
			finishRunningExtraction((pendingExtraction) => pendingExtraction.reject(new Error(reason)))
		}
	}
	worker.onerror = (event) => failExtractionWorker(`the extraction worker failed: ${event.message}`)
	worker.addEventListener("close", () => failExtractionWorker("the extraction worker exited"))

	// the worker thread that every next file is posted to
	extractionWorker = worker
	return worker
}

// finish the file being read, clear its deadline, and start the next one
function finishRunningExtraction(finish: (pendingExtraction: PendingExtraction) => void): void {
	const finishedExtraction = runningExtraction
	runningExtraction = undefined
	if (finishedExtraction) {
		clearTimeout(finishedExtraction.deadlineTimer)
		finish(finishedExtraction)
	}

	// the worker thread is free for the next file
	startNextExtraction()
}

// the error a file not read before its deadline rejects with
function toTimeLimitError(): AttachmentTimeLimitError {
	return new AttachmentTimeLimitError("the attachment's text was not read before its deadline")
}

// stop the worker thread, so the next file starts a new one
function stopExtractionWorker(): void {
	extractionWorker?.terminate()
	extractionWorker = undefined
}
