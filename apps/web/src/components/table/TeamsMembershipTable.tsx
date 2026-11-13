import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { toTeamPath } from "@carlnotes/contracts/seo"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import type { DataTableElements } from "@carlnotes/core/components/DataTable"
import {
	TeamsMembershipTable as SharedTeamsMembershipTable,
	type TeamsMembershipTableElements,
} from "@carlnotes/core/components/TeamsMembershipTable"
import { toDeleteReceivedInviteConfirmation } from "@carlnotes/core/lib/confirmationCopy"
import {
	type ReceivedInvite,
	teamSortValues,
	toTeamRowFields,
	toTeamsPageRowId,
} from "@carlnotes/core/lib/teamsMembershipTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { useQuery } from "@tanstack/react-query"
import { type ComponentProps, useEffect } from "react"
import { toast } from "sonner"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { DATA_TABLE_ELEMENTS, DataTable } from "./DataTable"
import { SubtableCountButton } from "./SubtableCountButton"
import { loadTeamSubtablesPage, TeamSubtables } from "./TeamSubtables"
import { TooltipRemoveButton } from "./TooltipRemoveButton"
import { TooltipSwitch } from "./TooltipSwitch"

/**
 * Renders the shared teams table with the web's invite answers and each team's subtables under its row.
 */
export function TeamsMembershipTable({
	teams,
	receivedInvites,
	onLeave,
	onDelete,
	onAnswered,
	isReadOnly = false,
}: {
	teams: TeamSummary[]
	receivedInvites: ReceivedInvite[]
	onLeave: (team: TeamSummary) => void
	onDelete: (team: TeamSummary) => void
	// an answered invite or a change in a subtable reloads the page, where an accepted invite became a membership
	onAnswered: () => void
	// someone else's profile shows the teams alone: no Invited by, spend, or membership controls
	isReadOnly?: boolean
}) {
	// accepting joins the team right away
	async function handleAccept(invite: ReceivedInvite): Promise<void> {
		try {
			await sendAcceptInvite(invite.inviteId)
			toast(`Joined ${invite.name}.`)
			onAnswered()
		} catch (error) {
			console.error("invite accept failed", error)
			toast.error("Accepting that invite failed.")
		}
	}

	// declining deletes the invite once confirmed
	const { confirm, confirmDialog } = useConfirmDialog()
	async function handleDecline(invite: ReceivedInvite): Promise<void> {
		try {
			await sendDeclineInvite(invite.inviteId)
			toast("Invite deleted.")
			onAnswered()
		} catch (error) {
			console.error("invite decline failed", error)
			toast.error("Declining that invite failed.")
		}
	}
	return (
		<>
			<SharedTeamsMembershipTable
				teams={teams}
				receivedInvites={receivedInvites}
				isReadOnly={isReadOnly}
				onLeave={onLeave}
				onDelete={onDelete}
				onAccept={(invite) => void handleAccept(invite)}
				onDecline={(invite) => confirm(toDeleteReceivedInviteConfirmation(invite.name), () => handleDecline(invite))}
				onChanged={onAnswered}
				elements={TEAMS_MEMBERSHIP_TABLE_ELEMENTS}
			/>
			{confirmDialog}
		</>
	)
}

// the wide web table, its non-sortable Active heading's explanation, and the remove button at the row's right edge
const TEAMS_MEMBERSHIP_DATA_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={cn(TABLE_CLASS, "min-w-3xl")}>{children}</table>
		</div>
	),
	Cell: ({ children, column }) => <td className={column === "remove" ? "py-2 text-right" : "py-2 pr-4"}>{children}</td>,
	Header: ({ column, sort }) =>
		column.isSortable === false && column.tooltip ? (
			<th className="py-2 pr-4 font-normal">
				<Tooltip>
					<TooltipTrigger asChild>
						<span>{column.label}</span>
					</TooltipTrigger>
					<TooltipContent>{column.tooltip}</TooltipContent>
				</Tooltip>
			</th>
		) : (
			<DATA_TABLE_ELEMENTS.Header column={column} sort={sort} />
		),
}

// the subtable an open row shows under itself, read when it opens. it closes if the team page does not load
function TeamSubtablesDetail({
	row,
	detail,
	isReadOnly,
	onChanged,
	onClose,
}: ComponentProps<TeamsMembershipTableElements["Detail"]>) {
	// the team page fills both subtables, scoped to the signed-in account
	const teamId = toTeamRowFields(row).teamId
	const { data: session } = authClient().useSession()
	const { data: teamPage, refetch } = useQuery({
		queryKey: ["team-subtables", session?.user.id, teamId],
		queryFn: () => loadTeamSubtablesPage(teamId),
	})
	useEffect(() => {
		if (teamPage === null) {
			onClose()
		}
	}, [teamPage, onClose])

	// a change inside the subtable reloads the team page and the page above it. an invitee has no role yet
	return (
		<TeamSubtables
			teamId={teamId}
			teamRole={"membership" in row ? row.membership.role : null}
			isReadOnly={isReadOnly}
			openSubtable={detail}
			teamPage={teamPage ?? null}
			onChanged={() => {
				void refetch()
				onChanged()
			}}
		/>
	)
}

// the web cells: the team link with its mention badge, truncated descriptions, and the switch and button tooltips
export const TEAMS_MEMBERSHIP_TABLE_ELEMENTS: TeamsMembershipTableElements = {
	// an invite's role reads muted
	Text: ({ children }) => <span className={cn(children === "invited" && "text-muted-foreground")}>{children}</span>,
	TeamLink: ({ row }) => {
		// a membership links to its page, with the team chat room's mention badge at the name's top-right corner
		if ("membership" in row) {
			const team = row.membership
			return (
				<span className="flex items-center gap-2">
					<TeamAvatar team={team} className="size-6" />
					<span className="relative min-w-0">
						<AnchorLink href={toTeamPath(team.teamId)} className={STANDALONE_LINK_CLASS}>
							{team.name}
						</AnchorLink>
						<PageUpdateCountBadge topicId={null} teamId={team.teamId} href={toTeamPath(team.teamId)} />
					</span>
				</span>
			)
		}

		// an invite links only where the team's page would open for the user
		const invite = row.invite
		const teamLabel = (
			<>
				<TeamAvatar team={invite} className="size-6" />
				{invite.name}
			</>
		)
		return invite.isPublic ? (
			<AnchorLink href={toTeamPath(invite.teamId)} className={cn(STANDALONE_LINK_CLASS, "flex items-center gap-2")}>
				{teamLabel}
			</AnchorLink>
		) : (
			<span className="flex items-center gap-2">{teamLabel}</span>
		)
	},
	// the cell truncates, and the tooltip shows the description in full
	Description: ({ description }) =>
		description ? (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="text-muted-foreground block max-w-40 truncate sm:max-w-64">{description}</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-72">{description}</TooltipContent>
			</Tooltip>
		) : (
			<span className="text-muted-foreground">None</span>
		),
	// the inviter's profile, or a plain dash if their account has closed
	InvitedBy: ({ invitedBy }) =>
		invitedBy ? (
			<span className="whitespace-nowrap">
				<UserProfileLink user={invitedBy} avatarClassName="size-5" isNewTab />
			</span>
		) : (
			<span className="text-muted-foreground">—</span>
		),
	DetailToggle: ({ count, isOpen, label, onToggle }) => (
		<SubtableCountButton count={count} isOpen={isOpen} ariaLabel={label} onClick={onToggle} />
	),
	ActiveSwitch: ({ action, teamName, isDisabled, isChecked, isFaded, onChange }) => (
		<TooltipSwitch
			action={action}
			name={teamName}
			isChecked={isChecked}
			isDisabled={isDisabled}
			className={isFaded ? "opacity-50" : undefined}
			onChange={onChange}
		/>
	),
	RemoveButton: ({ action, teamName, isDisabled, onPress }) => (
		<TooltipRemoveButton action={action} name={teamName} isDisabled={isDisabled} onPress={onPress} />
	),
	Detail: TeamSubtablesDetail,
	// the card with the sorted, paged rows and each row's open subtable under it
	Table: ({ rows, columns, renderDetail }) => (
		<DataTable
			rows={rows}
			columns={columns}
			valueByKey={teamSortValues}
			initialSort={{ key: "team", isDescending: false }}
			getRowId={toTeamsPageRowId}
			className="mb-4"
			elements={TEAMS_MEMBERSHIP_DATA_TABLE_ELEMENTS}
			renderDetails={renderDetail}
		/>
	),
}
