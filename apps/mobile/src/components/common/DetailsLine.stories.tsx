// the mobile details line, with the web stories' names
import { toCountDetails } from "@carlnotes/core/lib/detailsLine"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { DetailsLine } from "./DetailsLine"

// the counts of a topic screen with every section filled, in the line's order
const TOPIC_COUNT_DETAILS = toCountDetails([
	{ count: 1, noun: "film" },
	{ count: 17, noun: "podcast episode" },
	{ count: 30, noun: "finding" },
	{ count: 4, noun: "hot take" },
	{ count: 2, noun: "post" },
	{ count: 5, noun: "note" },
	{ count: 6, noun: "similar topic" },
])

const meta = {
	title: "Common/DetailsLine",
	component: DetailsLine,
	parameters: { webReference: "apps/web/src/components/common/DetailsLine.stories.tsx at 375px" },
	args: { details: TOPIC_COUNT_DETAILS },
} satisfies Meta<typeof DetailsLine>

export default meta
type Story = StoryObj<typeof meta>

// a topic screen's counts, each but the last followed by its middle dot
export const Default: Story = {}

// beside the header image the line wraps between counts, and no count breaks inside itself
export const WrappedAtPhoneWidth: Story = {
	render: (args) => (
		<View className="w-54">
			<DetailsLine {...args} />
		</View>
	),
}

// a count of zero is left out, and the counts around it keep their order
export const SomeZero: Story = {
	args: {
		details: toCountDetails([
			{ count: 0, noun: "film" },
			{ count: 3, noun: "podcast episode" },
			{ count: 12, noun: "finding" },
			{ count: 0, noun: "hot take" },
			{ count: 1, noun: "post" },
			{ count: 0, noun: "note" },
			{ count: 0, noun: "similar topic" },
		]),
	},
}

// a line with every count at zero is absent
export const AllZero: Story = { args: { details: toCountDetails([{ count: 0, noun: "film" }]) } }

// a Topic Post's date, reading time, comment count, and edited mark
export const TopicPostDetails: Story = { args: { details: ["Nov 10, 2026", "3 min read", "4 hot takes", "edited"] } }

// what follows the details ends the line, so the last detail keeps its dot
export const WithEnding: Story = {
	args: {
		details: ["Joined November 2026", "20 followers"],
		children: <Text className="text-sm text-link">Blocked</Text>,
	},
}
