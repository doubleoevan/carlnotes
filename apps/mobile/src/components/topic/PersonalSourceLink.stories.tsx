import { PERSONAL_SOURCE_LINK_OUTCOMES, PERSONAL_SOURCES_TOPIC_STORY } from "@carlnotes/core/lib/personalSourcesStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { PersonalSourceLink } from "./PersonalSourceLink"

// the same pending, reviewed, and kept link states use fictional data on both platforms
const meta = {
	title: "Topic/PersonalSourceLink",
	component: PersonalSourceLink,
	parameters: { webReference: "apps/web/src/components/topic/PersonalSourceLink.stories.tsx at 375px" },
	args: {
		topic: PERSONAL_SOURCES_TOPIC_STORY,
		url: PERSONAL_SOURCE_LINK_OUTCOMES.finding.url,
		outcome: PERSONAL_SOURCE_LINK_OUTCOMES.finding,
	},
} satisfies Meta<typeof PersonalSourceLink>
export default meta
type Story = StoryObj<typeof meta>
export const Finding: Story = {}
export const Queued: Story = { args: { outcome: PERSONAL_SOURCE_LINK_OUTCOMES.queued } }
export const Scored: Story = { args: { outcome: PERSONAL_SOURCE_LINK_OUTCOMES.scored } }
export const Rejected: Story = { args: { outcome: PERSONAL_SOURCE_LINK_OUTCOMES.rejected } }
export const UnavailableFinding: Story = { args: { topic: { ...PERSONAL_SOURCES_TOPIC_STORY, findings: [] } } }

export const PageTitle: Story = {
	args: {
		outcome: {
			...PERSONAL_SOURCE_LINK_OUTCOMES.scored,
			title: "How to evaluate long-running agents against real production failures",
		},
	},
}
export const LongUrl: Story = {
	args: {
		url: "https://example.com/research/evaluating-long-running-agents/production-regressions?comparison=offline-replay-and-live-sampling",
		outcome: undefined,
	},
}
