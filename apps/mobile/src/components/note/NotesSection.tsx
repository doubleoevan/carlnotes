import { authClient } from "@carlnotes/client/authClient"
import { fetchNotes } from "@carlnotes/client/noteClient"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { Plus } from "lucide-react-native"
import { type ComponentRef, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TableCard } from "@/components/table/TableCard"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useNoteDraftSnapshot, useNoteDraftStore } from "@/noteDraftStorage"
import { openSessionScreen } from "@/sessionReturnPath"
import { CreateNote } from "./CreateNote"
import { NotesList } from "./NotesList"
import { PageNoteBadge } from "./NoteUnreadBadge"

// the topic or the team whose notes the section lists, and where the count of the listed notes goes as it stands,
// for the screen's details line. the count is null until the notes load
type NotesSectionProps = ({ topic: TopicResponse } | { pageType: "topic" | "team"; pageId: string }) & {
	onNoteCountChange?: (noteCount: number | null) => void
}

/**
 * Lists Topic notes and recoverable drafts, opening the shared native reading and editing flow.
 */
export function NotesSection(props: NotesSectionProps) {
	const page = "topic" in props ? { pageType: "topic" as const, pageId: props.topic.id } : props
	const path = `/${page.pageType === "topic" ? "topics" : "teams"}/${page.pageId}`
	// open the same action from the header button and the empty invitation. a visitor is sent to sign-up with the
	// web's note prompt and returns to this page
	const { data: session } = authClient().useSession()
	const [isAddingNote, setIsAddingNote] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleAddNote = (): void => {
		if (!session) {
			openSessionScreen({ screen: "/sign-up", returnPath: path, cta: "note" })
			return
		}
		setIsAddingNote(true)
	}

	// separate these transient reads from saved feed data
	const router = useRouter()
	const queryClient = useQueryClient()
	const store = useNoteDraftStore()
	const snapshot = useNoteDraftSnapshot(store?.accountId === session?.user.id ? store : null)
	const localDrafts = snapshot.notes.filter((entry) => entry.pageType === page.pageType && entry.pageId === page.pageId)
	const isOnline = useSyncExternalStore(
		onlineManager.subscribe.bind(onlineManager),
		onlineManager.isOnline.bind(onlineManager),
	)
	const query = useQuery({
		queryKey: ["mobile-notes", session?.user.id, page.pageType, page.pageId],
		queryFn: async () => {
			if (!onlineManager.isOnline()) {
				throw new Error("notes unavailable offline")
			}
			const notes = await fetchNotes(page, { shouldThrowOnError: true })
			if (!notes) {
				throw new Error("notes unavailable")
			}
			return notes
		},
		gcTime: 0,
		networkMode: "always",
		retry: false,
	})
	// report how many notes the section lists
	const noteCount = query.data ? query.data.notes.length : null
	const { onNoteCountChange } = props
	useEffect(() => {
		onNoteCountChange?.(noteCount)
	}, [noteCount, onNoteCountChange])

	// a visitor sees the button too, as the web does, and it prompts for an account
	const canCreate = ((query.data?.creatableVisibilities.length ?? 0) > 0 && isOnline) || !session
	return (
		<>
			{/* a team's notes are its own, and a topic's are the tasting notes. both count at the far right of their title */}
			<CollapsibleSection
				title={page.pageType === "team" ? "Team notes" : "Tasting Notes"}
				countLabel={toSectionCountLabel(noteCount, "note")}
				hasClosedDivider={"topic" in props && props.topic.relatedTopics.length > 0}
				titleAside={
					<View className="flex-row items-center gap-2">
						<PageNoteBadge page={page} isOutline />
						{canCreate ? (
							<Button ref={triggerRef} accessibilityLabel="Add Note" onPress={handleAddNote} className="shrink-0">
								<Icon as={Plus} className="size-4" />
								<Text>Add Note</Text>
							</Button>
						) : null}
					</View>
				}
			>
				<NotesSectionBody
					data={query.data}
					isPending={query.isPending}
					isError={query.isError}
					canCreate={canCreate}
					pageType={page.pageType}
					path={path}
					onRetry={() => void query.refetch()}
					onAdd={handleAddNote}
				/>
				{localDrafts.length > 0 && (
					<View className="mt-3 gap-2">
						<Text className="text-sm" style={{ fontFamily: fontFamilies.display.name }}>
							Local drafts
						</Text>
						{localDrafts.map((entry) => (
							<AnchorLink
								key={entry.note.id}
								href={`${path}/notes/${entry.note.id}`}
								accessibilityLabel={`Recover ${entry.note.name}, not saved`}
								className="min-h-12 justify-center"
							>
								<Text className="text-sm text-link">{entry.note.name} · Not saved</Text>
							</AnchorLink>
						))}
					</View>
				)}
			</CollapsibleSection>
			{/* both triggers use the same shared creation flow and preserve table pagination */}
			{isAddingNote && query.data ? (
				<Sheet title="New note" triggerRef={triggerRef} onClose={() => setIsAddingNote(false)}>
					{!isOnline && (
						<Text className="mb-3 text-sm text-muted-foreground">
							Reconnect to add this note. Your entries are still here.
						</Text>
					)}
					<CreateNote
						isDisabled={!isOnline}
						page={page}
						creatableVisibilities={query.data.creatableVisibilities}
						onCreated={(note) => {
							setIsAddingNote(false)
							void queryClient.invalidateQueries({
								queryKey: ["mobile-notes", session?.user.id, page.pageType, page.pageId],
							})
							router.push(`${path}/notes/${note.id}`)
						}}
					/>
				</Sheet>
			) : null}
		</>
	)
}

// the loading line and the retry in the web's card until the notes arrive, then the shared list
function NotesSectionBody({
	data,
	isPending,
	isError,
	canCreate,
	pageType,
	path,
	onRetry,
	onAdd,
}: {
	data?: NotesResponse
	isPending: boolean
	isError: boolean
	canCreate: boolean
	pageType: "topic" | "team"
	path: string
	onRetry: () => void
	onAdd: () => void
}) {
	if (data) {
		return <NotesList notesResponse={data} pageType={pageType} canCreate={canCreate} path={path} onAdd={onAdd} />
	}
	return (
		<TableCard className="p-4">
			{isPending && <CoffeeLoading label="Loading your Tasting Notes" />}
			{isError && (
				<Button variant="link" accessibilityLabel="Retry Tasting Notes" onPress={onRetry}>
					<Text>Try again</Text>
				</Button>
			)}
		</TableCard>
	)
}
