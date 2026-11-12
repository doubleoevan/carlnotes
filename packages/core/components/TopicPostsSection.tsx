// a Topic's Topic Posts as a section of cards: the author's own drafts first, then the published Topic Posts newest
// first, under the button that starts a draft for a user who may publish
import { OPEN_MIC_TITLE, type TopicPostCard, type TopicPostsResponse } from "@carlnotes/contracts/topicPosts"
import type { ComponentType, ReactNode } from "react"
import { type CardSection, TOPIC_POST_CARD_SECTION } from "../lib/cardSections"
import { TOPIC_POST_LABELS } from "../lib/topicPosts"
import { type CardsSectionElements, PagedCardsSection } from "./CardsSection"

// the section of a Topic's Topic Posts: its accordion value, its title, the noun its count counts, and each card's key
const TOPIC_POSTS_SECTION: CardSection<TopicPostCard> = {
	value: "topic-posts",
	title: OPEN_MIC_TITLE,
	...TOPIC_POST_CARD_SECTION,
}

// the platform's elements over a card section's: one Topic Post's card, the button that starts a draft, and the row
// that an empty section shows to a user who may publish
export type TopicPostsSectionElements = CardsSectionElements & {
	Card: ComponentType<{ topicPost: TopicPostCard }>
	NewPostButton: ComponentType<{ label: string; isDisabled: boolean; onPress: () => void }>
	// the button, then the section's one line
	Empty: ComponentType<{ action: ReactNode; children: string }>
}

// the Topic's Topic Posts with whether the user may publish, the press on the button, and whether a draft is being
// created
export type TopicPostsSectionProps = TopicPostsResponse & { onNewPost: () => void; isCreating: boolean }

/**
 * Shows a Topic's Topic Posts as cards, six to a page, under the button that starts a draft for a user who may
 * publish. A section with no card is absent for a reader who may not publish.
 */
export function TopicPostsSection({
	topicPosts,
	canPublish,
	onNewPost,
	isCreating,
	elements,
}: TopicPostsSectionProps & { elements: TopicPostsSectionElements }) {
	const { Section, Card, NewPostButton, Empty } = elements
	const hasTopicPosts = topicPosts.length > 0
	const newPostButton = canPublish ? (
		<NewPostButton label={TOPIC_POST_LABELS.newPost} isDisabled={isCreating} onPress={onNewPost} />
	) : null

	// a section with no Topic Post shows only to a user who may publish, with the button beside the empty line and no
	// count
	if (!hasTopicPosts) {
		return canPublish ? (
			<Section value={TOPIC_POSTS_SECTION.value} title={TOPIC_POSTS_SECTION.title} countLabel="" cardCount={0}>
				<Empty action={newPostButton}>{TOPIC_POST_LABELS.empty}</Empty>
			</Section>
		) : null
	}
	return (
		<PagedCardsSection
			section={TOPIC_POSTS_SECTION}
			rows={topicPosts}
			action={newPostButton}
			renderCard={(topicPost) => <Card topicPost={topicPost} />}
			elements={elements}
		/>
	)
}
