import { sendImportConversations } from "@carlnotes/client/personalSourcesClient"
import { TOPIC_ATTACHMENT_MAX_BYTES } from "@carlnotes/contracts/attachmentTypes"
import { useEffect, useRef, useState } from "react"
import type { PersonalSourcesExportPreview } from "@/lib/personalSourcesExport"
import { toSelectedPersonalSourcesImport } from "@/lib/personalSourcesImportSelection"

// a worker owns parse buffers until its response or explicit cancellation
type ImportState = { status: "idle" | "parsing" } | { status: "preview"; preview: PersonalSourcesExportPreview }
type PersonalSourcesImportState = {
	state: ImportState
	error: string | null
	isImporting: boolean
	parseFile: (file: File) => Promise<void>
	parseText: (input: { title: string; text: string }) => void
	reset: () => void
	importSelected: (selectedIds: Set<string>) => Promise<boolean>
}

/**
 * Parses locally in a disposable worker and uploads only an explicitly selected, bounded batch.
 */
export function usePersonalSourcesImport(topicId: string): PersonalSourcesImportState {
	// every replacement and unmount retires asynchronous file and worker replies
	const worker = useRef<Worker | null>(null)
	const generation = useRef(0)
	const isSending = useRef(false)
	const retry = useRef<{ selection: string; requestId: string } | null>(null)
	const [state, setState] = useState<ImportState>({ status: "idle" })
	const [error, setError] = useState<string | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	useEffect(
		() => () => {
			generation.current += 1
			worker.current?.terminate()
			worker.current = null
		},
		[],
	)
	const reset = (): void => {
		generation.current += 1
		worker.current?.terminate()
		worker.current = null
		setState({ status: "idle" })
		setError(null)
		retry.current = null
	}

	// transfer binary input instead of keeping another copy on the UI thread
	const parse = (input: { bytes: ArrayBuffer } | { title: string; text: string }): void => {
		const requestGeneration = generation.current
		try {
			worker.current = new Worker(new URL("../lib/personalSourcesExport.worker.ts", import.meta.url), {
				type: "module",
			})
			worker.current.onmessage = (
				event: MessageEvent<
					{ status: "ready"; preview: PersonalSourcesExportPreview } | { status: "error"; message: string }
				>,
			) => {
				if (generation.current !== requestGeneration) {
					return
				}
				worker.current?.terminate()
				worker.current = null
				if (event.data.status === "ready") {
					setState({ status: "preview", preview: event.data.preview })
				} else {
					setState({ status: "idle" })
					setError(event.data.message)
				}
			}
			worker.current.onerror = (): void => {
				reset()
				setError("The export could not be read. Try a smaller export or paste a transcript.")
			}
			worker.current.postMessage(input, "bytes" in input ? [input.bytes] : [])
		} catch {
			reset()
			setError("Local export parsing is unavailable in this browser.")
		}
	}
	const parseFile = async (file: File): Promise<void> => {
		reset()
		if (file.size > TOPIC_ATTACHMENT_MAX_BYTES) {
			setError("Choose a file of at most 10 MiB.")
			return
		}
		const requestGeneration = generation.current
		setState({ status: "parsing" })
		try {
			const bytes = await file.arrayBuffer()
			if (generation.current === requestGeneration) {
				parse({ bytes })
			}
		} catch {
			if (generation.current === requestGeneration) {
				reset()
				setError("That file could not be read.")
			}
		}
	}
	const parseText = (input: { title: string; text: string }): void => {
		reset()
		setState({ status: "parsing" })
		parse(input)
	}

	// keep one retry id while a preview remains open, including after a lost response
	const importSelected = async (selectedIds: Set<string>): Promise<boolean> => {
		if (state.status !== "preview" || isSending.current) {
			return false
		}
		isSending.current = true
		setIsImporting(true)
		setError(null)
		try {
			// keep retries stable until the owner deliberately changes the selected conversations
			const selection = JSON.stringify([...selectedIds].sort())
			if (!retry.current || retry.current.selection !== selection) {
				retry.current = { selection, requestId: crypto.randomUUID() }
			}
			const payload = toSelectedPersonalSourcesImport({
				preview: state.preview,
				selectedIds,
				requestId: retry.current.requestId,
			})
			const receipt = await sendImportConversations({ topicId, payload })
			if (receipt.status !== "accepted") {
				throw new Error("import refused")
			}
			reset()
			return true
		} catch {
			setError(
				"The selected conversations could not be imported. Select at most 10 MiB, check your Source slots, and try again.",
			)
			return false
		} finally {
			isSending.current = false
			setIsImporting(false)
		}
	}
	return { state, error, isImporting, parseFile, parseText, reset, importSelected }
}
