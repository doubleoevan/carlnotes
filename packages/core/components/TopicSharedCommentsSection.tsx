import { authClient } from "@carlnotes/client/authClient"
import { fetchSharedComments } from "@carlnotes/client/socialClient"
import type { SharedComment } from "@carlnotes/contracts/social"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { useQuery } from "@tanstack/react-query"
import { toAgeLabel } from "../lib/labels"
import { CARL_AUTHOR_LABEL, toSharedCommentsSectionTitle } from "../lib/socialLabels"
import type { TopicPersonalSourcesElements } from "./TopicPersonalSources"

// the Topic, the elements the Personal sources list renders through, and the row's own class
type TopicSharedCommentsSectionProps = {
	topic: TopicDetails & { canEdit?: boolean }
	elements: TopicPersonalSourcesElements
	className?: string
}

/**
 * Lists the comments a Topic shares with the podcast in the Topic's sources list, as a group of its own for a user who
 * may edit the Topic.
 */
export function TopicSharedCommentsSection({ topic, elements, className }: TopicSharedCommentsSectionProps) {
	const { data: session } = authClient().useSession()
	if (!session || !(topic.canEdit ?? topic.isTopicOwner)) {
		return null
	}
	return (
		<LoadedSharedComments
			key={`${session.user.id}:${topic.id}`}
			topic={topic}
			elements={elements}
			className={className}
		/>
	)
}

// the group, read for the signed-in editor. a Topic that shares nothing keeps its layout
function LoadedSharedComments({ topic, elements, className }: TopicSharedCommentsSectionProps) {
	const sharedComments = useQuery({
		queryKey: ["topic-sharedComments", topic.id],
		queryFn: () => fetchSharedComments(topic.id),
	})
	if (!sharedComments.data?.length) {
		return null
	}
	return <SharedCommentsGroup sharedComments={sharedComments.data} elements={elements} className={className} />
}

// the shared comments to list, the elements, the row's own class, and whether the group starts open
type SharedCommentsGroupProps = {
	sharedComments: SharedComment[]
	elements: TopicPersonalSourcesElements
	className?: string
	initialOpen?: boolean
}

/**
 * The shared comments group: each shared comment with its author, when it was shared, its words, and a link to its
 * page.
 */
export function SharedCommentsGroup({ sharedComments, elements, className, initialOpen }: SharedCommentsGroupProps) {
	const { Row, ExpandableRow, Group, Text, Link } = elements
	return (
		<Row className={className}>
			<ExpandableRow
				title={toSharedCommentsSectionTitle(sharedComments.length)}
				metadata="Carl and Vienna read these"
				variant="section"
				initialOpen={initialOpen}
				isLast
			>
				{sharedComments.map((sharedComment) => (
					<Group key={sharedComment.id}>
						<Text className="text-sm font-semibold">
							{`${sharedComment.author?.username ?? CARL_AUTHOR_LABEL} · ${toAgeLabel(sharedComment.sharedAt)}`}
						</Text>
						<Text className="text-sm">{sharedComment.body}</Text>
						<Link href={sharedComment.path}>Open</Link>
					</Group>
				))}
			</ExpandableRow>
		</Row>
	)
}
