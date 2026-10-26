import { authClient } from "@carlnotes/client/authClient"
import { fetchNotes } from "@carlnotes/client/noteClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { WebFeatureSheet } from "@/components/common/WebFeature"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { NotesTable } from "./NotesTable"

/**
 * Lists existing Tasting Notes and explains the web handoff for reading or editing them.
 */
export function NotesSection({ topic }: { topic: TopicResponse }) {
	// open the same action from the header button and the empty invitation
	const [isAddingNote, setIsAddingNote] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleAddNote = (): void => setIsAddingNote(true)

	// separate these transient reads from saved feed data
	const { data: session } = authClient().useSession()
	const query = useQuery({
		queryKey: ["mobile-notes", session?.user.id, topic.id],
		queryFn: async () => {
			const notes = await fetchNotes({ pageType: "topic", pageId: topic.id })
			if (!notes) {
				throw new Error("notes unavailable")
			}
			return notes
		},
		gcTime: 0,
	})
	const canCreate = (query.data?.creatableVisibilities.length ?? 0) > 0
	return (
		<>
			<CollapsibleSection
				title="Tasting Notes"
				titleAside={
					canCreate ? (
						<Button ref={triggerRef} accessibilityLabel="Add Note" onPress={handleAddNote} className="shrink-0">
							<Icon as={Plus} className="size-4" />
							<Text>Add Note</Text>
						</Button>
					) : null
				}
			>
				{query.data && query.data.notes.length > 0 ? (
					<NotesTable notes={query.data.notes} path={toTopicPath(topic)} />
				) : (
					<View className="rounded-lg border border-separator bg-card p-4 shadow-raised">
						{query.isPending ? <CoffeeLoading label="Loading your Tasting Notes" /> : null}
						{query.isError ? (
							<Button variant="link" accessibilityLabel="Retry Tasting Notes" onPress={() => void query.refetch()}>
								<Text>Try again</Text>
							</Button>
						) : null}
						{query.data?.notes.length === 0 ? (
							canCreate ? (
								<AnchorLink
									href={`${SITE_URL}${toTopicPath(topic)}`}
									accessibilityLabel={`Write a note on ${query.data.pageName}`}
									className="min-h-6 justify-center active:opacity-75"
									hitSlop={toTouchTargetHitSlop(24)}
									onPress={(event) => {
										event.preventDefault()
										handleAddNote()
									}}
								>
									<Text className="text-sm text-muted-foreground">
										Write a note on <Text className="text-sm text-link">{query.data.pageName}</Text>.
									</Text>
								</AnchorLink>
							) : (
								<Text className="text-sm text-muted-foreground">No notes on this topic yet.</Text>
							)
						) : null}
					</View>
				)}
			</CollapsibleSection>
			{/* both creation triggers retain the existing web editor handoff */}
			{isAddingNote ? (
				<WebFeatureSheet
					title="Add Note"
					description="Write a Tasting Note on this topic on carlnotes.com."
					path={toTopicPath(topic)}
					triggerRef={triggerRef}
					onClose={() => setIsAddingNote(false)}
				/>
			) : null}
		</>
	)
}
