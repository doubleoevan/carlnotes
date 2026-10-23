// a scan note's read: started early and reused by the open, kept once its scan finished, and never stuck loading
import { expect, type Mock, mock, test } from "bun:test"
import { EMPTY_SCAN_NOTE, type ScanNote } from "@carlnotes/contracts/topics"
import { createScanNoteReader } from "./useScanNote"

// a finished scan's note
const SCAN_NOTE: ScanNote = { scanSummary: "Read 12 resources and kept 4.", sourceResults: null }

// a scan note fetch
type ReadScanNote = (scanId: string) => Promise<ScanNote>

// a reader over a spied fetch, with every note the reader shows, in order
type SpiedScanNoteReader = {
	readScanNoteSpy: Mock<ReadScanNote>
	shownScanNotes: (ScanNote | null)[]
	readScanNoteOnce: ReturnType<typeof createScanNoteReader>
}

// a reader over a spy of the given fetch
function toSpiedReader(readScanNote: ReadScanNote): SpiedScanNoteReader {
	// the spied fetch, and the notes the reader shows
	const readScanNoteSpy = mock(readScanNote)
	const shownScanNotes: (ScanNote | null)[] = []
	const readScanNoteOnce = createScanNoteReader({
		scanId: "scan-1",
		readScanNote: readScanNoteSpy,
		onScanNote: (scanNote) => shownScanNotes.push(scanNote),
	})
	return { readScanNoteSpy, shownScanNotes, readScanNoteOnce }
}

// wait for a read's promise chain to settle
async function settleReads(): Promise<void> {
	await Bun.sleep(0)
}

test("a hover then an open sends one request", async () => {
	const { readScanNoteSpy, shownScanNotes, readScanNoteOnce } = toSpiedReader(async () => SCAN_NOTE)

	// the pointer reaches the trigger, then the popover opens before the read returns
	readScanNoteOnce("succeeded")
	readScanNoteOnce("succeeded")
	await settleReads()

	// one request, and the popover shows its note
	expect(readScanNoteSpy).toHaveBeenCalledTimes(1)
	expect(shownScanNotes.at(-1)).toEqual(SCAN_NOTE)
})

test("a finished scan's note is kept, so a later open sends no request", async () => {
	const { readScanNoteSpy, readScanNoteOnce } = toSpiedReader(async () => SCAN_NOTE)

	// open the popover, let the read return, then open it again
	readScanNoteOnce("succeeded")
	await settleReads()
	readScanNoteOnce("failed")
	expect(readScanNoteSpy).toHaveBeenCalledTimes(1)
})

test("a note read while its scan runs is not kept, so the next open reads again", async () => {
	const { readScanNoteSpy, shownScanNotes, readScanNoteOnce } = toSpiedReader(async () => SCAN_NOTE)

	// read while the scan runs, then open again once it finished
	readScanNoteOnce("running")
	await settleReads()
	readScanNoteOnce("succeeded")
	await settleReads()

	// two requests, with the loading animation shown before each
	expect(readScanNoteSpy).toHaveBeenCalledTimes(2)
	expect(shownScanNotes).toEqual([null, SCAN_NOTE, null, SCAN_NOTE])
})

test("a rejected read shows the empty note instead of loading forever, and the next open reads again", async () => {
	const { readScanNoteSpy, shownScanNotes, readScanNoteOnce } = toSpiedReader(async () => {
		throw new Error("network down")
	})

	// keep the logged failure out of the test output
	const consoleErrorSpy = mock(() => {})
	const consoleError = console.error
	console.error = consoleErrorSpy

	// the read fails, then the user opens the popover again
	readScanNoteOnce("succeeded")
	await settleReads()
	readScanNoteOnce("succeeded")
	await settleReads()
	console.error = consoleError

	// the popover showed the empty note, which shows the placeholder line, and the second open read again
	expect(shownScanNotes.at(1)).toEqual(EMPTY_SCAN_NOTE)
	expect(readScanNoteSpy).toHaveBeenCalledTimes(2)
	expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
})
