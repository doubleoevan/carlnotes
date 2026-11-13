import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import { useNoteRead } from "@carlnotes/core/hooks/useNoteBadges"
import type { NoteBodySave, NoteSaveStatus } from "@carlnotes/core/hooks/useNoteBodySave"
import { useNoteComments } from "@carlnotes/core/hooks/useNoteComments"
import { useNoteManagement } from "@carlnotes/core/hooks/useNoteManagement"
import { NOTE_DELETE, NOTE_LABELS, NOTE_SAVE_ERRORS, toNoteDeleteDescription } from "@carlnotes/core/lib/noteLabels"
import { toNoteReportProps } from "@carlnotes/core/lib/reportCopy"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { X } from "lucide-react-native"
import { type ReactNode, useEffect, useState } from "react"
import { Alert, Keyboard, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { useNoteDraftSnapshot, useNoteDraftStore } from "@/noteDraftStorage"
import { loadNote, type OpenedNote } from "@/noteRead"
import type { NoteDraftStore } from "@/stores/noteDraftStore"
import { NoteDetails } from "./NoteDetails"
import { NoteEditor } from "./NoteEditor"
import { NoteEditorScreen } from "./NoteEditorScreen"
import { NoteFooter } from "./NoteFooter"
import { NoteNameInput } from "./NoteNameInput"
import { NoteViewer } from "./NoteViewer"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

/**
 * Opens a Topic or Team note using fresh permissions or this account's recoverable offline draft.
 */
export function NoteScreen() {
	const { topicId, teamId, noteId } = useLocalSearchParams<{ topicId?: string; teamId?: string; noteId: string }>()
	const page = { pageType: teamId ? ("team" as const) : ("topic" as const), pageId: teamId ?? topicId ?? "" }
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const store = useNoteDraftStore()
	return (
		<NoteEditorScreen>
			{!isSessionPending && (!session || store?.accountId === session.user.id) ? (
				<NoteScreenContent
					key={`${session?.user.id ?? "visitor"}:${noteId}`}
					store={session ? store : null}
					page={page}
					noteId={noteId}
				/>
			) : (
				<CoffeeLoading label="Loading your Tasting Note" />
			)}
		</NoteEditorScreen>
	)
}

// keep the draft registry subscribed while permission changes or storage failures arrive asynchronously
function NoteScreenContent({
	store,
	page,
	noteId,
}: {
	store: NoteDraftStore | null
	page: { pageType: "topic" | "team"; pageId: string }
	noteId: string
}) {
	const snapshot = useNoteDraftSnapshot(store)
	const [isCommentsOpen, setIsCommentsOpen] = useState(false)
	const query = useQuery({
		queryKey: ["mobile-note", store?.accountId ?? "visitor", page.pageType, page.pageId, noteId],
		queryFn: () => loadNote({ store, page, noteId, isOnline: onlineManager.isOnline() }),
		networkMode: "always",
		gcTime: 0,
		retry: false,
	})
	const openedNote = query.data
	const isUnavailable = openedNote === null || (openedNote?.note.canEdit && snapshot.unavailableIds.has(noteId))
	const isOpen = Boolean(openedNote && !isUnavailable)

	// return to the owning page and keep its table position
	const closeControl = (
		<AnchorLink
			href={`/${page.pageType === "topic" ? "topics" : "teams"}/${page.pageId}`}
			shouldDismissTo
			accessibilityLabel="Close note"
			asChild
		>
			<Button accessibilityLabel="Close note" variant="ghost" size="icon">
				<Icon as={X} className="size-4 text-foreground" />
			</Button>
		</AnchorLink>
	)
	return (
		<View className="flex-1 px-4 pt-4">
			{/* the close control alone until the note opens, when it joins the note's own controls */}
			{!isOpen && <View className="mb-2 flex-row items-center justify-end">{closeControl}</View>}
			{query.isPending && <CoffeeLoading label="Loading your Tasting Note" />}
			{query.isError && (
				<LoadFailedNotice
					className="py-4"
					message={NOTE_LABELS.openError}
					retryLabel="Retry note"
					onRetry={() => void query.refetch()}
				/>
			)}
			{isUnavailable && <Text className="py-4 text-muted-foreground">This note is unavailable.</Text>}
			{snapshot.hasStorageError && (
				<Text accessibilityRole="alert" className="py-2 text-destructive">
					{NOTE_LABELS.storageError}
				</Text>
			)}
			{openedNote && isOpen && (
				<OpenNote
					key={`${noteId}:${openedNote.note.canEdit}`}
					openedNote={openedNote}
					store={store}
					closeControl={closeControl}
					isCommentsOpen={isCommentsOpen}
					onOpenComments={() => {
						// dismiss the editor keyboard before opening comments
						Keyboard.dismiss()
						setIsCommentsOpen(true)
					}}
					onCloseComments={() => setIsCommentsOpen(false)}
					onRefresh={() => void query.refetch()}
				/>
			)}
		</View>
	)
}

// keep the editor mounted while metadata or comments change, with one controller shared by reconnect processing
function OpenNote({
	openedNote,
	store,
	closeControl,
	onRefresh,
	isCommentsOpen,
	onOpenComments,
	onCloseComments,
}: {
	openedNote: OpenedNote
	store: NoteDraftStore | null
	closeControl: ReactNode
	onRefresh: () => void
	isCommentsOpen: boolean
	onOpenComments: () => void
	onCloseComments: () => void
}) {
	// open the account controller after commit. refreshing its baseline can notify another mounted screen
	const [initialOpenedNote] = useState(openedNote)
	const [controller, setController] = useState<NoteBodySave | null>()
	const [status, setStatus] = useState<NoteSaveStatus>("saved")
	useEffect(() => {
		const noteController = initialOpenedNote.note.canEdit
			? (store?.open(initialOpenedNote.note, initialOpenedNote.context) ?? null)
			: null
		setController(noteController)
		setStatus(noteController?.getState().status ?? "saved")
		return () => {
			if (noteController) {
				store?.release(initialOpenedNote.note.id)
			}
		}
	}, [initialOpenedNote, store])

	// keep metadata and comments current without replacing the mounted editor controller
	const { note, context, isOffline } = openedNote
	const comments = useNoteComments(note.id)
	useNoteRead(isOffline ? null : note.id, store?.accountId)
	const queryClient = useQueryClient()
	const router = useRouter()

	// update the table after metadata writes while preserving its sort and page
	const handleChanged = (changes: Partial<Pick<NoteResponse, "name" | "visibility">> = {}): void => {
		store?.updateMetadata(note.id, changes)
		queryClient.setQueryData<OpenedNote>(
			["mobile-note", store?.accountId ?? "visitor", context.pageType, context.pageId, note.id],
			(current) => (current ? { ...current, note: { ...current.note, ...changes } } : current),
		)
		void queryClient.invalidateQueries({
			queryKey: ["mobile-notes", store?.accountId, context.pageType, context.pageId],
		})
	}

	// the rename, visibility, and confirmed delete through the web's fresh permission fields
	const { name, setName, savedName, visibility, isPending, rename, changeVisibility, remove } = useNoteManagement({
		note,
		isOffline,
		onChanged: handleChanged,
		onDeleted: async () => {
			await store?.remove(note.id)
			handleChanged()
			router.back()
		},
		onError: showClientError,
	})
	const [isNameFocused, setIsNameFocused] = useState(false)
	const isKeyboardVisible = useIsKeyboardVisible()
	const { data: session } = authClient().useSession()
	if (controller === undefined) {
		return <CoffeeLoading label="Loading your Tasting Note" />
	}

	// the web's frame above the body, which keeps its row and drops the name while the body's keyboard is up
	const header = (
		<View className="gap-2 pb-3">
			<NoteDetails
				note={{ name, owner: note.owner }}
				visibility={
					<NoteVisibilitySelect
						visibilities={note.isNoteOwner && !isOffline ? context.creatableVisibilities : [visibility]}
						visibility={visibility}
						onNoteVisibilityChange={(next) => void changeVisibility(next)}
					/>
				}
				title={
					note.canEdit ? (
						<NoteNameInput
							name={name}
							isFocused={isNameFocused}
							isDisabled={isOffline || isPending}
							isPencilShown={!isOffline}
							onNameChange={setName}
							onFocusChange={setIsNameFocused}
							onRename={() => void rename()}
						/>
					) : undefined
				}
				controls={closeControl}
				isCommentsOpen={isCommentsOpen}
				isHeaderRowOnly={isKeyboardVisible && !isNameFocused}
				onToggleComments={onOpenComments}
			/>
			{isOffline && (
				<View className="flex-row flex-wrap items-center justify-between gap-2">
					<Text className="text-sm text-muted-foreground">Recovered draft · Not saved</Text>
					<Button accessibilityLabel="Retry note connection" variant="link" size="sm" onPress={onRefresh}>
						<Text>Try again</Text>
					</Button>
				</View>
			)}
		</View>
	)
	return (
		<>
			{note.canEdit && controller ? (
				<NoteEditor
					header={header}
					note={note}
					pageName={context.pageName}
					controller={controller}
					noteCommentThread={comments}
					isCommentsOpen={isCommentsOpen}
					onCloseComments={onCloseComments}
					onSaveStatus={setStatus}
					onSaveError={(reason) => {
						if (reason === "unavailable") {
							void store?.remove(note.id)
						}
						showClientError(NOTE_SAVE_ERRORS[reason])
					}}
				/>
			) : (
				<NoteViewer
					header={header}
					note={note}
					noteCommentThread={comments}
					isCommentsOpen={isCommentsOpen}
					onCloseComments={onCloseComments}
				/>
			)}
			<NoteFooter
				canEdit={note.canEdit}
				canDelete={note.canDelete}
				reportSubject={toNoteReportProps({
					noteId: note.id,
					noteName: savedName,
					owner: note.owner,
					canReport: Boolean(session) && !note.canDelete && !isOffline,
				})}
				isDisabled={isOffline || isPending}
				noteSaveStatus={status}
				canRetrySave={status === "unsaved" && !controller?.getState().conflict}
				onRetrySave={() => void store?.retryPending()}
				onDelete={() =>
					Alert.alert(NOTE_DELETE.title, toNoteDeleteDescription(savedName), [
						{ text: NOTE_DELETE.cancelLabel, style: "cancel" },
						{ text: NOTE_DELETE.confirmLabel, style: "destructive", onPress: () => void remove() },
					])
				}
			/>
			{controller?.getDraft().errorReason && (
				<Text accessibilityRole="alert" className="py-2 text-sm text-destructive">
					{NOTE_SAVE_ERRORS[controller.getDraft().errorReason ?? "failed"]}
				</Text>
			)}
		</>
	)
}
