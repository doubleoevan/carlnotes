// an attachment's extraction in a child process under a memory limit, so a file whose read takes too much memory
// ends its own child process and nothing else. a few child processes run at once, each reading one file. a caller
// names each file's sender, the user who sent it or the Topic it is attached to. no two child processes read one
// sender's files at once, and the files that wait are taken in turn by sender
import { mkdtempSync, rmSync } from "node:fs"
import { setPriority, tmpdir } from "node:os"
import { join } from "node:path"
import { ATTACHMENT_NO_TEXT_REASON, MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { AttachmentValidationError } from "./attachContentType"
import { CHUNK_CHARS, chunk, MAX_CHUNKS } from "./chunk"

// the most resident memory an extraction's child process may take. the largest reads measured, a 10 MB PDF read to
// its last page and a 9 MB workbook of text, took under 500 MB, and two child processes at this limit fit in the
// api's 2 GB beside the api
const EXTRACTION_MEMORY_LIMIT_BYTES = 640 * 1024 * 1024

// how many child processes read files at once in one process
const MAX_CHILD_PROCESSES = 2

// the file each child process runs, beside this one
const CHILD_PROCESS_PATH = Bun.fileURLToPath(new URL("./attachExtractionChild.ts", import.meta.url))

// the scheduling priority a child process runs at, the lowest, so a read takes only the processor time that the
// process serving requests leaves
const CHILD_PROCESS_PRIORITY = 19

// the settings a child process reads, the only part of this process's environment it gets
const CHILD_PROCESS_SETTING_NAMES = ["MAX_CHUNKS", "CHUNK_CHARS"] as const

// the most characters of a document that are summarized, so that chunk payloads stay well under Temporal's
// per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS

// what each limit that ends an extraction says: the file's time ran out while it waited for a child process, its time
// ran out while a child process read it, or its read took more memory than a child process may
const EXTRACTION_LIMIT_MESSAGES = {
	wait: "the attachment waited behind other files until its deadline",
	time: "the attachment's text was not read before its deadline",
	memory: "the attachment's read passed the memory limit",
}

// what a Topic keeps of an attachment's text: the chunks to summarize, the text's whole length, and the context
// stored as written, which is null for a text that is summarized
export type ExtractedAttachment = { chunks: string[]; charCount: number; verbatimContext: string | null }

// what a child process is asked: whether a chat or a Topic reads the file, the file's content type, name, and bytes,
// and the most resident memory the child process may take
export type AttachmentExtractionRequest = {
	purpose: "chat" | "topic"
	contentType: string
	filename: string
	bytes: Uint8Array
	memoryLimitBytes: number
}

// what a child process says: that it is ready for its request, what it extracted, the reason it rejects the file
// itself, or the reason its read failed
export type AttachmentExtractionReply =
	| { status: "ready" }
	| { status: "extracted"; extraction: string | ExtractedAttachment }
	| { status: "rejected"; reason: string }
	| { status: "failed"; reason: string }

// a file to extract and the limits it is read within: the key of the sender whose turn it takes, when its time runs
// out, in performance.now milliseconds and waiting included, and the most resident memory its child process may take
type ExtractAttachmentOptions = {
	contentType: string
	bytes: Uint8Array
	turnKey: string
	deadline: number
	memoryLimitBytes?: number
}

// a file waiting for a child process: the request its child process is sent, the sender whose turn it takes, when its
// time runs out, the timer that rejects it if it still waits then, and its promise's resolve and reject
type WaitingExtraction = {
	request: AttachmentExtractionRequest
	turnKey: string
	deadline: number
	deadlineTimer: ReturnType<typeof setTimeout>
	resolve: (extraction: string | ExtractedAttachment) => void
	reject: (error: Error) => void
}

// the files waiting for a child process by sender, each sender's oldest first, with the senders in the order their
// turns come, and the senders whose file a child process is reading
const waitingExtractionsByTurnKey = new Map<string, WaitingExtraction[]>()
const readingTurnKeys = new Set<string>()

/**
 * The error an extraction rejects with if a limit ends it. It names the limit: the file waited for a child process
 * until its deadline, a child process read it until its deadline, or its read passed the memory limit.
 */
export class AttachmentExtractionLimitError extends Error {
	constructor(readonly limit: keyof typeof EXTRACTION_LIMIT_MESSAGES) {
		super(EXTRACTION_LIMIT_MESSAGES[limit])
	}
}

/**
 * Returns the text a chat reads from an attached file, held to the attachment text limit, extracted in a child
 * process. Rejects with an AttachmentValidationError for a file that cannot be read as its type, with an
 * AttachmentExtractionLimitError if a limit ends the read, and with the read's own error if it fails.
 */
export function extractChatAttachmentText(extractAttachmentOptions: ExtractAttachmentOptions): Promise<string> {
	return queueExtraction({ ...extractAttachmentOptions, purpose: "chat", filename: "" }) as Promise<string>
}

/**
 * Returns what a Topic keeps of an attached file's text, extracted in a child process: table text or a short document
 * as written, or a longer document's chunks to summarize. Rejects as extractChatAttachmentText does, and with an
 * AttachmentValidationError for a file with no text.
 */
export function extractTopicAttachment(
	extractAttachmentOptions: ExtractAttachmentOptions & { filename: string },
): Promise<ExtractedAttachment> {
	return queueExtraction({ ...extractAttachmentOptions, purpose: "topic" }) as Promise<ExtractedAttachment>
}

/**
 * Returns what a Topic keeps of a document's text: the text as written if it is short, or its chunks to summarize.
 * Rejects a text with nothing to read.
 */
export function toExtractedAttachment(extractedText: string): ExtractedAttachment {
	if (!extractedText.trim()) {
		throw toNoTextError()
	}

	// a short document is its own context, with no model call
	if (extractedText.length <= MAX_ATTACHMENT_CONTEXT_CHARS) {
		return { chunks: [], charCount: extractedText.length, verbatimContext: extractedText }
	}

	// a longer document is cut to the processing limit, with the cut marked
	const markedText =
		extractedText.length > MAX_PROCESS_CHARS
			? `${extractedText.slice(0, MAX_PROCESS_CHARS)}${toCutMarker(extractedText.length)}`
			: extractedText

	// chunk the text to summarize
	const chunks = chunk(markedText, MAX_CHUNKS, CHUNK_CHARS)
	return { chunks, charCount: extractedText.length, verbatimContext: null }
}

/**
 * Returns the rejection of a file with no readable text, like a scanned PDF or a chart-only workbook.
 */
export function toNoTextError(): AttachmentValidationError {
	return new AttachmentValidationError(ATTACHMENT_NO_TEXT_REASON)
}

// the line appended where a long document was cut
function toCutMarker(fullLength: number): string {
	const keptChars = MAX_PROCESS_CHARS.toLocaleString("en-US")
	return `\n\n[The document is cut here. It runs ${fullLength.toLocaleString("en-US")} characters and only the first ${keptChars} are included.]`
}

// a file to extract, what it is for, and the limits it is read within
type QueueExtractionOptions = ExtractAttachmentOptions & Pick<AttachmentExtractionRequest, "purpose" | "filename">

// queue a file for a child process, and return what its child process extracts
function queueExtraction({
	turnKey,
	deadline,
	memoryLimitBytes = EXTRACTION_MEMORY_LIMIT_BYTES,
	...file
}: QueueExtractionOptions): Promise<string | ExtractedAttachment> {
	// a file whose time is already out rejects at once, and no child process starts for it
	if (deadline <= performance.now()) {
		return Promise.reject(new AttachmentExtractionLimitError("time"))
	}

	// the file waits behind its sender's older files, with a timer that rejects it if it still waits at its deadline
	return new Promise((resolve, reject) => {
		const waitingExtraction: WaitingExtraction = {
			request: { ...file, bytes: toOwnBytes(file.bytes), memoryLimitBytes },
			turnKey,
			deadline,
			deadlineTimer: setTimeout(() => rejectWaitingExtraction(waitingExtraction), deadline - performance.now()),
			resolve,
			reject,
		}
		const turnExtractions = waitingExtractionsByTurnKey.get(turnKey) ?? []
		waitingExtractionsByTurnKey.set(turnKey, [...turnExtractions, waitingExtraction])
		startWaitingExtractions()
	})
}

// a file's bytes with a buffer of their own, copied out of a larger buffer. a request sends the whole buffer behind
// the bytes it names
function toOwnBytes(bytes: Uint8Array): Uint8Array {
	return bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice()
}

// reject a file whose time ran out while it waited, and take it out of the wait
function rejectWaitingExtraction(waitingExtraction: WaitingExtraction): void {
	// the sender's other waiting files keep the sender's turn
	const { turnKey } = waitingExtraction
	const turnExtractions = waitingExtractionsByTurnKey.get(turnKey) ?? []
	const otherExtractions = turnExtractions.filter((turnExtraction) => turnExtraction !== waitingExtraction)
	waitingExtractionsByTurnKey.set(turnKey, otherExtractions)

	// a sender with no file left waiting has no turn to take
	if (otherExtractions.length === 0) {
		waitingExtractionsByTurnKey.delete(turnKey)
	}
	waitingExtraction.reject(new AttachmentExtractionLimitError("wait"))
}

// start a child process for each waiting file there is room for
function startWaitingExtractions(): void {
	while (readingTurnKeys.size < MAX_CHILD_PROCESSES) {
		const waitingExtraction = takeWaitingExtraction()
		if (!waitingExtraction) {
			return
		}

		// the file is no longer waiting, so its deadline now stops its child process
		const { turnKey, resolve, reject } = waitingExtraction
		clearTimeout(waitingExtraction.deadlineTimer)
		readingTurnKeys.add(turnKey)

		// the child process's end frees its place for the next waiting file
		void readInChildProcess(waitingExtraction)
			.then(resolve, reject)
			.finally(() => {
				readingTurnKeys.delete(turnKey)
				startWaitingExtractions()
			})
	}
}

// take the oldest waiting file of the first sender in turn who has no file being read
function takeWaitingExtraction(): WaitingExtraction | undefined {
	for (const [turnKey, turnExtractions] of waitingExtractionsByTurnKey) {
		if (readingTurnKeys.has(turnKey)) {
			continue
		}

		// the sender's later files wait for the sender's next turn, behind every other sender's
		const [waitingExtraction, ...laterExtractions] = turnExtractions
		waitingExtractionsByTurnKey.delete(turnKey)
		if (laterExtractions.length > 0) {
			waitingExtractionsByTurnKey.set(turnKey, laterExtractions)
		}

		// the sender's oldest file is the one to read
		return waitingExtraction
	}
	return undefined
}

// read one file in a child process of its own, and return what the child process extracts. the child process ends
// with its file, whether it replied, ran past the file's deadline, or exited
function readInChildProcess({ request, deadline }: WaitingExtraction): Promise<string | ExtractedAttachment> {
	return new Promise((resolve, reject) => {
		// a folder of the child process's own for any file a reader writes while it unpacks, removed with the child
		// process, because a child process that is killed removes nothing itself
		const temporaryFolder = mkdtempSync(join(tmpdir(), "attachment-extraction-"))

		// settle with whichever comes first: the reply, the deadline, or the exit
		let isSettled = false
		const settle = (settlePromise: () => void): void => {
			if (isSettled) {
				return
			}

			// stop the deadline's timer and the child process, and remove what it wrote
			isSettled = true
			clearTimeout(deadlineTimer)
			childProcess.kill("SIGKILL")
			rmSync(temporaryFolder, { recursive: true, force: true })
			settlePromise()
		}

		// send the request once the child process is ready for it. a request that cannot be sent rejects
		const sendRequest = (): void => {
			try {
				childProcess.send(request)
			} catch (error) {
				settle(() => reject(error instanceof Error ? error : new Error(String(error))))
			}
		}

		// settle with what the child process extracted, or with why it did not
		const settleWithReply = (reply: Exclude<AttachmentExtractionReply, { status: "ready" }>): void =>
			settle(() => (reply.status === "extracted" ? resolve(reply.extraction) : reject(toReplyError(reply))))

		// the child process says it is ready, then replies, or exits without a reply. it reads a stranger's file, so of
		// this process's environment, which holds every secret, it gets its own settings alone
		const childProcess = Bun.spawn([process.execPath, CHILD_PROCESS_PATH], {
			env: toChildProcessEnvironment(temporaryFolder),
			stdio: ["ignore", "inherit", "inherit"],
			serialization: "advanced",
			ipc: (reply: AttachmentExtractionReply) => (reply.status === "ready" ? sendRequest() : settleWithReply(reply)),
		})

		// a child process still reading at the file's deadline is stopped
		const deadlineTimer = setTimeout(
			() => settle(() => reject(new AttachmentExtractionLimitError("time"))),
			deadline - performance.now(),
		)
		lowerChildProcessPriority(childProcess.pid)

		// the exit is read from the child process's promise, which settles after the timer and the child process are
		// set. an exit callback may run before the spawn returns
		void childProcess.exited.then(() => settle(() => reject(toExitError(childProcess))))
	})
}

// a child process's environment: the folder its temporary files go to, and the settings it reads if they are set
function toChildProcessEnvironment(temporaryFolder: string): Record<string, string> {
	const childProcessEnvironment: Record<string, string> = { TMPDIR: temporaryFolder }

	// pass each setting on that this process has
	for (const settingName of CHILD_PROCESS_SETTING_NAMES) {
		const setting = Bun.env[settingName]
		if (setting !== undefined) {
			childProcessEnvironment[settingName] = setting
		}
	}
	return childProcessEnvironment
}

// run a child process at the lowest priority. a system that does not allow the change leaves the priority as it is,
// and so does a child process that has already exited
function lowerChildProcessPriority(processId: number): void {
	try {
		setPriority(processId, CHILD_PROCESS_PRIORITY)
	} catch {
		// the read goes on at this process's own priority
	}
}

// the error a child process's reply rejects with: a rejection of the file itself, or a failed read
function toReplyError(reply: { status: "rejected" | "failed"; reason: string }): Error {
	return reply.status === "rejected" ? new AttachmentValidationError(reply.reason) : new Error(reply.reason)
}

// the error a child process that exited without a reply rejects with. a kill is the memory watchdog's, or the
// kernel's for a process that takes too much memory, and any other exit is a failed read
function toExitError(exitedProcess: Pick<Bun.Subprocess, "exitCode" | "signalCode">): Error {
	if (exitedProcess.signalCode === "SIGKILL") {
		return new AttachmentExtractionLimitError("memory")
	}
	return new Error(`the extraction's child process exited with code ${exitedProcess.exitCode}`)
}
