import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchTeamPage, sendDeleteTeam, sendRemoveTeamMember } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamSummary, TeamsPageResponse } from "@carlnotes/contracts/teams"
import {
	TeamsMembershipTable as SharedTeamsMembershipTable,
	type TeamsMembershipDetail,
	type TeamsMembershipTableElements,
} from "@carlnotes/core/components/TeamsMembershipTable"
import { toDeleteReceivedInviteConfirmation, toLeaveTeamConfirmation } from "@carlnotes/core/lib/confirmationCopy"
import { teamSortValues, toTeamRowFields, toTeamsPageRowId } from "@carlnotes/core/lib/teamsMembershipTableColumns"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, X } from "lucide-react-native"
import { Fragment } from "react"
import { Alert, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { showConfirmAlert } from "@/components/common/ConfirmDialog"
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
 * Renders the shared teams table with native confirmations and each team's detail in a sheet.
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
	// every membership change runs one at a time and reloads the page
	const { data: session } = authClient().useSession()
	const mutation = usePageMutation(onChanged)

	// leaving confirms first
	function handleLeave(team: TeamSummary): void {
		showConfirmAlert({
			...toLeaveTeamConfirmation(team.name),
			onConfirm: () =>
				void mutation.run(async () => {
					if (session) {
						await sendRemoveTeamMember(team.teamId, session.user.id)
					}
				}),
		})
	}

	// deleting the team confirms first, and says who leads it if the team passed to another leader
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

	// accepting joins the team or requests to, and declining confirms first
	async function handleAccept(inviteId: string): Promise<void> {
		const acceptedInvite = await sendAcceptInvite(inviteId)
		if (acceptedInvite.status !== "joinedTeam" && acceptedInvite.status !== "requestedTeam") {
			throw new Error("That invite couldn't be accepted. The team may be full or the invite expired.")
		}
	}
	return (
		<View className="gap-2">
			<SharedTeamsMembershipTable
				teams={teams}
				receivedInvites={receivedInvites}
				isReadOnly={isReadOnly}
				isPending={mutation.isPending}
				onLeave={handleLeave}
				onDelete={handleDelete}
				onAccept={(invite) => void mutation.run(() => handleAccept(invite.inviteId))}
				onDecline={(invite) =>
					showConfirmAlert({
						...toDeleteReceivedInviteConfirmation(invite.name),
						onConfirm: () => void mutation.run(() => sendDeclineInvite(invite.inviteId)),
					})
				}
				onChanged={onChanged}
				elements={TEAMS_MEMBERSHIP_TABLE_ELEMENTS}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the native cells: the team link, muted text, the native switch, and the count buttons that open a sheet
const TEAMS_MEMBERSHIP_TABLE_ELEMENTS: TeamsMembershipTableElements = {
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	TeamLink: ({ row }) => <TeamLink team={toTeamRowFields(row)} />,
	Description: ({ description }) => <Text className="text-sm text-muted-foreground">{description || "None"}</Text>,
	InvitedBy: ({ invitedBy }) => (invitedBy ? <UserProfileLink user={invitedBy} /> : <Text className="text-sm">—</Text>),
	DetailToggle: ({ count, label, onToggle }) => (
		<Button variant="link" className="px-0" accessibilityLabel={label} onPress={onToggle}>
			<Text>{count}</Text>
			<Icon as={ChevronDown} className="size-4 text-link" />
		</Button>
	),
	ActiveSwitch: ({ action, teamName, isDisabled, isChecked, isFaded, onChange }) => (
		<View className={isFaded ? "opacity-50" : undefined}>
			<PreferenceSwitch
				label={teamName ? `${action} ${teamName}` : action}
				isChecked={isChecked}
				isDisabled={isDisabled}
				onChange={onChange}
			/>
		</View>
	),
	RemoveButton: ({ action, teamName, isDisabled, onPress }) => (
		<Button
			variant="ghost"
			size="icon-sm"
			accessibilityLabel={`${action} ${teamName}`}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={X} className="size-4" />
		</Button>
	),
	Detail: ({ row, detail, isReadOnly, onChanged, onClose }) => (
		<TeamDetailsSheet
			teamId={toTeamRowFields(row).teamId}
			kind={detail}
			isReadOnly={isReadOnly}
			onChanged={onChanged}
			onClose={onClose}
		/>
	),
	// the native table, then each row's open detail sheet
	Table: ({ rows, columns, renderDetail }) => (
		<>
			<DataTable
				rows={rows}
				columns={columns}
				valueByKey={teamSortValues}
				initialSort={{ key: "team" }}
				getRowId={toTeamsPageRowId}
			/>
			{rows.map((row) => (
				<Fragment key={toTeamsPageRowId(row)}>{renderDetail(row)}</Fragment>
			))}
		</>
	),
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
	kind: TeamsMembershipDetail
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
