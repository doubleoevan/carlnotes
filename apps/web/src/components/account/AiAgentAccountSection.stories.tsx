import { aiAgentAccountStory } from "@carlnotes/core/lib/aiAgentAccountStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { AiAgentAccountSection } from "./AiAgentAccountSection"

// these previews never call an account endpoint
const meta = {
	title: "Account/AiAgentAccountSection",
	component: AiAgentAccountSection,
	args: { account: aiAgentAccountStory() },
	decorators: [
		(Story) => (
			<div className="max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof AiAgentAccountSection>
export default meta
type Story = StoryObj<typeof meta>

export const Connected: Story = {}
export const Disconnected: Story = {
	args: {
		account: aiAgentAccountStory({
			aiAgents: aiAgentAccountStory().aiAgents.map((aiAgent) => ({ ...aiAgent, isConnected: false })),
			canCreate: false,
		}),
	},
}
export const Empty: Story = { args: { account: aiAgentAccountStory({ aiAgents: [], keys: [] }) } }
// a free account sees no API keys section
export const WithoutPremium: Story = {
	args: { account: aiAgentAccountStory({ aiAgents: [], keys: [], canCreate: false }) },
}
export const Loading: Story = {
	args: { account: aiAgentAccountStory({ aiAgents: [], keys: [], isLoading: true, canCreate: false }) },
}
export const Failed: Story = {
	args: { account: aiAgentAccountStory({ aiAgents: [], keys: [], hasError: true, canCreate: false }) },
}
export const OneTimeKey: Story = {
	args: { account: aiAgentAccountStory({ secret: "example-only-secret-copy-before-closing-this-preview" }) },
}
export const Pending: Story = { args: { account: aiAgentAccountStory({ isPending: true }) } }
