import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchTeamPage, sendDeleteTeam, sendRemoveTeamMember } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import type { TeamSummary, TeamsPageResponse } from "@carlnotes/contracts/teams"
import {
	type TeamsPageRow,
	teamSortValues,
	toTeamRowFields,
	toTeamsMembershipTableColumns,
} from "@carlnotes/core/lib/teamsMembershipTableColumns"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, X } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Sheet } from "@/components/common/Sheet"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TeamLink } from "@/components/team/TeamLink"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"
import { TeamMembersTable } from "./TeamMembersTable"
import { TopicsTable } from "./TopicsTable"

/**
 * Shows memberships and invitations with the web's controls and native detail sheets.
 */
export function TeamsMembershipTable({
	teams,
	receivedInvites = [],
	isReadOnly = false,
	onChanged,
}: {
	teams: TeamSummary[]
	receivedInvites?: TeamsPageResponse["receivedInvites"]
	isReadOnly?: boolean
	onChanged: () => void
}) {
	// retain the selected subtable while changing sort or membership settings
	const { data: session } = authClient().useSession()
	const [details, setDetails] = useState<{ teamId: string; kind: "members" | "topics" } | null>(null)
	const mutation = usePageMutation(onChanged)
	const rows: TeamsPageRow[] = [
		...teams.map((membership) => ({ membership })),
		...receivedInvites.map((invite) => ({ invite })),
	]
	function handleLeave(team: TeamSummary): void {
		if (team.isOnlyLeader) {
			setDetails({ teamId: team.teamId, kind: "members" })
			return
		}
		Alert.alert("Leave this team?", `You leave ${team.name} and stop receiving its topics.`, [
			{ text: "Stay", style: "cancel" },
			{
				text: "Leave team",
				style: "destructive",
				onPress: () =>
					void mutation.run(async () => {
						if (!session || !(await sendRemoveTeamMember(team.teamId, session.user.id))) {
							throw new Error("Promote another leader first. A team can't lose its last one.")
						}
					}),
			},
		])
	}
	function handleDelete(team: TeamSummary): void {
		Alert.alert("Delete this team?", "Its topics return to whoever made them, and the room closes with it.", [
			{ text: "Keep it", style: "cancel" },
			{
				text: "Delete team",
				style: "destructive",
				onPress: () =>
					void mutation.run(async () => {
						const deletedTeam = await sendDeleteTeam(team.teamId)
						if (!deletedTeam) {
							throw new Error("That team didn't get deleted. Try again.")
						}
						if (deletedTeam.status === "handedOver") {
							Alert.alert(`You left ${team.name}.`, `@${deletedTeam.newLeaderUsername} leads it now.`)
						}
					}),
			},
		])
	}
	async function handleAccept(inviteId: string): Promise<void> {
		const acceptedInvite = await sendAcceptInvite(inviteId)
		if (acceptedInvite.status !== "joinedTeam" && acceptedInvite.status !== "requestedTeam") {
			throw new Error("That invitation couldn't be accepted. The team may be full or the invitation expired.")
		}
	}
	function renderCount(row: TeamsPageRow, kind: "members" | "topics") {
		const team = toTeamRowFields(row)
		return (
			<Button
				variant="link"
				className="px-0"
				accessibilityLabel={`Show ${team.name}'s ${kind}`}
				onPress={() => setDetails({ teamId: team.teamId, kind })}
			>
				<Text>{kind === "members" ? team.memberCount : team.topicCount}</Text>
				<Icon as={ChevronDown} className="size-4 text-link" />
			</Button>
		)
	}
	const columns = toTeamsMembershipTableColumns({
		teams,
		receivedInvites,
		isReadOnly,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderTeam: (row) => <TeamLink team={toTeamRowFields(row)} />,
		renderDescription: (row) => (
			<Text className="text-sm text-muted-foreground">{toTeamRowFields(row).description || "None"}</Text>
		),
		renderInvitedBy: (row) => {
			const invitedBy =
				"membership" in row
					? (row.membership.invitedBy ?? (session ? toSessionProfileIdentity(session.user) : null))
					: row.invite.sender
			return invitedBy ? <UserProfileLink user={invitedBy} /> : <Text className="text-sm">—</Text>
		},
		renderMembers: (row) => renderCount(row, "members"),
		renderTopics: (row) => renderCount(row, "topics"),
		renderActive: (row) => (
			<PreferenceSwitch
				label={
					"membership" in row
						? row.membership.isOnlyLeader
							? "Assign a new leader to leave"
							: `Leave ${row.membership.name}`
						: `Join ${row.invite.name}`
				}
				isChecked={"membership" in row}
				isDisabled={mutation.isPending}
				onChange={() =>
					"membership" in row ? handleLeave(row.membership) : void mutation.run(() => handleAccept(row.invite.inviteId))
				}
			/>
		),
		renderRemove: (row) =>
			("invite" in row || isLeaderRole(row.membership.role)) && (
				<Button
					variant="ghost"
					size="icon-sm"
					accessibilityLabel={`Delete ${"invite" in row ? "invitation to " : ""}${toTeamRowFields(row).name}`}
					disabled={mutation.isPending}
					onPress={() =>
						"membership" in row
							? handleDelete(row.membership)
							: void mutation.run(() => sendDeclineInvite(row.invite.inviteId))
					}
				>
					<Icon as={X} className="size-4" />
				</Button>
			),
	})
	return (
		<View className="gap-2">
			<DataTable
				rows={rows}
				columns={columns}
				valueByKey={teamSortValues}
				initialSort={{ key: "team" }}
				getRowId={(row) => ("membership" in row ? row.membership.teamId : row.invite.inviteId)}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			{details && (
				<TeamDetailsSheet {...details} isReadOnly={isReadOnly} onChanged={onChanged} onClose={() => setDetails(null)} />
			)}
		</View>
	)
}

// nested tables use a sheet so each horizontal scroll remains independently reachable
function TeamDetailsSheet({
	teamId,
	kind,
	isReadOnly,
	onChanged,
	onClose,
}: {
	teamId: string
	kind: "members" | "topics"
	isReadOnly: boolean
	onChanged: () => void
	onClose: () => void
}) {
	// scope private team data to the signed-in account
	const { data: session } = authClient().useSession()
	const query = useQuery({ queryKey: ["team", session?.user.id, teamId], queryFn: () => fetchTeamPage(teamId) })
	const team = query.data?.status === "visible" ? query.data.team : null
	const handleChanged = (): void => {
		void query.refetch()
		onChanged()
	}
	return (
		<Sheet title={kind === "members" ? "Team members" : "Team topics"} onClose={onClose}>
			{team ? (
				kind === "members" ? (
					<TeamMembersTable
						teamId={teamId}
						members={team.members}
						hiddenMemberCount={team.hiddenMemberCount}
						isTeamLeader={isLeaderRole(team.role)}
						isReadOnly={isReadOnly}
						onChanged={handleChanged}
					/>
				) : (
					<TopicsTable topics={team.topics} includesNonPublicTopics={Boolean(team.role)} />
				)
			) : query.isPending ? (
				<CoffeeLoading />
			) : (
				<Text>This team is invite-only or unavailable.</Text>
			)}
		</Sheet>
	)
}
