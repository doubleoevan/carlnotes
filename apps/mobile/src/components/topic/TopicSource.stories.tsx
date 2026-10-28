import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { TopicDefaultSource, TopicSource } from "./TopicSource"

// compare the same source rows with the web at phone width
const meta: Meta<typeof TopicSource> = {
	title: "Topic/TopicSource",
	component: TopicSource,
	args: { sourceKind: "rss", summary: "example.com", onRemoveTopicSource: () => {} },
	decorators: [
		(Story) => (
			<View className="w-full max-w-sm">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/topic/TopicSource.stories.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>

export const CustomSource: Story = {}
export const Screening: Story = { args: { screeningMessage: "checking" } }
export const DefaultSource: Story = { render: () => <DefaultSourceStory /> }
export const DefaultSourceOff: Story = { render: () => <DefaultSourceStory isInitiallyOn={false} /> }

// keep toggles local so previews never change a topic
function DefaultSourceStory({ isInitiallyOn = true }: { isInitiallyOn?: boolean }) {
	const [isOn, setIsOn] = useState(isInitiallyOn)
	return (
		<TopicDefaultSource
			label="web"
			summary="Let Carl crawl"
			isOn={isOn}
			onTurnOn={() => setIsOn(true)}
			onTurnOff={() => setIsOn(false)}
		/>
	)
}
