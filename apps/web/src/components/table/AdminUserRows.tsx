// the admin users table's row, with its topics and teams subtables and its inline role and budget edits

import {
	fetchAdminUserTeams,
	fetchAdminUserTopics,
	sendDeleteUser,
	sendUserBudgetOverride,
	sendUserRole,
} from "@carlnotes/client/billingClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { AdminUserRow } from "@carlnotes/contracts/admin"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { toCentsFromDollars } from "@carlnotes/contracts/plans"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import { toBytesLabel, toCentsLabel, toDateLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	STANDALONE_LINK_CLASS,
	SUBTABLE_CARD_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
} from "@/lib/styleClasses"
import { TopicsSubtableRow } from "./OwnerTopicsTable"
import { SubtableCountButton } from "./SubtableCountButton"
import { TableCard } from "./TableCard"
import { UserEmailLink, UserNameLink, UserPlanLink } from "./UserLinks"

// how many columns the users table has, which a subtable row spans to sit under all of them
const ADMIN_TABLE_COLUMN_COUNT = 14

/**
 * An admin users table row with topics and teams subtables, an inline role select, and a budget-override input.
 */
export function UserRow({
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
		const role = isAdminRole(selectedRole) ? "admin" : "user"
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
		const budgetOverrideCents = dollars === "" ? null : toCentsFromDollars(Number(dollars))
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

	// the cost is shown against the budget. highlight the figure if the user is over their budget
	const isOverBudget = user.monthVariableCostCents !== null && user.monthVariableCostCents > user.budgetCents
	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{/* the avatar and username link to the user's profile */}
					<UserNameLink user={{ userId: user.id, username: user.username, avatarVersion: user.avatarVersion }} />
				</td>
				{/* the email links to the user's activity page, where their spend and topics are */}
				<td className="py-2 pr-4">
					<UserEmailLink user={{ userId: user.id, username: user.username, email: user.email }} />
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
					<UserPlanLink user={{ userId: user.id, username: user.username, plan: user.plan }} />
				</td>
				<td className="py-2 pr-4">{toDateLabel(user.createdAt)}</td>
				{/* a user who has not signed in since the column was added has no date to show */}
				<td className="py-2 pr-4">{toDateLabel(user.lastLoginAt)}</td>
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
					{toCentsLabel(user.monthVariableCostCents)} / {toCentsLabel(user.budgetCents)}
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
					{`Their ${user.topicCount} ${user.topicCount === 1 ? "topic" : "topics"}, findings, and chats go with it, and they stop following every topic. Any paid plan is canceled. This cannot be undone.`}
				</ConfirmDialog>
			)}
			{/* this user's teams subtable, read-only rows in the teams index shape */}
			{openSubtable === "teams" && (
				<tr className="border-b">
					<td colSpan={ADMIN_TABLE_COLUMN_COUNT} className="py-2">
						{userTeams ? (
							<UserTeamsSubtable teams={userTeams} />
						) : (
							<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
						)}
					</td>
				</tr>
			)}
			{/* this user's topics subtable */}
			{openSubtable === "topics" && (
				<TopicsSubtableRow topics={userTopics} colSpan={ADMIN_TABLE_COLUMN_COUNT} onReloadPage={onReloadPage} />
			)}
		</>
	)
}

// the teams one user belongs to, read-only under their row: the team link, their role, and the team's numbers
function UserTeamsSubtable({ teams }: { teams: TeamSummary[] }) {
	return (
		<TableCard className={SUBTABLE_CARD_CLASS}>
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
										className={cn(STANDALONE_LINK_CLASS, "flex items-center gap-2")}
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
