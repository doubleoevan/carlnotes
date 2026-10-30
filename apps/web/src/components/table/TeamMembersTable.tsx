import { authClient } from "@carlnotes/client/authClient"
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamMember } from "@carlnotes/contracts/teams"
import { DataTable, type DataTableElements } from "@carlnotes/core/components/DataTable"
import { memberSortValues, toTeamMembersTableColumns } from "@carlnotes/core/lib/teamMembersTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { UserNameLink } from "./UserLinks"

// keep the existing member-table width while using the shared semantic table elements
const TEAM_MEMBERS_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={cn(TABLE_CLASS, "min-w-2xl")}>{children}</table>
		</div>
	),
}

// MemberRow owns the interactive DOM cells; these slots leave the shared headings and totals unchanged
const MEMBER_ROW_RENDERERS = {
	renderMember: () => null,
	renderRole: () => null,
	renderVisibility: () => null,
	renderActive: () => null,
	renderRemove: () => null,
}

/**
 * A Team's members: who belongs, the role a leader may change, each member's own member visibility, and the remove button.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isTeamLeader,
	isReadOnly = false,
	onChanged,
}: {
	teamId: string
	members: TeamMember[]
	// how many opted out of the public members list, so the totals never read smaller than the team is
	hiddenMemberCount: number
	isTeamLeader: boolean
	// a page that only reads the team, like the admin console, where no row acts as the user's own
	isReadOnly?: boolean
	onChanged: () => void
}) {
	const { data: session } = authClient().useSession()
	const currentUserId = isReadOnly ? null : (session?.user.id ?? null)

	// the removal columns show for a leader, and for the user's own row
	const hasRemovalColumns = isTeamLeader || members.some((member) => member.userId === currentUserId)

	// sort feeds pagination, so a sorted column reorders across every page. the page's rows and the first
	// NO_SCRIPT_ROW_LIMIT rows render for a reader without JavaScript
	const { renderedRows, sort, pagination } = usePaginatedRowSort({
		rows: members,
		valueByKey: memberSortValues,
		initialSort: { key: "member" },
	})
	// the shared definition owns every heading, sort key, visibility condition, and total
	const columns = toTeamMembersTableColumns({
		members,
		hiddenMemberCount,
		hasRemovalColumns,
		renderText: (text) => text,
		...MEMBER_ROW_RENDERERS,
	})
	return (
		<div>
			<DataTable
				columns={columns}
				renderedRows={renderedRows}
				getRowId={(member) => member.userId}
				sort={sort}
				elements={TEAM_MEMBERS_TABLE_ELEMENTS}
				renderRow={(member, className) => (
					<MemberRow
						member={member}
						teamId={teamId}
						isTeamLeader={isTeamLeader}
						hasRemovalColumns={hasRemovalColumns}
						currentUserId={currentUserId}
						onChanged={onChanged}
						className={className}
					/>
				)}
			/>
			<TablePagination {...pagination} />
		</div>
	)
}

function MemberRow({
	member,
	teamId,
	isTeamLeader,
	hasRemovalColumns,
	currentUserId,
	onChanged,
	className,
}: {
	member: TeamMember
	teamId: string
	isTeamLeader: boolean
	// whether the table renders the Active and delete columns at all, so every row stays aligned
	hasRemovalColumns: boolean
	currentUserId: string | null
	onChanged: () => void
	className?: string
}) {
	// the last-leader rejection toast shows what to do first
	const handleRoleChange = async (nextRole: string): Promise<void> => {
		if (!(await sendTeamMemberRole(teamId, member.userId, isLeaderRole(nextRole) ? "leader" : "member"))) {
			toast.error("Promote another leader first. A team can't lose its last one.")
		}
		onChanged()
	}
	const handleRemove = async (): Promise<void> => {
		if (await sendRemoveTeamMember(teamId, member.userId)) {
			toast(member.userId === currentUserId ? "You left the team." : `Removed ${member.username} from the team.`)
		} else {
			toast.error("Promote another leader first. A team can't lose its last one.")
		}
		onChanged()
	}

	// flipping a waiting request on admits them. A full team shows an error instead
	const handleApprove = async (): Promise<void> => {
		const outcome = await sendApproveJoinRequest(teamId, member.userId)
		if (outcome === "limited") {
			toast.error("The team is full. A paying leader lifts the limit.")
		} else if (outcome === "joined") {
			toast(`Added ${member.username} to the team.`)
		} else {
			toast.error(`${member.username} didn't join. Their request may have been withdrawn.`)
		}
		onChanged()
	}

	// the member-visibility opt-out only changes the user's own row
	const handleMemberVisibilityChange = async (isMemberVisible: boolean): Promise<void> => {
		try {
			await setTeamMemberVisibility(teamId, member.userId, isMemberVisible)
			onChanged()
		} catch {
			toast.error("Your visibility didn't save. Try again.")
		}
	}

	return (
		<tr className={cn("border-b last:border-b-0", className)}>
			<td className="py-2 pr-4">
				{/* the avatar and name link to the profile */}
				<UserNameLink user={member} />
			</td>
			<td className="py-2 pr-4">
				{/* a leader selects the role. everyone else reads it */}
				{isTeamLeader ? (
					<select
						value={member.role}
						onChange={(event) => void handleRoleChange(event.target.value)}
						aria-label={`${member.username} role`}
						className="rounded-md border px-1 py-0.5"
					>
						<option value="member">member</option>
						<option value="leader">leader</option>
					</select>
				) : (
					<span className="text-muted-foreground">{member.role}</span>
				)}
			</td>
			<td className="py-2 pr-4">
				{/* the opt-out is the member's own to set, so everyone else's row only reads it */}
				{member.userId === currentUserId ? (
					<select
						value={member.isMemberVisible ? "shown" : "hidden"}
						onChange={(event) => void handleMemberVisibilityChange(event.target.value === "shown")}
						aria-label="Your visibility on the public page"
						className="rounded-md border px-1 py-0.5"
					>
						<option value="shown">shown</option>
						<option value="hidden">hidden</option>
					</select>
				) : (
					<span className="text-muted-foreground">{member.isMemberVisible ? "shown" : "hidden"}</span>
				)}
			</td>
			{/* the removal controls are a leader's for anyone, plus each member's own row. removing the
			    last leader is rejected by the server, so the toast above shows that answer */}
			{hasRemovalColumns && (
				<td className="py-2 pr-4">
					{/* off is a request to join. a leader switches it on to admit them. switching a member
					    off removes them, the same thing the X does */}
					{(isTeamLeader || member.userId === currentUserId) && (
						<Tooltip>
							{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<Switch
										checked={member.isActive}
										disabled={!member.isActive && !isTeamLeader}
										onCheckedChange={() => void (member.isActive ? handleRemove() : handleApprove())}
										aria-label={member.isActive ? `Deactivate ${member.username}` : `Activate ${member.username}`}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{member.isActive ? "Deactivate " : "Activate "}
								<span className="font-semibold">{member.username}</span>
							</TooltipContent>
						</Tooltip>
					)}
				</td>
			)}
			{hasRemovalColumns && (
				<td className="py-2 text-right">
					{(isTeamLeader || member.userId === currentUserId) && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon-sm"
									variant="ghost"
									onClick={() => void handleRemove()}
									aria-label={`Remove ${member.username} from the team`}
								>
									<X className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								Remove <span className="font-semibold">{member.username}</span> from the team
							</TooltipContent>
						</Tooltip>
					)}
				</td>
			)}
		</tr>
	)
}
