// the note editor: BlockNote over the note's yjs sync, comments included
import "@blocknote/core/style.css"
import "@blocknote/mantine/style.css"
import { CommentsExtension, DefaultThreadStoreAuth } from "@blocknote/core/comments"
import { en } from "@blocknote/core/locales"
import { RESTYjsThreadStore, withCollaboration } from "@blocknote/core/yjs"
import { BlockNoteView, components as mantineComponents } from "@blocknote/mantine"
import {
	BlockNoteViewEditor,
	ComponentsContext,
	FloatingComposerController,
	FloatingThreadController,
	FormattingToolbar,
	getFormattingToolbarItems,
	ThreadsSidebar,
	useBlockNoteEditor,
	useComponentsContext,
	useCreateBlockNote,
	useEditorState,
	useExtension,
} from "@blocknote/react"
import { List, ListChecks, ListOrdered, MessageSquareText } from "lucide-react"
import { useMemo } from "react"
import { authClient } from "@/clients/authClient"
import { fetchNoteUsers, toNoteThreadsUrl } from "@/clients/noteClient"
import type { NoteSaveErrorReason } from "@/components/note/noteProvider"
import { useTheme } from "@/hooks/useTheme"
import { CommentEditorWithMentions, MentionUsernamesProvider } from "./CommentMentions"
import { type NoteSync, useNoteSync } from "./useNoteSync"

// mantine's component set with the comment box swapped for the one that suggests usernames
const COMMENT_COMPONENTS = {
	...mantineComponents,
	Comments: { ...mantineComponents.Comments, Editor: CommentEditorWithMentions },
}

/**
 * The always-editable note editor for a user with edit access. Mounting connects the stream, unmounting disconnects it.
 */
export default function NoteEditor({
	noteId,
	pageName,
	mentionableUsernames,
	isThreadsOpen,
	onSaveError,
}: {
	noteId: string
	// the topic or team the note belongs to, named in the empty note's placeholder
	pageName: string
	// who a comment's "@" menu offers, the other members of the note's team
	mentionableUsernames: string[]
	// whether the comment threads panel shows
	isThreadsOpen: boolean
	onSaveError: (reason: NoteSaveErrorReason) => void
}) {
	// the sync spans the editor's whole lifetime
	const sync = useNoteSync(noteId, onSaveError)
	if (!sync) {
		return null
	}
	return (
		<ConnectedNoteEditor
			noteId={noteId}
			sync={sync}
			pageName={pageName}
			mentionableUsernames={mentionableUsernames}
			isCommentThreadsOpen={isThreadsOpen}
		/>
	)
}

// the editor itself, mounted once the sync exists
function ConnectedNoteEditor({
	noteId,
	sync,
	pageName,
	mentionableUsernames,
	isCommentThreadsOpen,
}: {
	noteId: string
	sync: NoteSync
	pageName: string
	mentionableUsernames: string[]
	isCommentThreadsOpen: boolean
}) {
	// blocknote defaults to the OS theme. the theme prop pins it to the app's own light or dark theme
	const { isDark } = useTheme()

	// the signed-in user's id names their comments
	const { data: session } = authClient.useSession()
	const userId = session?.user.id ?? ""

	// comment writes go to the api, which applies them to the ydoc and fans them back out.
	// removing addThreadToDocument makes the store apply the comment mark through the normal sync path
	const threadStore = useMemo(() => {
		const store = new RESTYjsThreadStore(
			toNoteThreadsUrl(noteId),
			{},
			sync.ydoc.getMap("threads"),
			new DefaultThreadStoreAuth(userId, "editor"),
		)
		;(store as { addThreadToDocument?: unknown }).addThreadToDocument = undefined
		return store
	}, [noteId, sync.ydoc, userId])

	// the empty note names what it is for. the hint fills both keys, emptyDocument while nothing is
	// focused and default once the caret lands. blocknote takes a whole dictionary
	const dictionary = useMemo(() => {
		const hint = `TODO: a note about ${pageName}`
		return { ...en, placeholders: { ...en.placeholders, emptyDocument: hint, default: hint } }
	}, [pageName])

	// the editor binds the ydoc's fragment through the provider, with checklists and the slash menu in the default schema
	const editor = useCreateBlockNote(
		withCollaboration({
			dictionary,
			collaboration: {
				fragment: sync.ydoc.getXmlFragment("prosemirror"),
				user: { name: "", color: "" },
				provider: sync.provider,
			},
			extensions: [
				CommentsExtension({
					threadStore,
					resolveUsers: (userIds: string[]) => fetchNoteUsers(noteId, userIds),
				}),
			],
		}),
		[sync.ydoc, threadStore],
	)

	// pressing commented text opens its thread. the mark holds the thread id the extension selects by
	function handleSelectThreadOnPress(event: React.PointerEvent): void {
		const mark = (event.target as HTMLElement).closest?.("[data-bn-thread-id]")
		const threadId = mark?.getAttribute("data-bn-thread-id")
		if (!threadId) {
			return
		}
		const comments = editor.getExtension("comments") as unknown as
			| { selectThread: (threadId: string) => void }
			| undefined
		comments?.selectThread(threadId)
	}

	// the google-docs layout: formatting controls on top, threads in a wide screen's sidebar or a phone's sheet.
	// the components override and the provider give every comment box its "@" menu
	return (
		<BlockNoteView
			editor={editor}
			editable
			theme={isDark ? "dark" : "light"}
			className="note-editor relative flex h-full flex-col"
			formattingToolbar={false}
			comments={false}
			renderEditor={false}
		>
			{/* the override sits inside the view. the view installs mantine's own component set, replacing any override outside it */}
			<ComponentsContext.Provider value={COMMENT_COMPONENTS}>
				<MentionUsernamesProvider value={mentionableUsernames}>
					{/* the rich text controls across the top, commenting first. the gap below matches the dialog's row gap */}
					<div className="pb-4">
						<FormattingToolbar>
							<AddCommentButton />
							{/* a divider separates commenting from the text styling that follows it */}
							<div className="bg-separator-strong mx-1.5 h-6 w-px shrink-0 self-center" />
							{getFormattingToolbarItems().filter((item) => item.key !== "addCommentButton")}
							{LIST_BUTTONS.map((listButton) => (
								<ListButton key={listButton.blockType} {...listButton} />
							))}
						</FormattingToolbar>
					</div>

					{/* the google-docs canvas: the note is a card page on a sunken surface, and on a wide screen
						the comment cards float in the margin beside it. the whole canvas scrolls as one.
						a phone drops the canvas and the page's own padding */}
					<div className="min-h-0 flex-1 overflow-y-auto sm:bg-sunken sm:rounded-md sm:p-4">
						<div className="flex min-h-full items-start gap-4">
							{/* on a touch screen blocknote's own click handler opens a thread only once a first tap has
					    		focused the editor. opening here on the press means one tap either way */}
							<div
								onPointerDown={handleSelectThreadOnPress}
								className="bg-card min-w-0 flex-1 self-stretch sm:rounded-lg sm:border sm:py-6 sm:shadow-lift"
							>
								<BlockNoteViewEditor />
							</div>
							{isCommentThreadsOpen && (
								<aside className="hidden w-64 shrink-0 sm:block">
									{/* the margin column shows the same heading as the phone's sheet */}
									<h3 className="font-display pb-2 text-lg">Comments</h3>
									{/* the filter prop is required, "all" lists every thread */}
									<ThreadsSidebar filter="all" />
								</aside>
							)}
						</div>
					</div>

					{/* the phone's comments sheet, sliding up over the editor on the dialog's own background.
			    		motion-safe skips the slide for a user who asked for reduced motion */}
					{isCommentThreadsOpen && (
						<div className="bg-popover motion-safe:animate-in motion-safe:slide-in-from-bottom-16 motion-safe:duration-200 absolute inset-0 z-10 flex flex-col sm:hidden">
							{/* the heading starts where the title above it does. the header's comments button,
								lit while the sheet is open, is its only close control */}
							<h3 className="font-display pb-2 text-lg">Comments</h3>
							<div className="min-h-0 flex-1 overflow-y-auto">
								<ThreadsSidebar filter="all" />
							</div>
						</div>
					)}

					{/* the composer that opens on a selection, and the card that pops up over commented text.
			    		the card only shows while the panel is closed. an open panel already lists the same thread */}
					<FloatingComposerController />
					{!isCommentThreadsOpen && <FloatingThreadController />}
				</MentionUsernamesProvider>
			</ComponentsContext.Provider>
		</BlockNoteView>
	)
}

// the list types a note can use, each its own toolbar button. blocknote offers these only inside its block type dropdown
const LIST_BUTTONS = [
	{ blockType: "bulletListItem", label: "Bulleted list", Icon: List },
	{ blockType: "numberedListItem", label: "Numbered list", Icon: ListOrdered },
	{ blockType: "checkListItem", label: "Check list", Icon: ListChecks },
] as const

// one list button. pressing it turns the block into that list, or back into a paragraph when it already is
function ListButton({ blockType, label, Icon }: (typeof LIST_BUTTONS)[number]) {
	const Components = useComponentsContext()
	const editor = useBlockNoteEditor()

	// the button lights up while the caret sits in a block of its own kind
	const isActive = useEditorState({
		selector: (snapshot) => snapshot.editor?.getTextCursorPosition().block.type === blockType,
	})
	if (!Components) {
		return null
	}
	return (
		<Components.FormattingToolbar.Button
			label={label}
			mainTooltip={label}
			isSelected={Boolean(isActive)}
			icon={<Icon className="size-4" />}
			onClick={() => {
				const block = editor.getTextCursorPosition().block
				editor.updateBlock(block, { type: block.type === blockType ? "paragraph" : blockType })
				editor.focus()
			}}
		/>
	)
}

// the comment button, leading the toolbar with the app's own icon. blocknote's own hardcodes its icon and takes no props
function AddCommentButton() {
	const Components = useComponentsContext()
	const comments = useExtension("comments") as unknown as { startPendingComment: () => void }
	if (!Components) {
		return null
	}
	return (
		<Components.FormattingToolbar.Button
			label="Add comment"
			mainTooltip="Add comment"
			icon={<MessageSquareText className="size-4" />}
			onClick={() => comments.startPendingComment()}
		/>
	)
}
