import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import {
	CreateNote,
	type CreateNoteElements,
	type NoteNameInputProps,
	type NoteVisibilitySelectProps,
} from "@carlnotes/core/components/CreateNote"
import {
	type NoteCommentComposerProps,
	NoteComments,
	type NoteCommentsElements,
} from "@carlnotes/core/components/NoteComments"
import type { NoteConflictNoticeProps } from "@carlnotes/core/components/NoteConflictNotice"
import { NoteEditor, type NoteEditorElements, type NoteEditorInputProps } from "@carlnotes/core/components/NoteEditor"
import { NoteToolbar } from "@carlnotes/core/components/NoteToolbar"
import { toNoteBodySave } from "@carlnotes/core/hooks/useNoteBodySave"
import { useNoteLink } from "@carlnotes/core/hooks/useNoteLink"
import type { NoteEditorCommands } from "@carlnotes/core/lib/noteFormats"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// keep each test's browser environment and transport isolated
const cleanups: (() => Promise<void>)[] = []
const originalFetch = globalThis.fetch
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})
const THREAD = {
	comments: [],
	isLoading: false,
	hasError: false,
	retry: () => {},
	postNoteComment: async () => true,
	deleteNoteComment: async () => true,
}

test("shared formatting keeps every label, active state and blocking state", () => {
	const html = renderToStaticMarkup(
		<NoteToolbar
			editorRef={{ current: null }}
			selection={{ start: 0, end: 0, text: "" }}
			activeLink={null}
			formatState={{ bold: { isActive: true, isBlocking: false }, h1: { isActive: false, isBlocking: true } }}
			elements={{
				Container: ({ children }) => <div>{children}</div>,
				Divider: () => <hr />,
				Button: ({ label, isPressed, isDisabled }) => (
					<button type="button" aria-pressed={isPressed} disabled={isDisabled}>
						{label}
					</button>
				),
				LinkControl: ({ isLinkBlocked }) => (
					<button type="button" disabled={isLinkBlocked}>
						Add link
					</button>
				),
			}}
		/>,
	)
	expect(html).toContain('aria-pressed="true">Bold')
	expect(html).toContain('disabled="">Heading 1')
	for (const label of [
		"Italic",
		"Underline",
		"Strikethrough",
		"Inline code",
		"Heading 2",
		"Heading 3",
		"Bulleted list",
		"Numbered list",
		"Checklist",
		"Quote",
		"Code block",
		"Add link",
	]) {
		expect(html).toContain(label)
	}
})

test("link entry preserves the intended range and refuses unsafe destinations", async () => {
	const applied: unknown[][] = []
	const removed: unknown[][] = []
	const editor = {
		setLink: (...args: unknown[]) => applied.push(args),
		removeLink: (...args: unknown[]) => removed.push(args),
	} as unknown as NoteEditorCommands
	let selection = { start: 2, end: 7, text: "words" }
	let activeLink: (typeof selection & { url: string }) | null = null
	const harness = await renderTestHook(() =>
		useNoteLink({ editorRef: { current: editor }, selection, activeLink, isLinkActive: activeLink !== null }),
	)
	cleanups.push(harness.close)
	await act(async () => harness.read().handleOpenChange(true))
	selection = { start: 0, end: 0, text: "" }
	await harness.render()
	await act(async () => harness.read().setUrl("javascript:alert(1)"))
	expect(harness.read().canApply).toBe(false)
	await act(async () => harness.read().handleApplyLink())
	expect(applied).toEqual([])
	await act(async () => harness.read().setUrl("carlnotes.com"))
	await act(async () => harness.read().handleApplyLink())
	expect(applied).toEqual([[2, 7, "words", "https://carlnotes.com/"]])

	// editing and removal keep the old link's range even after its selection changes
	activeLink = { start: 10, end: 15, text: "other", url: "https://example.com" }
	await harness.render()
	await act(async () => harness.read().handleOpenChange(true))
	expect(harness.read().linkLabel).toBe("Edit link")
	expect(harness.read().openUrl).toBe("https://example.com/")
	activeLink = null
	await harness.render()
	await act(async () => harness.read().handleRemoveLink())
	expect(removed).toEqual([[10, 15]])
})

test("shared editor ignores mount normalization and preserves conflict text after failed Reload", async () => {
	let input: NoteEditorInputProps | undefined
	let notice: NoteConflictNoticeProps | undefined
	const changedValues: string[] = []
	const errors: string[] = []
	const sent: string[] = []
	const controller = toNoteBodySave({
		noteId: "note-1",
		html: "<p>Stored words</p>",
		version: 3,
		onSaveError: () => {},
		saveBody: async (_id, body) => {
			sent.push(body.html)
			return { status: "conflict", version: 7, lastEditorUsername: "vienna" }
		},
	})
	const elements: NoteEditorElements = {
		Layout: ({ toolbar, conflict, children }) => (
			<div>
				{toolbar}
				{conflict}
				{children}
			</div>
		),
		Input: (props) => {
			input = props
			props.editorRef.current = { setValue: (html: string) => changedValues.push(html) } as unknown as NonNullable<
				typeof props.editorRef.current
			>
			return <div />
		},
		Toolbar: () => null,
		ConflictNotice: (props) => {
			notice = props
			return <div />
		},
	}
	const harness = await renderTestHook(
		() => null,
		() => (
			<NoteEditor
				note={toTestNote()}
				pageName="Coffee"
				noteCommentThread={THREAD}
				isCommentsOpen
				controller={controller}
				onSaveStatus={() => {}}
				onSaveError={() => {}}
				onError={(message) => errors.push(message)}
				elements={elements}
			/>
		),
	)
	cleanups.push(harness.close)
	await act(async () => {
		input?.onChangeHtml("<html><br></html>")
		input?.onChangeHtml("<html><p>Stored words</p></html>")
	})
	expect(controller.getDraft().hasPendingChanges).toBe(false)
	expect(sent).toEqual([])
	await act(async () => {
		input?.onChangeHtml("my draft")
		controller.flushSave()
	})
	await waitForHook(() => notice !== undefined)
	await act(async () => input?.onChangeHtml("my newest words"))
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	globalThis.fetch = (async () => Response.json({}, { status: 500 })) as unknown as typeof fetch
	await act(async () => notice?.onReload())
	await waitForHook(() => errors.length > 0)
	expect(controller.getDraft().html).toBe("my newest words")
	expect(changedValues).toEqual([])

	// only a successful deliberate Reload changes both the baseline and displayed document
	globalThis.fetch = (async () =>
		Response.json(toTestNote({ html: "fresh server body", version: 7 }))) as unknown as typeof fetch
	await act(async () => notice?.onReload())
	await waitForHook(() => changedValues.length > 0)
	expect(changedValues).toEqual(["fresh server body"])
	expect(controller.getDraft()).toMatchObject({
		html: "fresh server body",
		version: 7,
		hasPendingChanges: false,
		conflict: null,
	})
})

test("creation preserves failed values and submits only the offered visibility once", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	let input: NoteNameInputProps | undefined
	let visibility: NoteVisibilitySelectProps | undefined
	let submit: { isDisabled: boolean; onPress: () => void } | undefined
	const errors: string[] = []
	const created: string[] = []
	const requests: string[] = []
	let isFailing = true
	let isOffline = false
	globalThis.fetch = (async (_url, init) => {
		requests.push(String(init?.body))
		return isFailing ? Response.json({}, { status: 503 }) : Response.json(toTestNote())
	}) as typeof fetch
	const Wrap = ({ children }: React.PropsWithChildren) => <div>{children}</div>
	const elements: CreateNoteElements = {
		Title: Wrap,
		Fields: Wrap,
		VisibilityRow: Wrap,
		Description: Wrap,
		NameInput: (props) => {
			input = props
			return null
		},
		VisibilitySelect: (props) => {
			visibility = props
			return null
		},
		Submit: (props) => {
			submit = props
			return null
		},
	}
	const harness = await renderTestHook(
		() => null,
		() => (
			<CreateNote
				isDisabled={isOffline}
				page={{ pageType: "topic", pageId: "topic-1" }}
				creatableVisibilities={["private", "team"]}
				onCreated={(note) => created.push(note.id)}
				onError={(error) => errors.push(error)}
				elements={elements}
			/>
		),
	)
	cleanups.push(harness.close)
	expect(submit?.isDisabled).toBe(true)
	expect(visibility?.visibility).toBe("team")
	await act(async () => input?.onChange(" My notes "))
	await act(async () => {
		submit?.onPress()
		submit?.onPress()
	})
	expect(requests).toHaveLength(1)
	expect(errors).toHaveLength(1)
	expect(input?.value).toBe(" My notes ")
	expect(created).toEqual([])
	isOffline = true
	await harness.render()
	expect(submit?.isDisabled).toBe(true)
	expect(input?.value).toBe(" My notes ")
	await act(async () => submit?.onPress())
	expect(requests).toHaveLength(1)
	isOffline = false
	await harness.render()
	isFailing = false
	await act(async () => submit?.onPress())
	expect(JSON.parse(requests[1] ?? "{}")).toEqual({ name: "My notes", visibility: "team" })
	expect(created).toEqual(["note-1"])
})

test("shared comments retain failed drafts, prevent duplicate posts and only offer author deletion", async () => {
	let composer: NoteCommentComposerProps | undefined
	let remove: (() => void) | undefined
	let posted = 0
	let deleted = 0
	let isAccepted = false
	const errors: string[] = []
	const Wrap = ({ children }: React.PropsWithChildren) => <div>{children}</div>
	const elements: NoteCommentsElements = {
		Container: Wrap,
		Message: Wrap,
		List: Wrap,
		Row: Wrap,
		Header: Wrap,
		Age: Wrap,
		Body: Wrap,
		Retry: () => null,
		Author: () => <span>Closed account</span>,
		Delete: ({ onPress }) => {
			remove = onPress
			return <button type="button">Delete comment</button>
		},
		Composer: (props) => {
			composer = props
			return null
		},
	}
	const harness = await renderTestHook(
		() => null,
		() => (
			<NoteComments
				{...THREAD}
				comments={[
					{ id: "new", body: "Second", author: null, canDelete: true, createdAt: "2026-10-22T00:00:00Z" },
					{ id: "old", body: "First", author: null, canDelete: false, createdAt: "2026-10-21T00:00:00Z" },
				]}
				canComment
				onError={(error) => errors.push(error)}
				postNoteComment={async () => {
					posted++
					return isAccepted
				}}
				deleteNoteComment={async () => {
					deleted++
					return false
				}}
				elements={elements}
			/>
		),
	)
	cleanups.push(harness.close)
	expect(harness.container.textContent?.indexOf("First")).toBeLessThan(
		harness.container.textContent?.indexOf("Second") ?? 0,
	)
	expect(harness.container.querySelectorAll("button")).toHaveLength(1)
	await act(async () => composer?.onChange("Keep my words"))
	await act(async () => {
		composer?.onSubmit()
		composer?.onSubmit()
	})
	expect(posted).toBe(1)
	expect(composer?.value).toBe("Keep my words")
	await act(async () => remove?.())
	expect(deleted).toBe(1)
	expect(harness.container.textContent).toContain("Second")
	isAccepted = true
	await act(async () => composer?.onSubmit())
	expect(composer?.value).toBe("")
	expect(errors).toHaveLength(2)
})
