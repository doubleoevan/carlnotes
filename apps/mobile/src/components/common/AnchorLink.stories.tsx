import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { AnchorLink } from "./AnchorLink"

// the same destinations as the web's common-anchorlink stories
const meta = {
	title: "Common/AnchorLink",
	component: AnchorLink,
	parameters: { webReference: "common-anchorlink--internal-route, --external, --uri-scheme" },
	args: {
		href: "/",
		accessibilityLabel: "CarlNotes home",
		className: "min-h-12 justify-center",
	},
	render: (args) => (
		<AnchorLink {...args}>
			<Text className="text-link">{args.accessibilityLabel}</Text>
		</AnchorLink>
	),
} satisfies Meta<typeof AnchorLink>
export default meta
type Story = StoryObj<typeof meta>
export const InternalRoute: Story = {}
export const External: Story = {
	args: {
		href: "https://carlnotes.com/docs",
		accessibilityLabel: "CarlNotes docs",
	},
}
export const UriScheme: Story = {
	args: {
		href: "mailto:hello@example.com",
		accessibilityLabel: "Email",
	},
}
export const Replacement: Story = {
	args: {
		href: "/sign-in",
		shouldReplace: true,
		accessibilityLabel: "Sign in",
	},
}
