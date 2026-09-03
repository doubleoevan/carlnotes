// picker agreement test: every file the chat composers offer is one the chat attachment path takes
import { expect, test } from "bun:test"
import { CHAT_FILE_PICKER_ACCEPT, FILE_PICKER_ACCEPT } from "@/lib/utils"
import {
	DOCUMENT_FILE_SUFFIXES,
	DOCUMENT_FILE_TYPES,
	TEXT_FILE_SUFFIXES,
	toAttachment,
	VIDEO_FILE_TYPES,
} from "./useChatAttachments"

// whether one picker accept entry names a file toAttachment takes: an image, a pdf, a document, text, or a video
function isAcceptedByChat(acceptEntry: string): boolean {
	// a mime entry matches the type checks, and an extension entry matches the suffix checks
	if (acceptEntry.startsWith(".")) {
		return (
			acceptEntry === ".pdf" || TEXT_FILE_SUFFIXES.includes(acceptEntry) || DOCUMENT_FILE_SUFFIXES.includes(acceptEntry)
		)
	}

	// the wildcard and exact mimes toAttachment's own branches take
	return (
		acceptEntry === "image/*" ||
		acceptEntry === "application/pdf" ||
		acceptEntry === "text/*" ||
		DOCUMENT_FILE_TYPES.includes(acceptEntry) ||
		VIDEO_FILE_TYPES.includes(acceptEntry)
	)
}

// widening the topic picker must never widen chat, so every chat entry is one the chat path accepts
test("every type the chat picker offers is one the chat path accepts", () => {
	for (const acceptEntry of CHAT_FILE_PICKER_ACCEPT.split(",")) {
		expect({ acceptEntry, isAccepted: isAcceptedByChat(acceptEntry) }).toEqual({ acceptEntry, isAccepted: true })
	}
})

// both pickers offer the OOXML types now, since chat extracts them the same way a topic attachment does
test("both pickers offer docx and xlsx", () => {
	for (const picker of [FILE_PICKER_ACCEPT, CHAT_FILE_PICKER_ACCEPT]) {
		expect(picker).toContain(".docx")
		expect(picker).toContain(".xlsx")
	}
})

// the data url conversion runs in the browser, so the routing test stands in for its one browser api
class StubFileReader {
	result = ""
	onload: (() => void) | null = null
	onerror: (() => void) | null = null
	readAsDataURL(file: File): void {
		this.result = `data:${file.type || "application/octet-stream"};base64,AQID`
		this.onload?.()
	}
}

// a word file and a workbook post their bytes, so the server can pull the words out like a pdf's
test("toAttachment posts a docx and an xlsx as document attachments", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: the stub stands in for the browser's own FileReader
	;(globalThis as any).FileReader = StubFileReader
	const docx = new File([new Uint8Array([1, 2, 3])], "manuscript.docx", { type: DOCUMENT_FILE_TYPES[0] })
	const xlsx = new File([new Uint8Array([4, 5, 6])], "sales.xlsx", { type: DOCUMENT_FILE_TYPES[1] })

	// each one comes back as a document sending its own bytes, since the server pulls the words out of them
	for (const file of [docx, xlsx]) {
		expect(await toAttachment(file)).toEqual({
			kind: "document",
			name: file.name,
			dataUrl: `data:${file.type};base64,AQID`,
			keep: false,
		})
	}

	// a file the browser hands over with no type at all still routes on its suffix
	expect(await toAttachment(new File([new Uint8Array([7])], "notes.docx", { type: "" }))).toEqual({
		kind: "document",
		name: "notes.docx",
		dataUrl: "data:application/octet-stream;base64,AQID",
		keep: false,
	})
})
