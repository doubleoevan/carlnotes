import type { Meta, StoryObj } from "@storybook/react-native"
import { ChatBudgetNotice } from "./ChatBudgetNotice"

// the spent budget's line with the plans link where the store sells the user a plan, and without it elsewhere
const meta: Meta<typeof ChatBudgetNotice> = {
	title: "Chat/ChatBudgetNotice",
	component: ChatBudgetNotice,
	args: { canPurchase: true },
	parameters: { webReference: "apps/web/src/components/chat/ChatBudgetNotice.tsx at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const WithPlansLink: Story = {}
export const ReadOnly: Story = { args: { canPurchase: false } }
