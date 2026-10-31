import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import { useNoteRead } from "@carlnotes/core/hooks/useNoteBadges"
import type { NoteBodySave, NoteSaveStatus } from "@carlnotes/core/hooks/useNoteBodySave"
import { useNoteComments } from "@carlnotes/core/hooks/useNoteComments"
import { NOTE_LABELS, NOTE_SAVE_ERRORS, NOTE_SAVE_STATUS_LABELS } from "@carlnotes/core/lib/noteLabels"
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { MessageSquareText, X } from "lucide-react-native"
import { useEffect, useState } from "react"
import { Keyboard, KeyboardAvoidingView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { useNoteDraftSnapshot, useNoteDraftStore } from "@/noteDraftStorage"
import { loadNote, type OpenedNote } from "@/noteRead"
import type { NoteDraftStore } from "@/stores/noteDraftStore"
import { NoteEditor } from "./NoteEditor"
import { NoteManagement } from "./NoteManagement"
import { NoteViewer } from "./NoteViewer"

/**
 * Opens a Topic or Team note using fresh permissions or this account's recoverable offline draft.
 */
export function NoteScreen() {
	const { topicId, teamId, noteId } = useLocalSearchParams<{ topicId?: string; teamId?: string; noteId: string }>()
	const page = { pageType: teamId ? ("team" as const) : ("topic" as const), pageId: teamId ?? topicId ?? "" }
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const store = useNoteDraftStore()
	const [headerHeight, setHeaderHeight] = useState(0)
	const isKeyboardVisible = useIsKeyboardVisible()
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	const chatPillClearance = useFontScaledSize(44) + 24
	return (
		<View className="flex-1 bg-background">
			<View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
				{!isKeyboardVisible && <Header />}
			</View>
			<ClassNameSafeAreaView
				edges={isKeyboardVisible ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]}
				className="w-full max-w-3xl flex-1 self-center"
			>
				<KeyboardAvoidingView
					className="flex-1"
					enabled={!isPodcastPlayerShown}
					keyboardVerticalOffset={headerHeight}
					behavior="padding"
				>
					{/* reserve launcher space inside the keyboard-adjusted viewport */}
					<View className="flex-1" style={{ paddingBottom: isKeyboardVisible ? 0 : chatPillClearance }}>
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
					</View>
				</KeyboardAvoidingView>
			</ClassNameSafeAreaView>
		</View>
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
	return (
		<View className="flex-1 px-4 pt-4">
			{/* expose comments beside the close control, above the note and its scrolling editor */}
			<View className="mb-2 flex-row items-center justify-end gap-2">
				{openedNote && !isUnavailable && (
					<Button
						accessibilityLabel="Show comments"
						variant="outline"
						size="sm"
						onPress={() => {
							// dismiss the editor keyboard before opening comments
							Keyboard.dismiss()
							setIsCommentsOpen(true)
						}}
					>
						<Icon as={MessageSquareText} className="size-4 text-foreground" />
						<Text>Comments</Text>
					</Button>
				)}
				{/* return to the owning page and keep its table position */}
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
			</View>
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
			{openedNote && !isUnavailable && (
				<OpenNote
					key={`${noteId}:${openedNote.note.canEdit}`}
					openedNote={openedNote}
					store={store}
					isCommentsOpen={isCommentsOpen}
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
	onRefresh,
	isCommentsOpen,
	onCloseComments,
}: {
	openedNote: OpenedNote
	store: NoteDraftStore | null
	onRefresh: () => void
	isCommentsOpen: boolean
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
	if (controller === undefined) {
		return <CoffeeLoading label="Loading your Tasting Note" />
	}

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
	const header = (
		<>
			<NoteManagement
				note={note}
				visibilities={context.creatableVisibilities}
				isOffline={isOffline}
				onChanged={handleChanged}
				onDeleted={async () => {
					await store?.remove(note.id)
					handleChanged()
					router.back()
				}}
			/>
			{isOffline && (
				<View className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
					<Text className="text-sm text-muted-foreground">Recovered draft · Not saved</Text>
					<Button accessibilityLabel="Retry note connection" variant="link" size="sm" onPress={onRefresh}>
						<Text>Try again</Text>
					</Button>
				</View>
			)}
		</>
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
			{note.canEdit && (
				<View className="flex-row items-center justify-end gap-3 py-2">
					<Text accessibilityLiveRegion="polite" className="text-sm font-medium">
						{NOTE_SAVE_STATUS_LABELS[status]}
					</Text>
					{status === "unsaved" && !controller?.getState().conflict && (
						<Button
							accessibilityLabel="Retry saving note"
							variant="link"
							size="sm"
							onPress={() => void store?.retryPending()}
						>
							<Text>Try again</Text>
						</Button>
					)}
				</View>
			)}
			{controller?.getDraft().errorReason && (
				<Text accessibilityRole="alert" className="py-2 text-sm text-destructive">
					{NOTE_SAVE_ERRORS[controller.getDraft().errorReason ?? "failed"]}
				</Text>
			)}
		</>
	)
}
