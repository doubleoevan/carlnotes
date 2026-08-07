import type { ActivityTopic, AdminConsoleResponse, AdminTotals, AdminUserRow } from "@shared/contracts"
import { plans } from "@shared/enums"
import { ChevronDown } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TopicsTable } from "@/components/table/TopicsTable"
import { authClient } from "@/lib/authClient"
import { fetchAdminConsole, fetchAdminUserTopics, sendUserBudgetOverride, sendUserRole } from "@/lib/billingClient"
import { cn, TABLE_CARD_CLASS, toCentsLabel } from "@/lib/utils"

// human-readable bytes for the attributed-storage column
function toBytesLabel(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`
	}
	// step up through the units until the value fits under 1024
	const units = ["KB", "MB", "GB", "TB"]
	let size = bytes / 1024
	let unitIndex = 0
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex += 1
	}
	return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * The admin-only console: a totals summary and a per-user table with inline role and budget-override edits.
 */
export function AdminPage() {
	const { data: session } = authClient.useSession()
	const [adminConsole, setAdminConsole] = useState<AdminConsoleResponse | null>(null)
	const [isForbidden, setIsForbidden] = useState(false)

	// load the console payload, and again after each inline edit
	const loadConsole = useCallback(() => {
		fetchAdminConsole()
			.then(setAdminConsole)
			.catch(() => setIsForbidden(true))
	}, [])

	useEffect(() => {
		if (session) {
			loadConsole()
		}
	}, [session, loadConsole])

	if (!session) {
		return <main className="mx-auto max-w-6xl px-safe py-10">Please log in.</main>
	}
	if (isForbidden) {
		return <main className="mx-auto max-w-6xl px-safe py-10">You do not have access to this page.</main>
	}
	if (!adminConsole) {
		return (
			<main className="mx-auto max-w-6xl px-safe py-10">
				<CoffeeLoading />
			</main>
		)
	}

	return (
		<main className="mx-auto max-w-6xl px-safe py-10">
			<h1 className="font-display text-2xl">Admin</h1>
			<TotalSummaries totals={adminConsole.totals} users={adminConsole.users} />
			<UsersTable users={adminConsole.users} signedInUserId={session.user.id} onReload={loadConsole} />
		</main>
	)
}

// the platform totals: user counts per plan, attributed storage, current month-to-date cost, Stripe net revenue, and contribution
function TotalSummaries({ totals, users }: { totals: AdminTotals; users: AdminUserRow[] }) {
	return (
		<div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
			<UsersCard users={users} />
			<TotalCard label="Storage" figure={toBytesLabel(totals.attributedBytes)} />
			<TotalCard label="Cost this month" figure={toCentsLabel(totals.monthVariableCostCents)} />
			<TotalCard label="Net revenue" figure={toCentsLabel(totals.netRevenueCents)} />
			<TotalCard label="Contribution" figure={toCentsLabel(totals.contributionCents)} />
		</div>
	)
}

// the user counts per plan
function UsersCard({ users }: { users: AdminUserRow[] }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-lift">
			<div className="text-muted-foreground text-xs">Users</div>
			<div className="mt-1 space-y-0.5 text-sm">
				{plans.map((plan) => (
					<div key={plan} className="flex justify-between gap-2">
						<span className="capitalize">{plan}</span>
						<span className="font-semibold">{users.filter((user) => user.plan === plan).length}</span>
					</div>
				))}
			</div>
		</div>
	)
}

// a card with a labeled summary figure
function TotalCard({ label, figure }: { label: string; figure: string }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-lift">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 font-semibold">{figure}</div>
		</div>
	)
}

// the sort accessors for the users table columns
const userSortValues = {
	email: (user: AdminUserRow) => user.email,
	role: (user: AdminUserRow) => user.role,
	plan: (user: AdminUserRow) => user.plan,
	signup: (user: AdminUserRow) => user.createdAt,
	topics: (user: AdminUserRow) => user.topicCount,
	storage: (user: AdminUserRow) => user.attributedBytes,
	scans: (user: AdminUserRow) => user.scanSpendCents,
	chat: (user: AdminUserRow) => user.chatSpendCents,
	cost: (user: AdminUserRow) => user.monthVariableCostCents,
	override: (user: AdminUserRow) => user.budgetOverrideCents,
}

// the users table, sortable and scrollable on narrow screens
function UsersTable({
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
		<div className={`mt-8 ${TABLE_CARD_CLASS}`}>
			<table className="w-full min-w-3xl text-left text-sm [&_tbody_tr:last-child]:border-b-0">
				<thead className="text-muted-foreground border-b">
					<tr>
						<SortableHeader sort={sort} sortKey="email" label="Email" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="role" label="Role" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="plan" label="Plan" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="signup" label="Signup" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="topics" label="Topics" className="py-2 pr-4" />
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
					</tr>
				</thead>
				<tbody>
					{pageRows.map((user) => (
						<UserRow key={user.id} user={user} signedInUserId={signedInUserId} onReloadPage={onReload} />
					))}
				</tbody>
			</table>
			<TablePagination {...pagination} />
		</div>
	)
}

// a user row with topics subtable, an inline role select, and budget-override input
function UserRow({
	user,
	signedInUserId,
	onReloadPage,
}: {
	user: AdminUserRow
	signedInUserId: string
	onReloadPage: () => void
}) {
	// the user's topics subtable state
	const [isUserTopicsOpen, setIsUserTopicsOpen] = useState(false)
	const [userTopics, setUserTopics] = useState<ActivityTopic[] | null>(null)

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
		// an empty input clears the override, so that the plan's backstop will apply again
		const dollars = dollarsText.trim()
		const budgetOverrideCents = dollars === "" ? null : Math.round(Number(dollars) * 100)
		await sendUserBudgetOverride(user.id, budgetOverrideCents)
		onReloadPage()
	}

	// this user's topics, loaded the first time the the subtable is opened and kept for the rest of the session
	async function handleUserTopicsClick(): Promise<void> {
		setIsUserTopicsOpen(!isUserTopicsOpen)
		if (userTopics !== null || user.topicCount === 0) {
			return
		}
		try {
			setUserTopics(await fetchAdminUserTopics(user.id))
		} catch (error) {
			console.error("admin user topics failed", error)
			toast.error("Couldn't load that user's topics.")
			setIsUserTopicsOpen(false)
		}
	}

	// the cost is shown against the effective budget. highlight the figure if the user is over their budget
	const isOverBudget = user.monthVariableCostCents !== null && user.monthVariableCostCents > user.effectiveBudgetCents
	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">{user.email}</td>
				<td className="py-2 pr-4">
					{/* an admin cannot change their own role, so the platform always keeps at least one admin */}
					<select
						value={user.role}
						disabled={user.id === signedInUserId}
						onChange={(event) => handleRoleChange(event.target.value)}
						className="rounded-md border px-1 py-0.5 disabled:opacity-50"
					>
						<option value="user">user</option>
						<option value="admin">admin</option>
					</select>
				</td>
				<td className="py-2 pr-4 capitalize">{user.plan}</td>
				<td className="py-2 pr-4">{new Date(user.createdAt).toLocaleDateString()}</td>
				<td className="py-2 pr-4">
					{/* the topic count opens this user's topics subtable under the row. a user with no topics has nothing to open */}
					<button
						type="button"
						onClick={handleUserTopicsClick}
						disabled={user.topicCount === 0}
						className="text-link flex items-center gap-0.5 hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
					>
						{user.topicCount}
						{/* the chevron points down when the topics table is closed and rotates up when it opens */}
						{user.topicCount > 0 && (
							<ChevronDown
								aria-hidden="true"
								className={cn("size-3.5 shrink-0 transition-transform", isUserTopicsOpen && "rotate-180")}
							/>
						)}
					</button>
				</td>
				<td className="py-2 pr-4">{toBytesLabel(user.attributedBytes)}</td>
				<td className="py-2 pr-4">{toCentsLabel(user.scanSpendCents)}</td>
				<td className="py-2 pr-4">{toCentsLabel(user.chatSpendCents)}</td>
				<td className={`py-2 pr-4 ${isOverBudget ? "text-destructive font-semibold" : ""}`}>
					{toCentsLabel(user.monthVariableCostCents)} / {toCentsLabel(user.effectiveBudgetCents)}
				</td>
				<td className="py-2 pr-4">
					<input
						type="number"
						min={0}
						defaultValue={user.budgetOverrideCents !== null ? user.budgetOverrideCents / 100 : ""}
						onBlur={(event) => handleBudgetChange(event.target.value)}
						placeholder="$0"
						className="w-24 rounded-md border px-1 py-0.5"
					/>
				</td>
			</tr>
			{/* this user's topics subtable */}
			{isUserTopicsOpen && (
				<tr className="border-b">
					<td colSpan={10} className="py-2">
						{userTopics ? (
							<TopicsTable
								topics={userTopics}
								onReloadPage={onReloadPage}
								isEmailEditable={false}
								isOwnersTable={false}
							/>
						) : (
							<p className="text-muted-foreground text-sm">Loading topics…</p>
						)}
					</td>
				</tr>
			)}
		</>
	)
}
