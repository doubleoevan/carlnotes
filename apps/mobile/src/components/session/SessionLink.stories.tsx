import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { SessionFooterLink } from "./SessionLink"
import { SessionScreen } from "./SessionScreen"

// keep session navigation aligned at ordinary and constrained widths
const meta = {
	title: "Session/SessionLink",
	component: SessionFooterLink,
	args: { prompt: "Don't have an account?", linkLabel: "Sign up", href: "/sign-up" },
	parameters: { webReference: "apps/web/src/components/session/SessionLayout.tsx" },
} satisfies Meta<typeof SessionFooterLink>
export default meta
type Story = StoryObj<typeof meta>
export const SignUp: Story = {}
export const SignIn: Story = { args: { prompt: "Already have an account?", linkLabel: "Log in", href: "/sign-in" } }
export const Narrow: Story = {
	decorators: [
		(Story) => (
			<View style={{ width: 200 }}>
				<Story />
			</View>
		),
	],
}
export const SessionFrame: Story = {
	decorators: [
		(Story) => (
			<SessionScreen>
				<Story />
			</SessionScreen>
		),
	],
}
