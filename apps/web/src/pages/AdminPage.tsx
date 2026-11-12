import { authClient } from "@carlnotes/client/authClient"
import { fetchAdminConsole } from "@carlnotes/client/billingClient"
import { fetchAdminReports } from "@carlnotes/client/reportClient"
import type { AdminConsoleResponse, AdminTeamRow, AdminTotals, AdminUserRow } from "@carlnotes/contracts/admin"
import { plans } from "@carlnotes/contracts/enums"
import { type ProfileIdentity, toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import type { AdminReport } from "@carlnotes/contracts/reports"
import { toBytesLabel, toCentsLabel, toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { setOpenReportCount } from "@carlnotes/core/stores/openReportStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Settings, ShieldUser } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { DailySpendCutoffsCard } from "@/components/admin/DailySpendCutoffsCard"
import { ManageAdminsModal } from "@/components/admin/ManageAdminsModal"
import { MobileMinimumVersionsCard } from "@/components/admin/MobileMinimumVersionsCard"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AccordionSection } from "@/components/common/AccordionSection"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { AdminReportsTable } from "@/components/table/AdminReportsTable"
import { AdminTeamsTable } from "@/components/table/AdminTeamsTable"
import { AdminUsersTable } from "@/components/table/AdminUsersTable"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useSearchParams } from "@/hooks/useSearchParams"
import {
	HIGHLIGHTED_CARD_CLASS,
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PAGE_CLASS,
	PAGE_HEADER_CLASS,
	PAGE_TITLE_CLASS,
	SKELETON_SHAPE_CLASS,
} from "@/lib/styleClasses"

/**
 * The admin-only console: a totals summary and a per-user table with inline role and budget-override edits.
 */
export function AdminPage() {
	usePageTitle("Admin")
	const { data: session } = authClient().useSession()
	const [adminConsole, setAdminConsole] = useState<AdminConsoleResponse | null>(null)
	const [isForbidden, setIsForbidden] = useState(false)
	const [isManagingAdmins, setIsManagingAdmins] = useState(false)
	// the Blocks card narrows the users table to the users under an admin block
	const [isShowingAdminBlockedUsers, setIsShowingAdminBlockedUsers] = useState(false)
	// the open reports, and the one the report email linked to
	const [reports, setReports] = useState<AdminReport[]>([])
	const focusedReportId = useSearchParams().get("report")

	// load the console payload and the open reports, and again after each inline edit or resolution
	const loadConsole = useCallback(() => {
		fetchAdminConsole()
			.then(setAdminConsole)
			.catch(() => setIsForbidden(true))
		fetchAdminReports()
			.then((openReports) => {
				setReports(openReports)
				setOpenReportCount(openReports.length)
			})
			.catch(() => setReports([]))
	}, [])

	useEffect(() => {
		if (session) {
			loadConsole()
		}
	}, [session, loadConsole])

	// render nothing while the session loads
	if (!session) {
		return null
	}

	// show the no-access message after a failed load
	if (isForbidden) {
		return <main className={cn(PAGE_CLASS, "max-w-6xl")}>You do not have access to this page.</main>
	}

	// show the loaded page's own header until the console loads, with a placeholder for its button, over the animation
	if (!adminConsole) {
		return (
			<main className={ADMIN_PAGE_CLASS}>
				<AdminPageHeader user={toSessionProfileIdentity(session.user)} openReportCount={reports.length}>
					<div aria-hidden="true" className={cn(SKELETON_SHAPE_CLASS, "h-9 w-40 rounded-md")} />
				</AdminPageHeader>
				<div className="px-safe mt-6">
					<CoffeeLoading />
				</div>
			</main>
		)
	}

	// the users under an admin block, which the Blocks card counts and filters to
	const adminBlockedUsers = adminConsole.users.filter((user) => user.isAdminBlocked)
	// the users the table lists: everyone, or the ones under an admin block while the Blocks card is pressed
	const shownUsers = isShowingAdminBlockedUsers ? adminBlockedUsers : adminConsole.users
	return (
		<main className={ADMIN_PAGE_CLASS}>
			<AdminPageHeader user={toSessionProfileIdentity(session.user)} openReportCount={reports.length}>
				<Button className={HIGHLIGHTED_PAGE_BUTTON_CLASS} onClick={() => setIsManagingAdmins(true)}>
					<Settings className="size-4" />
					Manage admins
				</Button>
			</AdminPageHeader>
			<div className="px-safe">
				<TotalSummaries
					totals={adminConsole.totals}
					users={adminConsole.users}
					teams={adminConsole.teams}
					adminBlockedUserCount={adminBlockedUsers.length}
					isShowingAdminBlockedUsers={isShowingAdminBlockedUsers}
					onToggleAdminBlockedUsers={() => setIsShowingAdminBlockedUsers((isShowing) => !isShowing)}
				/>
				{/* the sections as accordions */}
				<Accordion type="multiple" defaultValue={["limits", "reports", "users", "teams", "mobile"]} className="mt-4">
					{/* the daily spend cutoffs and the other limits */}
					<AccordionSection
						value="limits"
						title="Limits"
						countLabel={toLimitsSectionCountLabel(adminConsole.dailySpendCutoffs.cutoffs.length)}
					>
						<DailySpendCutoffsCard dailySpendCutoffs={adminConsole.dailySpendCutoffs} onSaved={loadConsole} />
					</AccordionSection>
					{/* the open reports, resolved from here */}
					<AccordionSection value="reports" title="Reports" countLabel={toSectionCountLabel(reports.length, "report")}>
						<AdminReportsTable reports={reports} focusedReportId={focusedReportId} onResolved={loadConsole} />
					</AccordionSection>
					<AccordionSection value="users" title="Users" countLabel={toSectionCountLabel(shownUsers.length, "user")}>
						<AdminUsersTable users={shownUsers} signedInUserId={session.user.id} onReload={loadConsole} />
					</AccordionSection>
					<AccordionSection
						value="teams"
						title="Teams"
						countLabel={toSectionCountLabel(adminConsole.teams.length, "team")}
					>
						<AdminTeamsTable teams={adminConsole.teams} />
					</AccordionSection>
					{/* mobile app minimum versions */}
					<AccordionSection value="mobile" title="Mobile app">
						<MobileMinimumVersionsCard minimumVersions={adminConsole.mobileMinimumVersions} onSaved={loadConsole} />
					</AccordionSection>
				</Accordion>
			</div>
			{isManagingAdmins && (
				<ManageAdminsModal
					users={adminConsole.users}
					signedInUserId={session.user.id}
					onClose={() => setIsManagingAdmins(false)}
					onChanged={loadConsole}
				/>
			)}
		</main>
	)
}

// the page's shell, loaded or loading. the tables stay wide, and the padding sits on each block instead of the main
const ADMIN_PAGE_CLASS = "mx-auto max-w-6xl pt-3 pb-10"

// the title and the profile link, which align under the search bar's width: the page title with the same icon as its
// header menu item, the manage admins button or its placeholder to the right, and the admin viewing the console
function AdminPageHeader({
	user,
	openReportCount,
	children,
}: {
	user: ProfileIdentity
	openReportCount: number
	children: ReactNode
}) {
	return (
		<div className="mx-auto max-w-5xl px-safe">
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<ShieldUser className="size-6" />
					{/* the title's top-right corner shows the open report count */}
					<span className="relative">
						Admin
						<UpdateCountBadge openReportCount={openReportCount} className="absolute -top-2 -right-3.5 z-10" />
					</span>
				</h1>
				{children}
			</div>
			{/* the admin viewing the console, with a link to their profile */}
			<UserProfileLink user={user} className="mt-2 text-sm" />
		</div>
	)
}

// the platform totals: user counts per plan, the team count, storage, this month's cost, net revenue, and contribution
function TotalSummaries({
	totals,
	users,
	teams,
	adminBlockedUserCount,
	isShowingAdminBlockedUsers,
	onToggleAdminBlockedUsers,
}: {
	totals: AdminTotals
	users: AdminUserRow[]
	teams: AdminTeamRow[]
	adminBlockedUserCount: number
	isShowingAdminBlockedUsers: boolean
	onToggleAdminBlockedUsers: () => void
}) {
	// the users on each plan. a count, not a plan gate
	const usersByPlan = Map.groupBy(users, (user) => user.plan)
	return (
		<div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
			<PlanCountCard label="Users" counts={plans.map((countedPlan) => usersByPlan.get(countedPlan)?.length ?? 0)} />
			<TotalCard label="Teams" figure={String(teams.length)} />
			<TotalCard label="Storage" figure={toBytesLabel(totals.attributedBytes)} />
			<TotalCard label="Cost this month" figure={toCentsLabel(totals.monthVariableCostCents)} />
			{/* Stripe's revenue alone. a store's revenue is read in RevenueCat's dashboard */}
			<TotalCard label="Net web revenue" figure={toCentsLabel(totals.netRevenueCents)} />
			<TotalCard label="Contribution" figure={toCentsLabel(totals.contributionCents)} />
			<AdminBlockedUsersCard
				adminBlockedUserCount={adminBlockedUserCount}
				isPressed={isShowingAdminBlockedUsers}
				onToggle={onToggleAdminBlockedUsers}
			/>
		</div>
	)
}

// the Limits section's count of its settings: the cutoffs, the first scan limit, the signup alert, and the permission
function toLimitsSectionCountLabel(cutoffCount: number): string {
	return [toSectionCountLabel(cutoffCount, "cutoff"), "1 limit", "1 alert", "1 permission"].join(" · ")
}

// a card counting something per plan, one row per plan in order
function PlanCountCard({ label, counts }: { label: string; counts: number[] }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-raised">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 space-y-0.5 text-sm">
				{plans.map((plan, index) => (
					<div key={plan} className="flex justify-between gap-2">
						<span className="capitalize">{plan}</span>
						<span className="font-semibold">{counts[index] ?? 0}</span>
					</div>
				))}
			</div>
		</div>
	)
}

// the count of users under an admin block, a toggle that filters the users table to them
function AdminBlockedUsersCard({
	adminBlockedUserCount,
	isPressed,
	onToggle,
}: {
	adminBlockedUserCount: number
	isPressed: boolean
	onToggle: () => void
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={isPressed}
			className={cn(
				"bg-card flex flex-col rounded-lg border p-3 text-left shadow-raised",
				isPressed ? HIGHLIGHTED_CARD_CLASS : "hover:border-primary/50",
			)}
		>
			<div className="text-muted-foreground text-xs">Blocks</div>
			<div className="mt-1 font-semibold">{adminBlockedUserCount}</div>
		</button>
	)
}

// a card with a labeled summary figure
function TotalCard({ label, figure }: { label: string; figure: string }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-raised">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 font-semibold">{figure}</div>
		</div>
	)
}
