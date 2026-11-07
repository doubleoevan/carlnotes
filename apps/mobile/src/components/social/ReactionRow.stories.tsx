import { EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import { toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ReactionRow } from "./ReactionRow"

// the same states as the web's reaction row stories, with no saved writes
const meta: Meta<typeof ReactionRow> = {
	title: "Social/ReactionRow",
	component: ReactionRow,
	args: { target: { kind: "finding", id: "finding-1" }, summary: toTestReactionSummary(), isSignedIn: true },
	parameters: { webReference: "apps/web/src/components/social/ReactionRow.tsx at 375px" },
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
export const WithReactions: Story = {}
export const Empty: Story = { args: { summary: EMPTY_REACTION_SUMMARY } }
// the user's own type marked
export const OwnReaction: Story = { args: { summary: toTestReactionSummary({ ownReactionType: "like" }) } }
export const Visitor: Story = { args: { isSignedIn: false } }
