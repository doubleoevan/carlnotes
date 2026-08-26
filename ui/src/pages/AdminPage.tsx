import type { AdminConsoleResponse, AdminTeamRow, AdminTotals, AdminUserRow } from "@shared/contracts"
import { plans } from "@shared/enums"
import { Settings, ShieldUser } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/clients/authClient"
import { fetchAdminConsole } from "@/clients/billingClient"
import { ManageAdminsModal } from "@/components/admin/ManageAdminsModal"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { AdminTeamsTable } from "@/components/table/AdminTeamsTable"
import { AdminUsersTable } from "@/components/table/AdminUsersTable"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toBytesLabel, toCentsLabel } from "@/lib/labels"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The admin-only console: a totals summary and a per-user table with inline role and budget-override edits.
 */
export function AdminPage() {
	usePageTitle("Admin")
	const { data: session } = authClient.useSession()
	const [adminConsole, setAdminConsole] = useState<AdminConsoleResponse | null>(null)
	const [isForbidden, setIsForbidden] = useState(false)
	const [isManagingAdmins, setIsManagingAdmins] = useState(false)

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
		return <main className={cn(PAGE_CLASS, "max-w-6xl")}>Please log in.</main>
	}
	if (isForbidden) {
		return <main className={cn(PAGE_CLASS, "max-w-6xl")}>You do not have access to this page.</main>
	}
	if (!adminConsole) {
		return (
			<main className={cn(PAGE_CLASS, "max-w-6xl")}>
				<CoffeeLoading />
			</main>
		)
	}

	return (
		<main className="mx-auto max-w-6xl pt-3 pb-10">
			{/* the title and profile link align under the search bar's width, while the tables stay wide.
			    the padding sits on each block instead of the main, so the title lines up with the other pages */}
			<div className="mx-auto max-w-5xl px-safe">
				{/* the page title with the same icon as its header menu item, and the manage admins button to the right */}
				<div className="flex items-center justify-between gap-4">
					<h1 className="font-display flex items-center gap-2 text-2xl">
						<ShieldUser className="size-6" />
						Admin
					</h1>
					<Button className="shrink-0" onClick={() => setIsManagingAdmins(true)}>
						<Settings className="size-4" />
						Manage admins
					</Button>
				</div>
				{/* the admin viewing the console, with a link to their profile */}
				<UserProfileLink
					user={{
						userId: session.user.id,
						username: session.user.username ?? "",
						avatarSource: session.user.avatarSource ?? null,
					}}
					className="mt-2 text-sm"
				/>
			</div>
			<div className="px-safe">
				<TotalSummaries totals={adminConsole.totals} users={adminConsole.users} teams={adminConsole.teams} />
				{/* the two sections as accordions, the shape every other page's sections take */}
				<Accordion type="multiple" defaultValue={["users", "teams"]} className="mt-4">
					<AccordionItem value="users">
						<AccordionTrigger className="font-semibold">Users</AccordionTrigger>
						<AccordionContent>
							<AdminUsersTable users={adminConsole.users} signedInUserId={session.user.id} onReload={loadConsole} />
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="teams">
						<AccordionTrigger className="font-semibold">Teams</AccordionTrigger>
						<AccordionContent>
							<AdminTeamsTable teams={adminConsole.teams} />
						</AccordionContent>
					</AccordionItem>
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

// the platform totals: user counts per plan, the team count, attributed storage, current month-to-date cost,
function TotalSummaries({
	totals,
	users,
	teams,
}: {
	totals: AdminTotals
	users: AdminUserRow[]
	teams: AdminTeamRow[]
}) {
	return (
		<div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
			<PlanCountCard label="Users" counts={plans.map((plan) => users.filter((user) => user.plan === plan).length)} />
			<TotalCard label="Teams" figure={String(teams.length)} />
			<TotalCard label="Storage" figure={toBytesLabel(totals.attributedBytes)} />
			<TotalCard label="Cost this month" figure={toCentsLabel(totals.monthVariableCostCents)} />
			<TotalCard label="Net revenue" figure={toCentsLabel(totals.netRevenueCents)} />
			<TotalCard label="Contribution" figure={toCentsLabel(totals.contributionCents)} />
		</div>
	)
}

// a card counting something per plan, one row per plan in order
function PlanCountCard({ label, counts }: { label: string; counts: number[] }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-lift">
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

// a card with a labeled summary figure
function TotalCard({ label, figure }: { label: string; figure: string }) {
	return (
		<div className="bg-card rounded-lg border p-3 shadow-lift">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 font-semibold">{figure}</div>
		</div>
	)
}
