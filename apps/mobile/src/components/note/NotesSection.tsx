import { authClient } from "@carlnotes/client/authClient"
import { fetchNotes } from "@carlnotes/client/noteClient"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { Plus } from "lucide-react-native"
import { type ComponentRef, useRef, useState, useSyncExternalStore } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { useNoteDraftSnapshot, useNoteDraftStore } from "@/noteDraftStorage"
import { CreateNote } from "./CreateNote"
import { NotesTable } from "./NotesTable"
import { PageNoteBadge } from "./NoteUnreadBadge"

/**
 * Lists Topic notes and recoverable drafts, opening the shared native reading and editing flow.
 */
export function NotesSection(props: { topic: TopicResponse } | { pageType: "topic" | "team"; pageId: string }) {
	const page = "topic" in props ? { pageType: "topic" as const, pageId: props.topic.id } : props
	const path = `/${page.pageType === "topic" ? "topics" : "teams"}/${page.pageId}`
	// open the same action from the header button and the empty invitation
	const [isAddingNote, setIsAddingNote] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleAddNote = (): void => setIsAddingNote(true)

	// separate these transient reads from saved feed data
	const { data: session } = authClient().useSession()
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
	const canCreate = (query.data?.creatableVisibilities.length ?? 0) > 0 && isOnline
	return (
		<>
			<CollapsibleSection
				title="Tasting Notes"
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
				<NotesList
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

// link the Topic name to the same creation action as the section's primary button
function NoteInvitation({
	pageType,
	canCreate,
	pageName,
	path,
	onAdd,
}: {
	canCreate: boolean
	pageType: "topic" | "team"
	pageName: string
	path: string
	onAdd: () => void
}) {
	if (!canCreate) {
		return <Text className="text-sm text-muted-foreground">{`No notes on this ${pageType} yet.`}</Text>
	}
	return (
		<AnchorLink
			href={`${SITE_URL}${path}`}
			accessibilityLabel={`Write a note on ${pageName}`}
			className="min-h-6 justify-center active:opacity-75"
			hitSlop={toTouchTargetHitSlop(24)}
			onPress={(event) => {
				event.preventDefault()
				onAdd()
			}}
		>
			<Text className="text-sm text-muted-foreground">
				Write a note on <Text className="text-sm text-link">{pageName}</Text>.
			</Text>
		</AnchorLink>
	)
}

// retain the same empty invitation and retry state for Topic and Team notes
function NotesList({
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
	if (data && data.notes.length > 0) {
		return <NotesTable notes={data.notes} path={path} />
	}
	return (
		<View className="rounded-lg border border-separator bg-card p-4 shadow-raised">
			{isPending && <CoffeeLoading label="Loading your Tasting Notes" />}
			{isError && (
				<Button variant="link" accessibilityLabel="Retry Tasting Notes" onPress={onRetry}>
					<Text>Try again</Text>
				</Button>
			)}
			{data?.notes.length === 0 && (
				<NoteInvitation canCreate={canCreate} pageType={pageType} pageName={data.pageName} path={path} onAdd={onAdd} />
			)}
		</View>
	)
}
