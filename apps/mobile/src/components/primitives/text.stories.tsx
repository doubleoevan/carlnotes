// the mobile Text: the app's text in the body font, alone and inside a Button that gives it the button's label classes
import type { Meta, StoryObj } from "@storybook/react-native"
import { Button } from "./button"
import { Text } from "./text"

const meta = {
	title: "Primitives/Text",
	component: Text,
	args: { children: "Carl reads the web so you don't have to." },
	argTypes: { children: { control: "text" } },
} satisfies Meta<typeof Text>

export default meta
type Story = StoryObj<typeof meta>

// body text in the foreground color
export const Default: Story = {}

// muted text, as a hint under a field
export const Muted: Story = { args: { className: "text-sm text-muted-foreground" } }

// the label inside a Button, which takes the button's text classes through the context
export const InButton: Story = {
	args: { children: "Save topic" },
	render: (args) => (
		<Button accessibilityLabel={String(args.children)}>
			<Text {...args} />
		</Button>
	),
}
