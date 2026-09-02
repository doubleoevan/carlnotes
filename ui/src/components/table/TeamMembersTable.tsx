import type { TeamPageResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@/clients/teamClient"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { toCountLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// one team member as the team page payload sends them
type TeamMember = TeamPageResponse["members"][number]

// the sort accessors for the team members' columns
const memberSortValues = {
	member: (member: TeamMember) => member.username,
	role: (member: TeamMember) => member.role,
	visibility: (member: TeamMember) => String(member.isMemberVisible),
	active: (member: TeamMember) => String(member.isActive),
}

/**
 * A Team's members: who belongs, the role a leader may change, each member's own member visibility, and the remove button.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isLeader,
	isReadOnly = false,
	onChanged,
}: {
	teamId: string
	members: TeamMember[]
	// how many opted out of the public members list, so the totals never read smaller than the team is
	hiddenMemberCount: number
	isLeader: boolean
	// a page that only reads the team, like the admin console, where no row acts as the viewer's own
	isReadOnly?: boolean
	onChanged: () => void
}) {
	const { data: session } = authClient.useSession()
	const currentUserId = isReadOnly ? null : (session?.user.id ?? null)

	// the removal columns show for a leader, and for the user's own row
	const hasRemovalColumns = isLeader || members.some((member) => member.userId === currentUserId)

	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(members, memberSortValues, { key: "member" })
	// the totals read activated members alone, so a waiting request never inflates them
	const activeMembers = members.filter((member) => member.isActive)
	return (
		<div>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-2xl")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="member" label="Member" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="role" label="Role" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="visibility" label="Visibility" className="py-2 pr-4" />
							{hasRemovalColumns && (
								<SortableHeader
									sort={sort}
									sortKey="active"
									label="Active"
									tooltip="Active team members"
									className="py-2 pr-4"
								/>
							)}
							{hasRemovalColumns && <th className="py-2" />}
						</tr>
					</thead>
					<tbody>
						{pageRows.map((member) => (
							<MemberRow
								key={member.userId}
								member={member}
								teamId={teamId}
								isLeader={isLeader}
								hasRemovalColumns={hasRemovalColumns}
								currentUserId={currentUserId}
								onChanged={onChanged}
							/>
						))}
					</tbody>
					{/* the totals include the hidden members the public page omits */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">
								{hasRemovalColumns
									? "Total"
									: `Total ${toCountLabel(activeMembers.length + hiddenMemberCount, "member")}`}
							</td>
							<td className="py-2 pr-4">
								{toCountLabel(activeMembers.filter((member) => member.role === "leader").length, "leader")}
							</td>
							<td className="py-2 pr-4">
								{`${activeMembers.filter((member) => member.isMemberVisible).length}/${activeMembers.length} shown`}
							</td>
							{hasRemovalColumns && (
								<td className="py-2 pr-4" colSpan={2}>
									{toCountLabel(activeMembers.length + hiddenMemberCount, "member")}
								</td>
							)}
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</div>
	)
}

function MemberRow({
	member,
	teamId,
	isLeader,
	hasRemovalColumns,
	currentUserId,
	onChanged,
}: {
	member: TeamMember
	teamId: string
	isLeader: boolean
	// whether the table renders the Active and delete columns at all, so every row stays aligned
	hasRemovalColumns: boolean
	currentUserId: string | null
	onChanged: () => void
}) {
	// the last-leader rejection toast shows what to do first
	const handleRoleChange = async (nextRole: string): Promise<void> => {
		if (!(await sendTeamMemberRole(teamId, member.userId, nextRole === "leader" ? "leader" : "member"))) {
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
		await setTeamMemberVisibility(teamId, member.userId, isMemberVisible)
		onChanged()
	}

	return (
		<tr className="border-b last:border-b-0">
			<td className="py-2 pr-4">
				{/* the avatar and name link to the profile */}
				<span className="flex items-center gap-2">
					<UserAvatar
						userId={member.userId}
						username={member.username}
						avatarSource={member.avatarSource}
						className="size-6"
					/>
					<AnchorLink href={`/profiles/${member.userId}`} className="text-link hover:underline">
						{member.username}
					</AnchorLink>
				</span>
			</td>
			<td className="py-2 pr-4">
				{/* a leader selects the role. everyone else reads it */}
				{isLeader ? (
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
					{(isLeader || member.userId === currentUserId) && (
						<Tooltip>
							{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<Switch
										checked={member.isActive}
										disabled={!member.isActive && !isLeader}
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
					{(isLeader || member.userId === currentUserId) && (
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
