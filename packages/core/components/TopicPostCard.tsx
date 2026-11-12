// a Topic Post as a card: its image, pulsing until it is drawn, over its title with the info popup right after it, its
// author's byline, and its date, or the Draft mark on a draft, with the reaction count at the right of that last row
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { TopicPostCard as TopicPostCardFields } from "@carlnotes/contracts/topicPosts"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { ComponentType, ReactNode } from "react"
import { TOPIC_POST_LABELS, toTopicPostDetailsText, toTopicPostTitle } from "../lib/topicPosts"
import type { CardElements } from "./cardElements"
import type { TopicPostInfoProps } from "./TopicPostInfo"

// the platform's elements over the shared card elements: the title, the info popup, the author's byline, the date,
// and the Draft mark. the title takes the Topic Post's path like the card, so the browser stretches the title's link
// over the card, which keeps the byline's own link and the info button valid html. the title also places the info
// popup, which follows its last word
export type TopicPostCardElements = CardElements & {
	Title: ComponentType<{ path: string; label: string; onOpen?: () => void; aside: ReactNode; children: string }>
	Info: ComponentType<TopicPostInfoProps>
	Byline: ComponentType<{ author: ProfileIdentity }>
	Details: ComponentType<{ children: string }>
	DraftMark: ComponentType<{ children: string }>
}

// the Topic Post and what opening the card reports
export type TopicPostCardProps = { topicPost: TopicPostCardFields; onOpen?: () => void }

/**
 * Draws a Topic Post card from the shared fields. The whole card opens the Topic Post, or the editor on its author's
 * draft.
 */
export function TopicPostCard({
	topicPost,
	onOpen,
	elements: { Card, Image, Title, Info, Byline, Reactions, Details, DraftMark, Row },
}: TopicPostCardProps & { elements: TopicPostCardElements }) {
	const title = toTopicPostTitle(topicPost)
	const label = `Open ${title}`
	return (
		<Card path={topicPost.path} label={label} className={cardClasses.root} onOpen={onOpen}>
			<Image image={topicPost.image} name={title} isPending={!topicPost.image} />
			<Row className={cardClasses.body}>
				{/* the title, with the info popup right after it */}
				<Title
					path={topicPost.path}
					label={label}
					onOpen={onOpen}
					aside={<Info topicPostId={topicPost.id} title={title} />}
				>
					{title}
				</Title>
				<Byline author={topicPost.author} />
				{/* the date of a published Topic Post or the mark on a draft, with the reaction count at the
				    row's right */}
				<Row className="flex-row items-center gap-2">
					<Row className="min-w-0 flex-1 flex-row">
						{topicPost.publishedAt ? (
							<Details>{toTopicPostDetailsText(topicPost)}</Details>
						) : (
							<DraftMark>{TOPIC_POST_LABELS.draft}</DraftMark>
						)}
					</Row>
					{topicPost.reactionCount > 0 && <Reactions count={topicPost.reactionCount} />}
				</Row>
			</Row>
		</Card>
	)
}
