import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Sheet } from "@/components/common/Sheet"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"
import { TopicInfoButton, TopicInfoContent } from "./TopicInfo"
import { STORY_FILM_TOPIC_PAGE, STORY_TOPIC_PAGE } from "./topicPageStories"

// open the complete topic note from its real trigger
const meta = {
	title: "Topic/TopicInfo",
	component: TopicInfoButton,
	parameters: { webReference: "apps/web/src/components/topic/TopicInfo.tsx at 375px" },
	args: {
		topic: toTestTopicFeed({
			scanSummary: "Fresh research on water temperature and grind size helps you make a better cup.",
			subscriberCount: 12,
			teamCount: 2,
		}),
	},
} satisfies Meta<typeof TopicInfoButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const WithPodcast: Story = { args: { topic: STORY_TOPIC_PAGE } }

// the latest podcast episode with a ready film, which shows the film above its row
export const WithFilm: Story = { args: { topic: STORY_FILM_TOPIC_PAGE } }
export const Private: Story = { args: { topic: toTestTopicFeed({ visibility: "private" }) } }
export const Empty: Story = { args: { topic: toTestTopicFeed({ findings: [], scanSummary: null, owner: null }) } }
export const LongNotes: Story = {
	args: {
		topic: toTestTopicFeed({
			prompt: "Learn about brewing coffee with different methods. ".repeat(30),
			scanSummary: "Water temperature and grind size both matter.\n\n".repeat(30),
		}),
	},
}

// render both flat item states inside the real platform popover
export const PersonalSourcesCollapsed: Story = { render: () => <InfoStory isClosed /> }
export const PersonalSourcesWithItems: Story = { render: () => <InfoStory /> }
export const PersonalSourcesExpanded: Story = { render: () => <InfoStory isExpanded /> }
export const PersonalSourcesEmpty: Story = { render: () => <InfoStory isEmpty /> }
export const Paginated: Story = { render: () => <InfoStory isPaged /> }
function InfoStory({
	isExpanded = false,
	isEmpty = false,
	isClosed = false,
	isPaged = false,
}: {
	isExpanded?: boolean
	isEmpty?: boolean
	isClosed?: boolean
	isPaged?: boolean
}) {
	// fictional owner data stays local to the story
	const topic = toTestTopicFeed({
		name: "LLM evals",
		prompt: "New methods for evaluating LLM agents, especially catching drift and regressions before users do.",
		visibility: "private",
		findings: [],
		scanSummary: null,
	})
	const personalSources = (
		<TopicPersonalSourcesSectionStory
			className="border-t border-dashed border-separator-strong"
			elements={PERSONAL_SOURCES_ELEMENTS}
			isEntryExpanded={isExpanded}
			initialOpen={!isClosed}
			variant={isEmpty ? "empty" : isPaged ? "paged" : "ready"}
		/>
	)
	return (
		<Sheet title="Topic roast" onClose={() => {}}>
			<TopicInfoContent topic={topic} personalSources={personalSources} />
		</Sheet>
	)
}
