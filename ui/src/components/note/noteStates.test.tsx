// the three-state contract: the default table render doesn't stream and loads no editor code,
// and the stream exists exactly while the provider is connected
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import * as Y from "yjs"
import { NotesTable } from "./NotesTable"
import type { NoteStreamHandlers, NoteTransport } from "./noteProvider"
import { NoteProvider } from "./noteProvider"

// the default render of the note table opens no stream and fetches nothing
test("the table render opens no stream and no request", () => {
	// count every stream and request the render would open
	let openedStreams = 0
	let requests = 0
	const eventSourceBefore = globalThis.EventSource
	const fetchBefore = globalThis.fetch
	globalThis.EventSource = class {
		constructor() {
			openedStreams += 1
		}
	} as unknown as typeof EventSource
	globalThis.fetch = (async () => {
		requests += 1
		return new Response("{}")
	}) as unknown as typeof fetch

	// the table renders its rows alone, no note bodies
	try {
		const html = renderToStaticMarkup(
			<NotesTable
				notes={[
					{
						id: "n1",
						name: "Beans",
						visibility: "team",
						createdAt: "2026-08-01T00:00:00.000Z",
						updatedAt: "2026-08-20T00:00:00.000Z",
						canEdit: true,
						isTopicOwner: false,
						canDelete: false,
					},
				]}
				onOpenNote={() => {}}
			/>,
		)
		expect(html).toContain("Beans")
	} finally {
		globalThis.EventSource = eventSourceBefore
		globalThis.fetch = fetchBefore
	}

	// nothing connected and nothing fetched
	expect(openedStreams).toBe(0)
	expect(requests).toBe(0)
})

// the provider's stream exists exactly between connect and disconnect
test("connect opens the stream and disconnect closes it", () => {
	// a transport that counts opens and closes
	let opened = 0
	let closed = 0
	const transport: NoteTransport = {
		openStream: (_noteId: string, _handlers: NoteStreamHandlers) => {
			opened += 1
			return () => {
				closed += 1
			}
		},
		fetchDiff: async () => null,
		sendUpdate: async () => true,
	}

	// connect opens once, a repeat connect is a no-op, disconnect closes
	const ydoc = new Y.Doc()
	const provider = new NoteProvider("n1", ydoc, () => {}, transport)
	provider.connect()
	provider.connect()
	expect(opened).toBe(1)
	provider.disconnect()
	expect(closed).toBe(1)
	provider.destroy()
})

// the editor chunk stays out of the default path: the dialog reaches it only through a dynamic import
test("the dialog module never imports blocknote statically", async () => {
	// the dynamic import is what keeps the editor in its own chunk
	const dialogSource = await Bun.file(new URL("./NoteDialog.tsx", import.meta.url)).text()
	expect(dialogSource).toContain('lazy(() => import("./NoteEditor"))')
	expect(dialogSource).not.toMatch(/^import .*@blocknote/m)
})
