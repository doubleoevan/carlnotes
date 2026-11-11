// a topic as a card: its image over its name, byline, tags, and reaction count, all one link to its page. the count
// sits at the right of the card's last row
import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { ComponentType } from "react"
import type { CardElements } from "./cardElements"

// the platform's elements over the shared card elements: the name, the byline, and a tag. the name takes the topic's
// path like the card, so the browser stretches the name's link over the card, which keeps the byline's own links
// valid html
export type TopicCardElements = CardElements & {
	Name: ComponentType<{ path: string; label: string; onOpen?: () => void; children: string }>
	Byline: ComponentType<{ topic: Pick<TopicCardFields, "owner" | "teamLink"> }>
	Tag: ComponentType<{ children: string }>
}

// the topic and what opening the card reports
export type TopicCardProps = { topic: TopicCardFields; onOpen?: () => void }

/**
 * Draws a topic card from the shared fields. The image is the page size, the whole card opens the topic.
 */
export function TopicCard({
	topic,
	onOpen,
	elements: { Card, Image, Name, Byline, Tag, Reactions, Row },
}: TopicCardProps & { elements: TopicCardElements }) {
	// the reaction count sits at the right of the card's last row: the tags' row, or the byline's for a topic with no tag
	const hasTags = topic.tags.length > 0
	const reactions = topic.reactionCount > 0 ? <Reactions count={topic.reactionCount} /> : null
	return (
		<Card path={topic.path} label={`Open ${topic.name}`} className={cardClasses.root} onOpen={onOpen}>
			<Image image={topic.image} name={topic.name} />
			<Row className={cardClasses.body}>
				<Name path={topic.path} label={`Open ${topic.name}`} onOpen={onOpen}>
					{topic.name}
				</Name>
				{/* the byline, with the reaction count at its right for a topic with no tag */}
				<Row className="flex-row items-center gap-2">
					<Row className="min-w-0 flex-1">
						<Byline topic={topic} />
					</Row>
					{!hasTags && reactions}
				</Row>
				{/* the tags and the reaction count share the last line */}
				{hasTags && (
					<Row className="flex-row flex-wrap items-center gap-1">
						{topic.tags.map((tag) => (
							<Tag key={tag}>{tag}</Tag>
						))}
						{reactions}
					</Row>
				)}
			</Row>
		</Card>
	)
}
