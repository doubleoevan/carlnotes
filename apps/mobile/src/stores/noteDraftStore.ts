import { fetchNote, saveNoteBody } from "@carlnotes/client/noteClient"
import type { Note, NoteResponse } from "@carlnotes/contracts/notes"
import { type NoteBodySave, toNoteBodySave } from "@carlnotes/core/hooks/useNoteBodySave"
import {
	type NoteDraftContext,
	type NoteDraftRecord,
	parseNoteDrafts,
	serializeNoteDrafts,
	toDraftNote,
	toNoteDraftKey,
} from "@carlnotes/core/lib/noteDrafts"
import { toEventListeners } from "@carlnotes/core/stores/storeListeners"

export type NoteDraftStorage = {
	getItem: (key: string) => Promise<string | null>
	setItem: (key: string, value: string) => Promise<void>
	removeItem: (key: string) => Promise<void>
}
export type NoteDraftSnapshot = {
	notes: NoteDraftRecord[]
	hasStorageError: boolean
	unavailableIds: ReadonlySet<string>
}
export type NoteDraftStore = {
	accountId: string
	subscribe: (listener: () => void) => () => void
	getSnapshot: () => NoteDraftSnapshot
	restore: () => Promise<void>
	open: (note: NoteResponse, context: NoteDraftContext) => NoteBodySave | null
	release: (noteId: string) => void
	updateMetadata: (noteId: string, changes: Partial<Pick<Note, "name" | "visibility">>) => void
	remove: (noteId: string) => Promise<void>
	retryPending: () => Promise<void>
	retire: () => Promise<void>
	getRecoveredNote: (noteId: string) => NoteResponse | null
	flush: () => void
	settleStorage: () => Promise<void>
}

/**
 * Owns one account's draft controllers and ordered storage, independent of screen lifetimes.
 */
export function toNoteDraftStore({
	accountId,
	storage,
	canDispatch,
	saveBody = saveNoteBody,
	readNote = fetchNote,
}: {
	accountId: string
	storage: NoteDraftStorage
	canDispatch: () => boolean
	saveBody?: typeof saveNoteBody
	readNote?: typeof fetchNote
}): NoteDraftStore {
	// publish immutable snapshots while retaining one controller per note
	const key = toNoteDraftKey(accountId)
	const records = new Map<string, NoteDraftRecord>()
	const controllers = new Map<string, NoteBodySave>()
	const openCounts = new Map<string, number>()
	const metadata = new Map<string, Note>()
	const unavailableIds = new Set<string>()
	const { subscribe, announce } = toEventListeners<void>()
	let snapshot: NoteDraftSnapshot = { notes: [], hasStorageError: false, unavailableIds: new Set() }
	let isRetired = false
	let isRestored = false
	let restorePromise: Promise<void> | null = null
	let isRetrying = false
	let queuedWrite: string | undefined
	let writing: Promise<void> | null = null
	let retirement: Promise<void> | null = null

	// retain a failed write for the next edit or lifecycle event without a retry loop
	const publish = (hasStorageError = snapshot.hasStorageError): void => {
		snapshot = { notes: [...records.values()], hasStorageError, unavailableIds: new Set(unavailableIds) }
		announce()
	}
	async function drainWrites(): Promise<void> {
		while (queuedWrite !== undefined && !isRetired) {
			const serialized = queuedWrite
			queuedWrite = undefined
			try {
				await storage.setItem(key, serialized)
				if (!isRetired) {
					publish(false)
				}
			} catch {
				queuedWrite ??= serialized
				if (!isRetired) {
					publish(true)
				}
				break
			}
		}
	}
	function persist(): void {
		if (isRetired || !isRestored) {
			return
		}
		queuedWrite = serializeNoteDrafts([...records.values()])
		if (!writing) {
			writing = drainWrites().finally(() => {
				writing = null
				if (queuedWrite !== undefined && !snapshot.hasStorageError && !isRetired) {
					persist()
				}
			})
		}
	}

	// remove revoked or deleted text before another request can use it
	async function remove(noteId: string): Promise<void> {
		controllers.get(noteId)?.retire()
		controllers.delete(noteId)
		openCounts.delete(noteId)
		metadata.delete(noteId)
		records.delete(noteId)
		unavailableIds.add(noteId)
		publish()
		persist()
		await writing
	}

	// restore once and preserve unreadable storage
	function restore(): Promise<void> {
		restorePromise ??= (async () => {
			try {
				const restoredDrafts = parseNoteDrafts(await storage.getItem(key), accountId)
				if (isRetired) {
					return
				}
				for (const record of restoredDrafts) {
					records.set(record.note.id, record)
				}
				isRestored = true
				publish(false)
			} catch {
				publish(true)
			}
		})()
		return restorePromise
	}

	// require current edit permission or a confirmed offline edit grant
	function getController(note: NoteResponse, context: NoteDraftContext): NoteBodySave | null {
		if (isRetired || !isRestored || !note.canEdit || unavailableIds.has(note.id)) {
			return null
		}
		metadata.set(note.id, toNoteSummary(note))
		const existingController = controllers.get(note.id)
		if (existingController) {
			// refresh a clean controller's server baseline and preserve pending edits
			if (!existingController.getDraft().hasPendingChanges && existingController.getDraft().version !== note.version) {
				existingController.resolveConflict(note.html, note.version)
			}
			return existingController
		}
		const recoveredDraft = records.get(note.id)
		const controller = toNoteBodySave({
			noteId: note.id,
			html: note.html,
			version: note.version,
			pendingDraft: recoveredDraft?.draft,
			saveBody: (noteId, body) =>
				!isRetired && canDispatch() ? saveBody(noteId, body) : Promise.resolve({ status: "failed" }),
			onSaveError: (reason) => {
				if (reason === "unavailable") {
					void remove(note.id)
				}
			},
			onDraftChange: (draft) => {
				if (isRetired || unavailableIds.has(note.id)) {
					return
				}
				if (draft.hasPendingChanges) {
					records.set(note.id, { ...context, accountId, note: metadata.get(note.id) ?? toNoteSummary(note), draft })
				} else {
					records.delete(note.id)
					releaseCleanController(note.id)
				}
				publish()
				persist()
			},
		})
		controllers.set(note.id, controller)
		return controller
	}

	// retain mounted editors and pending saves. release clean controllers after the last editor closes
	function releaseCleanController(noteId: string): void {
		const controller = controllers.get(noteId)
		if (openCounts.has(noteId) || controller?.getDraft().hasPendingChanges) {
			return
		}
		controller?.retire()
		controllers.delete(noteId)
		metadata.delete(noteId)
	}
	function open(note: NoteResponse, context: NoteDraftContext): NoteBodySave | null {
		openCounts.set(note.id, (openCounts.get(note.id) ?? 0) + 1)
		const controller = getController(note, context)
		if (!controller) {
			release(note.id)
		}
		return controller
	}
	function release(noteId: string): void {
		const remainingOpenCount = (openCounts.get(noteId) ?? 1) - 1
		if (remainingOpenCount > 0) {
			openCounts.set(noteId, remainingOpenCount)
		} else {
			openCounts.delete(noteId)
		}
		controllers.get(noteId)?.flushSave()
		releaseCleanController(noteId)
	}

	// revalidate every closed or open pending note without adopting a newer server version
	async function retryPending(): Promise<void> {
		if (isRetired || isRetrying || !canDispatch()) {
			return
		}
		isRetrying = true
		try {
			await restore()
			persist()
			for (const record of [...records.values()]) {
				if (isRetired || !canDispatch()) {
					break
				}
				await retryNote(record)
			}
		} catch {
			// a transport failure retains every draft for a later lifecycle event
		} finally {
			isRetrying = false
		}
	}

	// do not turn a network failure into revoked access or let one failed read stop other notes
	async function retryNote(record: NoteDraftRecord): Promise<void> {
		try {
			const note = await readNote(record.note.id, { shouldThrowOnError: true })
			if (isRetired || !canDispatch()) {
				return
			}
			if (!note?.canEdit) {
				await remove(record.note.id)
				return
			}
			getController(note, record)?.retrySave()
		} catch {
			// retain the original draft until a later connection event
		}
	}

	// retirement fences callbacks synchronously, then drains an earlier write before removing its key
	async function retire(): Promise<void> {
		if (retirement) {
			return retirement
		}
		isRetired = true
		for (const controller of controllers.values()) {
			controller.retire()
		}
		controllers.clear()
		openCounts.clear()
		metadata.clear()
		records.clear()
		queuedWrite = undefined
		publish()
		retirement = (async () => {
			await writing
			await storage.removeItem(key)
		})()
		return retirement
	}
	return {
		accountId,
		subscribe,
		getSnapshot: () => snapshot,
		restore,
		open,
		release,
		updateMetadata: (noteId, changes) => {
			if (isRetired) {
				return
			}
			const note = metadata.get(noteId)
			if (note) {
				metadata.set(noteId, { ...note, ...changes })
			}
			const record = records.get(noteId)
			if (record) {
				records.set(noteId, { ...record, note: { ...record.note, ...changes } })
				publish()
				persist()
			}
		},
		remove,
		retryPending,
		retire,
		getRecoveredNote: (noteId: string) => {
			const record = records.get(noteId)
			return record ? toDraftNote(record) : null
		},
		flush: () => {
			persist()
			for (const controller of controllers.values()) {
				controller.flushSave()
			}
		},
		settleStorage: async () => {
			await writing
		},
	}
}

// keep stored metadata separate from the editor's durable HTML and original base version
function toNoteSummary({ html: _html, version: _version, ...note }: NoteResponse): Note {
	return note
}
