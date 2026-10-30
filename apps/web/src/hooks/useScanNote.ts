import { fetchScanNote } from "@carlnotes/client/topicClient"
import { EMPTY_SCAN_NOTE, type ScanNote, type TopicScan } from "@carlnotes/contracts/topics"
import { useState } from "react"

// a scan's status, which decides whether its note is kept
type ScanStatus = TopicScan["status"]

// one scan's note and the handlers that read it
export type ScanNoteState = {
	// the note once a read returns, and null while none has
	scanNote: ScanNote | null
	// the handlers that start the read before the popover opens, for the popover's trigger
	scanNoteTriggerProps: { onPointerEnter: () => void; onFocus: () => void; onTouchStart: () => void }
	// the popover's open change, which waits on a read already started or starts one
	handleScanNoteOpenChange: (isOpen: boolean) => void
}

// what a scan note reader reads, and where it puts the note
type CreateScanNoteReaderOptions = {
	scanId: string
	readScanNote: (scanId: string) => Promise<ScanNote>
	onScanNote: (scanNote: ScanNote | null) => void
}

/**
 * Returns a scan's note, read once its trigger is pointed at, focused, touched, or opened. A finished scan's note is
 * kept for the page's life.
 */
export function useScanNote(scan: { id: string; status: ScanStatus }): ScanNoteState {
	// the note shown, and the one reader that fills it for this scan
	const [scanNote, setScanNote] = useState<ScanNote | null>(null)
	const [readScanNoteOnce] = useState(() =>
		createScanNoteReader({ scanId: scan.id, readScanNote: fetchScanNote, onScanNote: setScanNote }),
	)

	// start the read with the scan's status at this moment
	const startScanNoteRead = (): void => readScanNoteOnce(scan.status)

	// start the read when the pointer reaches the trigger, the trigger takes focus, or a finger touches it
	const scanNoteTriggerProps = {
		onPointerEnter: startScanNoteRead,
		onFocus: startScanNoteRead,
		onTouchStart: startScanNoteRead,
	}

	// start the read when the popover opens, unless the trigger already started it
	const handleScanNoteOpenChange = (isOpen: boolean): void => {
		if (isOpen) {
			startScanNoteRead()
		}
	}
	return { scanNote, scanNoteTriggerProps, handleScanNoteOpenChange }
}

/**
 * Returns a function that reads one scan's note. It reuses a read already started, and it keeps a finished scan's
 * note. A running scan's note and a failed read are not kept, so the next call reads again.
 */
export function createScanNoteReader({
	scanId,
	readScanNote,
	onScanNote,
}: CreateScanNoteReaderOptions): (scanStatus: ScanStatus) => void {
	// the read started or kept, and null before the first read and after one that is not kept
	let scanNoteRead: Promise<void> | null = null
	return (scanStatus) => {
		// reuse a read already started or kept
		if (scanNoteRead) {
			return
		}

		// show the loading animation until the read returns. a running scan's note is not kept
		onScanNote(null)
		let isScanNoteKept = scanStatus !== "running"

		// read the note, and turn a failed read into the empty note, which is not kept either
		const settledScanNote = readScanNote(scanId).catch((error: unknown) => {
			console.error("scan note load failed", error)
			isScanNoteKept = false
			return EMPTY_SCAN_NOTE
		})

		// show the note, and let the next call read again if this note is not kept
		scanNoteRead = settledScanNote.then((scanNote) => {
			onScanNote(scanNote)
			if (!isScanNoteKept) {
				scanNoteRead = null
			}
		})
	}
}
