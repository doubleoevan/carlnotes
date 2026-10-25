import type { AdminUserRow } from "@carlnotes/contracts/admin"
import { isAdminRole, isPaidPlan } from "@carlnotes/contracts/enums"
import { toBytesLabel, toCentsLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { UserRow } from "./AdminUserRows"
import { type RowSort, SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

// the sort accessors for the users table columns
const userSortValues = {
	user: (user: AdminUserRow) => user.username,
	email: (user: AdminUserRow) => user.email,
	role: (user: AdminUserRow) => user.role,
	plan: (user: AdminUserRow) => user.plan,
	signup: (user: AdminUserRow) => user.createdAt,
	lastLogin: (user: AdminUserRow) => user.lastLoginAt ?? "",
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
						<AdminUsersTableHead sort={sort} />
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
								{toCountLabel(users.filter((user) => isAdminRole(user.role)).length, "admin")}
							</td>
							<td className="py-2 pr-4">{`${users.filter((user) => isPaidPlan(user.plan)).length} paid`}</td>
							{/* signup and last login total nothing, and each still needs its cell to keep the columns lined up */}
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">{users.reduce((sum, user) => sum + user.topicCount, 0)}</td>
							<td className="py-2 pr-4">{users.reduce((sum, user) => sum + user.teamCount, 0)}</td>
							<td className="py-2 pr-4">{toBytesLabel(users.reduce((sum, user) => sum + user.attributedBytes, 0))}</td>
							<td className="py-2 pr-4">{toCentsLabel(users.reduce((sum, user) => sum + user.scanSpendCents, 0))}</td>
							<td className="py-2 pr-4">{toCentsLabel(users.reduce((sum, user) => sum + user.chatSpendCents, 0))}</td>
							<td className="py-2 pr-4">
								{toCentsLabel(users.reduce((sum, user) => sum + (user.monthVariableCostCents ?? 0), 0))} /{" "}
								{toCentsLabel(users.reduce((sum, user) => sum + user.budgetCents, 0))}
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

/**
 * The users table's header row: a sortable header per column and the close account button's empty column.
 */
export function AdminUsersTableHead({ sort }: { sort: RowSort }) {
	return (
		<tr>
			<SortableHeader sort={sort} sortKey="user" label="User" className="py-2 pr-4" />
			<SortableHeader sort={sort} sortKey="email" label="Email" className="py-2 pr-4" />
			<SortableHeader sort={sort} sortKey="role" label="Role" className="py-2 pr-4" />
			<SortableHeader sort={sort} sortKey="plan" label="Plan" className="py-2 pr-4" />
			<SortableHeader sort={sort} sortKey="signup" label="Signup" className="py-2 pr-4" />
			<SortableHeader sort={sort} sortKey="lastLogin" label="Last login" className="py-2 pr-4" />
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
			<SortableHeader sort={sort} sortKey="override" label="Override" tooltip="Budget override" className="py-2 pr-4" />
			<th className="py-2" />
		</tr>
	)
}
