import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicInfoSection } from "./TopicInfoSection"

// keep React elements out of serializable story arguments
const meta = {
	title: "Topic/TopicInfoSection",
	component: SectionStory,
	parameters: { webReference: "apps/web/src/components/topic/TopicInfoSection.stories.tsx at 375px" },
	args: { label: "Carl's Prompt" },
} satisfies Meta<typeof SectionStory>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const First: Story = { args: { isFirst: true } }

function SectionStory(props: { label: string; isFirst?: boolean }) {
	return (
		<TopicInfoSection {...props}>
			<p>New methods for evaluating language models.</p>
		</TopicInfoSection>
	)
}
