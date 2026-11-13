import { TEAM_INVITES_TABLE_LABELS } from "@carlnotes/core/lib/sentInvitesTableColumns"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { SentInvitesTable } from "./SentInvitesTable"

// a team invite that was joined and one still pending, as the web's TeamInvitations story shows them
const meta = {
	title: "Table/SentInvitesTable",
	component: SentInvitesTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/SentInvitesTable.tsx at 375px" },
	args: {
		labels: TEAM_INVITES_TABLE_LABELS,
		inviteRows: [
			{
				inviteId: "invite-vienna",
				target: <Text className="text-sm text-link">Reading group</Text>,
				targetName: "Reading group",
				invitee: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
				inviteeEmail: null,
				invitedAt: "2026-09-02T12:00:00.000Z",
				acceptedAt: "2026-09-03T12:00:00.000Z",
			},
			{
				inviteId: "invite-robin",
				target: <Text className="text-sm text-link">Reading group</Text>,
				targetName: "Reading group",
				invitee: null,
				inviteeEmail: "robin@example.com",
				invitedAt: "2026-10-01T12:00:00.000Z",
				acceptedAt: null,
			},
		],
		onDeleteInvite: async () => undefined,
		onReload: () => undefined,
	},
} satisfies Meta<typeof SentInvitesTable>
export default meta
type Story = StoryObj<typeof meta>
export const TeamInvitations: Story = {}
