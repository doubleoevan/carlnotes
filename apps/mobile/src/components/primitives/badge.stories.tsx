// the mobile Badge: a small pill for a tag or a source kind, in each of its variants, with the web stories' names
import { badgeVariantNames } from "@carlnotes/nightshift/components/badge"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { Badge, type BadgeProps } from "./badge"
import { Text } from "./text"

const meta = {
	title: "Primitives/Badge",
	component: Badge,
	args: { children: "deep learning", variant: "secondary" },
	argTypes: {
		variant: { control: "inline-radio", options: badgeVariantNames },
		children: { control: "text" },
		asChild: { control: false },
	},
	render: (args) => <LabeledBadge {...args} />,
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

// the quiet fill every tag in the app uses
export const Secondary: Story = {}

// the highlight fill, the badge's default, which no badge in the app uses
export const Default: Story = { args: { variant: "default" } }

// a border and no fill, as the source kind at the start of a source row in the edit topic dialog
export const Outline: Story = {
	args: { variant: "outline", children: "rss" },
	parameters: { surface: "card" },
	render: (args) => (
		<View className="flex-row items-center gap-2">
			<LabeledBadge {...args} />
			<Text className="min-w-0 flex-1 text-sm text-muted-foreground" numberOfLines={1}>
				example.com
			</Text>
		</View>
	),
}

// a badge whose label is the story's text
function LabeledBadge({ children, ...props }: BadgeProps) {
	return (
		<Badge {...props}>
			<Text>{String(children)}</Text>
		</Badge>
	)
}
