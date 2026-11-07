import { UserBlocksCard } from "@carlnotes/core/components/UserBlocksSection"
import { BLOCKED_USER_ID, toLoadedUserBlocksList } from "@carlnotes/core/lib/userBlocksStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { USER_BLOCKS_ELEMENTS } from "./AccountFields"

// a loaded list, which each state story changes
const LOADED_LIST = toLoadedUserBlocksList({ retry: () => undefined, unblock: async () => true })

// the Blocked people card's states, with the web account page's words and no user block requests
const meta: Meta<typeof UserBlocksCard> = {
	title: "Account/UserBlocksSection",
	component: UserBlocksCard,
	args: { elements: USER_BLOCKS_ELEMENTS, userBlocksList: LOADED_LIST },
	parameters: { webReference: "apps/web/src/components/account/AccountSettings.tsx, Blocked people, at 375px" },
	decorators: [
		(Story) => (
			<View style={{ width: "100%" }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Unblocking: Story = {
	args: { userBlocksList: { ...LOADED_LIST, unblockingUserIds: new Set([BLOCKED_USER_ID]) } },
}
export const Loading: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [], isLoading: true } } }
export const Failed: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [], hasError: true } } }
export const Empty: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [] } } }
