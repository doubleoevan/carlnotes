import type { ComponentType, ReactNode } from "react"
import { EMPTY_TOPIC_SECTION } from "../lib/topicFeedLabels"

// the platform's empty list card, and its body-text link that starts a new topic
export type NewTopicEmptyCardElements = {
	Card: ComponentType<{ className?: string; children: ReactNode }>
	Link: ComponentType<{ label: string; onPress: () => void }>
}

/**
 * Renders a topic list with no topics: the standard empty card, whose one line starts a new topic.
 */
export function NewTopicEmptyCard({
	onNewTopic,
	className,
	elements: { Card, Link },
}: {
	onNewTopic: () => void
	className?: string
	elements: NewTopicEmptyCardElements
}) {
	return (
		<Card className={className}>
			<Link label={EMPTY_TOPIC_SECTION} onPress={onNewTopic} />
		</Card>
	)
}
