import type { AdminUserRow, OwnerTopic, TeamSummary } from "@shared/contracts"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	fetchAdminUserTeams,
	fetchAdminUserTopics,
	sendDeleteUser,
	sendUserBudgetOverride,
	sendUserRole,
} from "@/clients/billingClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicsSubtableRow } from "@/components/table/OwnerTopicsTable"
import { SortableHeader } from "@/components/table/SortableHeader"
import { SubtableCountButton } from "@/components/table/SubtableCountButton"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { toBytesLabel, toCentsLabel, toCountLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the sort accessors for the users table columns
const userSortValues = {
	user: (user: AdminUserRow) => user.username,
	email: (user: AdminUserRow) => user.email,
	role: (user: AdminUserRow) => user.role,
	plan: (user: AdminUserRow) => user.plan,
	signup: (user: AdminUserRow) => user.createdAt,
	topics: (user: AdminUserRow) => user.topicCount,
	teams: (user: AdminUserRow) => user.teamCount,
	storage: (user: AdminUserRow) => user.attributedBytes,
	scans: (user: AdminUserRow) => user.scanSpendCents,
	chat: (user: AdminUserRow) => user.chatSpendCents,
	cost: (user: AdminUserRow) => user.monthVariableCostCents,
	override: (user: AdminUserRow) => user.budgetOverrideCents,
}

/**
 * The admin console's users table, sortable and scrollable on narrow screens,
 * with inline role and budget-override edits and a topics subtable under each row.
 */
export function AdminUsersTable({
	users,
	signedInUserId,
	onReload,
}: {
	users: AdminUserRow[]
	signedInUserId: string
	onReload: () => void
}) {
	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(users, userSortValues)

	return (
		<TableCard>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-3xl [&_tbody_tr:last-child>*]:border-b-0")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="user" label="User" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="email" label="Email" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="role" label="Role" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="plan" label="Plan" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="signup" label="Signup" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="topics" label="Topics" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="teams" label="Teams" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="storage" label="Storage" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="scans"
								label="Scans"
								tooltip="Month-to-date scan spend"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="chat"
								label="Chat"
								tooltip="Month-to-date chat spend"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="cost"
								label="Cost / budget"
								tooltip="Cost against the monthly budget"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="override"
								label="Override"
								tooltip="Budget override"
								className="py-2 pr-4"
							/>
							<th className="py-2" />
						</tr>
					</thead>
					<tbody>
						{pageRows.map((user) => (
							<UserRow key={user.id} user={user} signedInUserId={signedInUserId} onReloadPage={onReload} />
						))}
					</tbody>
					{/* the totals span every user, not just the visible page. team memberships sum per membership,
				    so one person on two teams counts twice */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">{`Total ${toCountLabel(users.length, "user")}`}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">
								{toCountLabel(users.filter((user) => user.role === "admin").length, "admin")}
							</td>
							<td className="py-2 pr-4">{`${users.filter((user) => user.plan !== "free").length} paid`}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">{users.reduce((sum, user) => sum + user.topicCount, 0)}</td>
							<td className="py-2 pr-4">{users.reduce((sum, user) => sum + user.teamCount, 0)}</td>
							<td className="py-2 pr-4">{toBytesLabel(users.reduce((sum, user) => sum + user.attributedBytes, 0))}</td>
							<td className="py-2 pr-4">{toCentsLabel(users.reduce((sum, user) => sum + user.scanSpendCents, 0))}</td>
							<td className="py-2 pr-4">{toCentsLabel(users.reduce((sum, user) => sum + user.chatSpendCents, 0))}</td>
							<td className="py-2 pr-4">
								{toCentsLabel(users.reduce((sum, user) => sum + (user.monthVariableCostCents ?? 0), 0))} /{" "}
								{toCentsLabel(users.reduce((sum, user) => sum + user.effectiveBudgetCents, 0))}
							</td>
							<td className="py-2 pr-4">{`${users.filter((user) => user.budgetOverrideCents !== null).length} set`}</td>
							<td className="py-2" />
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// a user row with topics and teams subtables, an inline role select, and budget-override input
function UserRow({
	user,
	signedInUserId,
	onReloadPage,
}: {
	user: AdminUserRow
	signedInUserId: string
	onReloadPage: () => void
}) {
	// which of the row's subtables is open, and the rows each loads the first time it opens
	const [openSubtable, setOpenSubtable] = useState<"topics" | "teams" | null>(null)
	const [userTopics, setUserTopics] = useState<OwnerTopic[] | null>(null)
	const [userTeams, setUserTeams] = useState<TeamSummary[] | null>(null)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

	// open or close this row's teams subtable, loading the rows on the first open
	async function handleUserTeamsClick(): Promise<void> {
		const isOpening = openSubtable !== "teams"
		setOpenSubtable(isOpening ? "teams" : null)
		if (!isOpening || userTeams !== null || user.teamCount === 0) {
			return
		}
		try {
			setUserTeams(await fetchAdminUserTeams(user.id))
		} catch (error) {
			console.error("admin user teams failed", error)
			toast.error("Couldn't load that user's teams.")
			setOpenSubtable(null)
		}
	}

	// close the account, then reload the admin console
	async function handleDeleteAccount(): Promise<void> {
		setIsConfirmingDelete(false)
		try {
			await sendDeleteUser(user.id)
			onReloadPage()
		} catch (error) {
			console.error("user delete failed", error)
			toast.error("Closing that account failed.")
		}
	}

	// set the user's role on the server, then reload the console
	async function handleRoleChange(selectedRole: string): Promise<void> {
		const role = selectedRole === "admin" ? "admin" : "user"
		const isRoleSet = await sendUserRole(user.id, role)
		if (!isRoleSet) {
			toast.error("Role change failed.")
		}
		onReloadPage()
	}

	// set or clear the user's budget override, then reload the console
	async function handleBudgetChange(dollarsText: string): Promise<void> {
		// an empty input clears the override, so the plan's own budget applies again. a non-number changes nothing
		const dollars = dollarsText.trim()
		if (dollars !== "" && Number.isNaN(Number(dollars))) {
			return
		}
		const budgetOverrideCents = dollars === "" ? null : Math.round(Number(dollars) * 100)
		try {
			// save the budget on its own, and resize the proxy key to match it separately
			const { isKeyResized } = await sendUserBudgetOverride(user.id, budgetOverrideCents)
			if (!isKeyResized) {
				toast.error(
					`${user.username}'s budget saved, but their key still enforces the old one, so model calls may still fail.`,
				)
			}
		} catch (error) {
			console.error("budget override failed", error)
			toast.error(`${user.username}'s budget didn't save.`)
			return
		}
		onReloadPage()
	}

	// this user's topics, loaded the first time the subtable is opened and kept for the rest of the session
	async function handleUserTopicsClick(): Promise<void> {
		const isOpening = openSubtable !== "topics"
		setOpenSubtable(isOpening ? "topics" : null)
		if (!isOpening || userTopics !== null || user.topicCount === 0) {
			return
		}
		try {
			setUserTopics(await fetchAdminUserTopics(user.id))
		} catch (error) {
			console.error("admin user topics failed", error)
			toast.error("Couldn't load that user's topics.")
			setOpenSubtable(null)
		}
	}

	// the cost is shown against the effective budget. highlight the figure if the user is over their budget
	const isOverBudget = user.monthVariableCostCents !== null && user.monthVariableCostCents > user.effectiveBudgetCents
	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{/* the avatar and username link to the user's profile */}
					<Tooltip>
						<TooltipTrigger asChild>
							<AnchorLink href={`/profiles/${user.id}`} className="text-link flex items-center gap-2 hover:underline">
								<UserAvatar
									userId={user.id}
									username={user.username}
									avatarSource={user.avatarSource}
									className="size-6"
								/>
								{user.username}
							</AnchorLink>
						</TooltipTrigger>
						<TooltipContent>{`${user.username}'s profile`}</TooltipContent>
					</Tooltip>
				</td>
				{/* the email links to the user's activity page, where their spend and topics are */}
				<td className="py-2 pr-4">
					<Tooltip>
						<TooltipTrigger asChild>
							<AnchorLink
								href={`/activity?userId=${user.id}`}
								className="text-link block max-w-52 truncate text-left hover:underline"
							>
								{user.email}
							</AnchorLink>
						</TooltipTrigger>
						<TooltipContent>{`${user.username}'s activity`}</TooltipContent>
					</Tooltip>
				</td>
				<td className="py-2 pr-4">
					{/* an admin cannot change their own role, so the platform always keeps at least one admin */}
					<select
						value={user.role}
						disabled={user.id === signedInUserId}
						onChange={(event) => void handleRoleChange(event.target.value)}
						aria-label={`${user.username}'s role`}
						className="rounded-md border px-1 py-0.5 disabled:opacity-50"
					>
						<option value="user">user</option>
						<option value="admin">admin</option>
					</select>
				</td>
				<td className="py-2 pr-4">
					{/* the plan links to the user's account page */}
					<Tooltip>
						<TooltipTrigger asChild>
							<AnchorLink href={`/account?userId=${user.id}`} className="text-link capitalize hover:underline">
								{user.plan}
							</AnchorLink>
						</TooltipTrigger>
						<TooltipContent>{`${user.username}'s account`}</TooltipContent>
					</Tooltip>
				</td>
				<td className="py-2 pr-4">{new Date(user.createdAt).toLocaleDateString()}</td>
				<td className="py-2 pr-4">
					{/* the topic count opens this user's topics subtable under the row. a user with no topics has nothing to open */}
					<SubtableCountButton
						count={user.topicCount}
						isOpen={openSubtable === "topics"}
						ariaLabel={`Show ${user.username}'s topics`}
						onClick={() => void handleUserTopicsClick()}
					/>
				</td>
				<td className="py-2 pr-4">
					{/* the team count opens this user's teams subtable, closing the row's topics one */}
					<SubtableCountButton
						count={user.teamCount}
						isOpen={openSubtable === "teams"}
						ariaLabel={`Show ${user.username}'s teams`}
						onClick={() => void handleUserTeamsClick()}
					/>
				</td>
				<td className="py-2 pr-4">{toBytesLabel(user.attributedBytes)}</td>
				<td className="py-2 pr-4">{toCentsLabel(user.scanSpendCents)}</td>
				<td className="py-2 pr-4">{toCentsLabel(user.chatSpendCents)}</td>
				<td className={`py-2 pr-4 ${isOverBudget ? "text-destructive font-semibold" : ""}`}>
					{toCentsLabel(user.monthVariableCostCents)} / {toCentsLabel(user.effectiveBudgetCents)}
				</td>
				<td className="py-2 pr-4">
					{/* four digits wide, for a small whole-dollar figure */}
					<input
						type="number"
						min={0}
						defaultValue={user.budgetOverrideCents !== null ? user.budgetOverrideCents / 100 : ""}
						onBlur={(event) => void handleBudgetChange(event.target.value)}
						aria-label={`${user.username}'s budget override in dollars`}
						placeholder="$0"
						className="w-16 rounded-md border px-1 py-0.5"
					/>
				</td>
				<td className="py-2">
					{/* an admin can close their own account from their account page, so their own row skips the delete icon */}
					{user.id !== signedInUserId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setIsConfirmingDelete(true)}
									aria-label={`Close ${user.username}'s account`}
									className="text-muted-foreground hover:text-destructive rounded-md p-2"
								>
									<Trash2 className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								{"Close "}
								<span className="font-semibold">{user.username}</span>
								{"'s account"}
							</TooltipContent>
						</Tooltip>
					)}
				</td>
			</tr>
			{isConfirmingDelete && (
				<ConfirmDialog
					title={`Close ${user.username}'s account?`}
					confirmLabel="Close account"
					cancelLabel="Keep it"
					onConfirm={handleDeleteAccount}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{`Their ${user.topicCount} ${user.topicCount === 1 ? "topic" : "topics"}, findings, subscriptions, and chats go with it. Any paid plan is canceled. This cannot be undone.`}
				</ConfirmDialog>
			)}
			{/* this user's teams subtable, read-only rows in the teams index shape */}
			{openSubtable === "teams" && (
				<tr className="border-b">
					<td colSpan={13} className="py-2">
						{userTeams ? (
							<UserTeamsSubtable teams={userTeams} />
						) : (
							<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
						)}
					</td>
				</tr>
			)}
			{/* this user's topics subtable */}
			{openSubtable === "topics" && <TopicsSubtableRow topics={userTopics} colSpan={13} onReloadPage={onReloadPage} />}
		</>
	)
}

// the teams one user belongs to, read-only under their row: the team link, their role, and the team's numbers
function UserTeamsSubtable({ teams }: { teams: TeamSummary[] }) {
	return (
		<TableCard className="bg-sunken mb-0 shadow-none">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<th className="py-2 pr-4 font-normal">Team</th>
							<th className="py-2 pr-4 font-normal">Role</th>
							<th className="py-2 pr-4 font-normal">Visibility</th>
							<th className="py-2 pr-4 font-normal">Members</th>
							<th className="py-2 pr-4 font-normal">Topics</th>
							<th className="py-2 pr-4 font-normal">Scans</th>
							<th className="py-2 font-normal">Chat</th>
						</tr>
					</thead>
					<tbody>
						{teams.map((team) => (
							<tr key={team.teamId} className="border-b last:border-b-0">
								<td className="py-2 pr-4">
									<AnchorLink
										href={`/teams/${team.teamId}`}
										className="text-link flex items-center gap-2 hover:underline"
									>
										<TeamAvatar team={team} className="size-6" />
										{team.name}
									</AnchorLink>
								</td>
								<td className="py-2 pr-4">{team.role}</td>
								<td className="py-2 pr-4">{team.isPublic ? "public" : "private"}</td>
								<td className="py-2 pr-4">{team.memberCount}</td>
								<td className="py-2 pr-4">{team.topicCount}</td>
								<td className="py-2 pr-4">{toCentsLabel(team.scanSpendCents)}</td>
								<td className="py-2">{toCentsLabel(team.chatSpendCents)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</TableCard>
	)
}
