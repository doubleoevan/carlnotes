import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicPersonalSources } from "@carlnotes/client/personalSourcesClient"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { useQuery } from "@tanstack/react-query"
import { useTopicPersonalSourcesContents } from "../hooks/useTopicPersonalSourcesContents"
import {
	canShowTopicPersonalSources,
	toPersonalSourcesEntryCount,
	toPersonalSourcesSectionTitle,
} from "../lib/personalSourcesCopy"
import { PersonalSourcesEmailControls } from "./PersonalSourcesEmailControls"
import type { TopicPersonalSourcesElements } from "./TopicPersonalSources"
import { TopicPersonalSourcesContents } from "./TopicPersonalSourcesContents"
import { TopicSharedCommentsSection } from "./TopicSharedCommentsSection"

type TopicPersonalSourcesSectionProps = {
	topic: TopicDetails & { canEdit?: boolean }
	elements: TopicPersonalSourcesElements
	onCopy: (text: string) => Promise<boolean>
	className?: string
}

/**
 * Shares the sender's flat item list inside Topic info and Artisanal Blend, with the comments shared with the podcast
 * as a group of their own under it.
 */
export function TopicPersonalSourcesSection({ topic, elements, onCopy, className }: TopicPersonalSourcesSectionProps) {
	const { data: session } = authClient().useSession()
	if (!session) {
		return null
	}
	return (
		<>
			{canShowTopicPersonalSources(topic) && (
				<VisibleSection
					key={`${session.user.id}:${topic.id}`}
					userId={session.user.id}
					topic={topic}
					elements={elements}
					onCopy={onCopy}
					className={className}
				/>
			)}
			<TopicSharedCommentsSection topic={topic} elements={elements} className={className} />
		</>
	)
}

// only confirmation metadata is read while closed; a topic with no live sender items keeps its existing layout
function VisibleSection({
	userId,
	topic,
	elements,
	onCopy,
	className,
}: TopicPersonalSourcesSectionProps & { userId: string }) {
	const metadata = useQuery({
		queryKey: ["topic-personalSources", userId, topic.id],
		queryFn: ({ signal }) => fetchTopicPersonalSources(topic.id, signal),
		gcTime: 0,
		refetchInterval: 15_000,
	})
	const entryCount = metadata.data ? toPersonalSourcesEntryCount(metadata.data) : 0
	if (entryCount === 0) {
		return null
	}
	return (
		<elements.Row className={className}>
			<elements.ExpandableRow
				title={toPersonalSourcesSectionTitle(entryCount)}
				metadata="Only you can see this"
				variant="section"
				isLast
			>
				<PersonalSourcesContents
					userId={userId}
					canContribute={"canEdit" in topic ? Boolean(topic.canEdit) : topic.isTopicOwner}
					topic={topic}
					elements={elements}
					onCopy={onCopy}
				/>
			</elements.ExpandableRow>
		</elements.Row>
	)
}

// load only while expanded and discard decrypted state when the section closes or the signed-in account changes
function PersonalSourcesContents({
	userId,
	canContribute,
	topic,
	elements,
	onCopy,
}: {
	userId: string
	canContribute: boolean
	topic: TopicDetails
	elements: TopicPersonalSourcesElements
	onCopy: (text: string) => Promise<boolean>
}) {
	const state = useTopicPersonalSourcesContents({ userId, topicId: topic.id })
	return (
		<TopicPersonalSourcesContents
			topic={topic}
			state={state}
			canContribute={canContribute}
			elements={elements}
			emptyControls={
				<PersonalSourcesEmailControls userId={userId} topicId={topic.id} elements={elements} onCopy={onCopy} />
			}
		/>
	)
}
