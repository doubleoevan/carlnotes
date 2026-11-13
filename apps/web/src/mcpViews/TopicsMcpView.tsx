import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import type { McpViewTopics } from "@carlnotes/contracts/mcpViews"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { RelatedTopic, RelatedTopicsSectionElements } from "@carlnotes/core/components/RelatedTopicsSection"
import { type CardSection, TOPIC_CARD_SECTION } from "@carlnotes/core/lib/cardSections"
import { EMPTY_TOPIC_SECTION, TOPIC_SECTION_TITLES } from "@carlnotes/core/lib/topicFeedLabels"
import { AccordionSection } from "@/components/common/AccordionSection"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { Accordion } from "@/components/primitives/accordion"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { RELATED_TOPICS_SECTION_ELEMENTS, RelatedTopicsSection } from "@/components/topic/RelatedTopicsSection"
import { FLUSH_FIRST_SECTION_CLASS } from "@/lib/styleClasses"
import { McpViewLink } from "./McpViewLink"
import { McpViewTopicCard } from "./McpViewTopicCard"
import { McpViewSiteLink } from "./mcpViewElements"

// the accordion value of the section's cards, and the title of the list with no section
const TOPICS_SECTION_VALUE = "topics-section"
const ALL_TOPICS_TITLE = "Topics"

// what the MCP view shows a topic with no similar topic
export const NO_SIMILAR_TOPICS_TEXT = "No similar topics yet."

/**
 * The topics MCP view: a list_topics page as the home's topic cards under its section of the topics page, or a
 * topic's similar topics as the topic's page lists them. A card's press or a similar topic's name reads that Topic's
 * findings through the host and moves to them.
 */
export function TopicsMcpView({ mcpViewTopics }: { mcpViewTopics: McpViewTopics }) {
	if (mcpViewTopics.kind === "similarTopics") {
		return <McpViewSimilarTopics topicName={mcpViewTopics.topicName} relatedTopics={mcpViewTopics.relatedTopics} />
	}
	const { sectionKey, topicCards, hasMoreTopics } = mcpViewTopics
	const topicCardSection: CardSection<TopicCardFields> = {
		value: TOPICS_SECTION_VALUE,
		title: sectionKey ? TOPIC_SECTION_TITLES[sectionKey] : ALL_TOPICS_TITLE,
		...TOPIC_CARD_SECTION,
	}
	return (
		<div>
			{/* the section open in the home's accordion, its title flush with the frame's top, or its empty line */}
			<Accordion type="multiple" defaultValue={[topicCardSection.value]} className={FLUSH_FIRST_SECTION_CLASS}>
				{topicCards.length > 0 ? (
					<PagedCardsSection
						section={topicCardSection}
						rows={topicCards}
						renderCard={(topic) => <McpViewTopicCard topic={topic} />}
					/>
				) : (
					<AccordionSection
						value={topicCardSection.value}
						title={topicCardSection.title}
						countLabel={toCountLabel(0, "topic")}
					>
						<EmptyListCard>{EMPTY_TOPIC_SECTION}</EmptyListCard>
					</AccordionSection>
				)}
			</Accordion>
			{/* ponytail: the MCP view shows the tool's first page of topics, and the rest on the topics page. page through
			    the tool's cursor if a section grows past a page of topics */}
			{hasMoreTopics && <McpViewSiteLink href="/topics">See all on CarlNotes</McpViewSiteLink>}
		</div>
	)
}

// a topic's similar topics under the topic's name, or the empty line for a topic with none
function McpViewSimilarTopics({ topicName, relatedTopics }: { topicName: string; relatedTopics: RelatedTopic[] }) {
	return (
		<div>
			<p className="font-display mb-2 min-w-0 text-lg">{topicName}</p>
			{relatedTopics.length > 0 ? (
				<RelatedTopicsSection relatedTopics={relatedTopics} elements={MCP_VIEW_RELATED_TOPICS_SECTION_ELEMENTS} />
			) : (
				<EmptyListCard>{NO_SIMILAR_TOPICS_TEXT}</EmptyListCard>
			)}
		</div>
	)
}

// the topic page's elements of the table, with a name whose link reads the similar topic's findings in the MCP view
const MCP_VIEW_RELATED_TOPICS_SECTION_ELEMENTS: RelatedTopicsSectionElements = {
	...RELATED_TOPICS_SECTION_ELEMENTS,
	TopicNameLink: ({ topic }) => <TopicNameLink topic={topic} TopicLink={McpViewLink} />,
}
