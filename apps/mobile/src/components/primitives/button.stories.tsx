// the mobile Button: six variants and six sizes, three of them square for an icon, with the web stories' names
import { buttonSizeNames, buttonVariantNames } from "@carlnotes/nightshift/components/button"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Lightbulb, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react-native"
import { View } from "react-native"
import { Button, type ButtonProps } from "./button"
import { Icon } from "./icon"
import { Text } from "./text"

const meta = {
	title: "Primitives/Button",
	component: Button,
	// the web's args, and the label the mobile Button requires. each story reads its label from its own text
	args: {
		children: "Save topic",
		variant: "default",
		size: "default",
		disabled: false,
		accessibilityLabel: "Save topic",
	},
	argTypes: {
		accessibilityLabel: { control: false },
		variant: { control: "inline-radio", options: buttonVariantNames },
		size: { control: "inline-radio", options: buttonSizeNames },
		children: { control: "text" },
		disabled: { control: "boolean" },
		asChild: { control: false },
		onPress: { action: "pressed" },
	},
	render: (args) => <LabeledButton {...args} />,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// the primary fill, the button's default
export const Default: Story = {}

// the red fill on the dialog panel, as the confirm dialog's delete button
export const Destructive: Story = {
	args: { variant: "destructive", children: "Delete topic" },
	parameters: { surface: "card" },
}

// a border and the page color's fill on the dialog panel, as the edit topic dialog's cancel button
export const Outline: Story = { args: { variant: "outline", children: "Cancel" }, parameters: { surface: "card" } }

// the quiet fill, which no button in the app uses
export const Secondary: Story = { args: { variant: "secondary", children: "Skip for now" } }

// no fill until pressed, as a dialog's cancel button
export const Ghost: Story = { args: { variant: "ghost", children: "Cancel" } }

// text in the link color, as the more toggle under a topic's findings, underlined while pressed
export const Link: Story = {
	args: { variant: "link", size: "sm", className: "justify-start pr-0 pl-9" },
	render: (args) => (
		<Button {...args} accessibilityLabel="Show 5 more">
			<Text>+ 5 more </Text>
			<Text className="text-lg leading-none">▾</Text>
		</Button>
	),
}

// the home page's small New Topic button beside the default size. no app button is large
export const Sizes: Story = {
	render: (args) => (
		<View className="flex-row items-center gap-3">
			<Button {...args} size="sm" accessibilityLabel="New Topic" className="gap-1.5 rounded-lg">
				<Icon as={Plus} />
				<Text>New Topic</Text>
			</Button>
			<LabeledButton {...args} size="default" />
		</View>
	),
}

// a table row's small ghost ✕ and the rating thumbs. no app button uses the large square size
export const IconSizes: Story = {
	parameters: { surface: "card" },
	render: (args) => (
		<View className="flex-row items-center gap-3">
			<Button {...args} variant="ghost" size="icon-sm" accessibilityLabel="Delete Reading Group">
				<Icon as={X} />
			</Button>
			{/* the thumbs up the user pressed, then the thumbs down */}
			<Button {...args} size="icon" accessibilityLabel="Thumbs up" accessibilityState={{ selected: true }}>
				<Icon as={ThumbsUp} />
			</Button>
			<Button
				{...args}
				variant="outline"
				size="icon"
				accessibilityLabel="Thumbs down"
				accessibilityState={{ selected: false }}
			>
				<Icon as={ThumbsDown} />
			</Button>
		</View>
	),
}

// an icon before the label, as the edit topic dialog's small Recommend button
export const WithIcon: Story = {
	args: { variant: "outline", size: "sm" },
	parameters: { surface: "card" },
	render: (args) => (
		<Button {...args} accessibilityLabel="Recommend">
			<Icon as={Lightbulb} className="size-3.5" />
			<Text>Recommend</Text>
		</Button>
	),
}

// a disabled button, dimmed and ignoring presses
export const Disabled: Story = { args: { disabled: true } }

// a button whose label is the story's text, read as its accessibility label
function LabeledButton({ children, ...props }: ButtonProps) {
	const label = String(children)
	return (
		<Button {...props} accessibilityLabel={label}>
			<Text>{label}</Text>
		</Button>
	)
}
