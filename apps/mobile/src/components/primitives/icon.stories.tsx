// the mobile Icon: a Lucide icon at 16 points, alone, sized and colored by its className, and inside a Button
import type { Meta, StoryObj } from "@storybook/react-native"
import { Coffee, Play, Plus } from "lucide-react-native"
import { Button } from "./button"
import { Icon } from "./icon"
import { Text } from "./text"

const meta = {
	title: "Primitives/Icon",
	component: Icon,
	args: { as: Coffee },
	argTypes: { as: { control: false }, className: { control: "text" } },
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

// the icon at its 16 points in the foreground color
export const Default: Story = {}

// a larger icon in the primary color, which its className sets
export const Sized: Story = { args: { className: "size-8 text-primary" } }

// the fill and stroke use the same Nightshift text color
export const Filled: Story = { args: { as: Play, className: "size-8 text-primary", fill: "currentColor" } }

// an icon before a Button's label, in the button's text color
export const InButton: Story = {
	args: { as: Plus },
	render: (args) => (
		<Button accessibilityLabel="New topic">
			<Icon {...args} />
			<Text>New topic</Text>
		</Button>
	),
}

// the coffee cup retains its handle and steam against a primary button
export const Brew: Story = {
	render: () => (
		<Button accessibilityLabel="Brew">
			<Icon as={Coffee} />
			<Text>Brew</Text>
		</Button>
	),
}
