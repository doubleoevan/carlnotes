// a user row's plan select in the admin users table, with a plan an admin set's badge
import type { AdminUserRow } from "@carlnotes/contracts/admin"
import { plans } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TABLE_CONTROL_CLASS } from "@/lib/styleClasses"

/**
 * A user row's plan select, with a plan an admin set's badge, its end date, and its reason in a tooltip. Picking a plan
 * opens the plan change dialog for a new admin plan change, and clicking the badge opens it to change the current one.
 */
export function UserPlanSelect({
	user,
	onPlanPick,
	onAdminPlanChangeEdit,
}: {
	user: AdminUserRow
	onPlanPick: (plan: Plan | null) => void
	onAdminPlanChangeEdit: () => void
}) {
	return (
		<div className="flex flex-col items-start gap-1">
			{/* the options list the plans in order, so the picked option's index names its plan */}
			<select
				value={user.plan}
				onChange={(event) => onPlanPick(plans[event.target.selectedIndex] ?? null)}
				aria-label={`${user.username}'s plan`}
				className={TABLE_CONTROL_CLASS}
			>
				{plans.map((plan) => (
					<option key={plan} value={plan}>
						{plan}
					</option>
				))}
			</select>
			{/* a plan an admin set shows its badge and end date, with the reason in the tooltip. a click reopens the dialog on
			    the same plan, to change the reason or the end date */}
			{user.adminPlanChange && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onAdminPlanChangeEdit}
							aria-label={`Edit ${user.username}'s admin plan change`}
							className="flex items-center gap-1 whitespace-nowrap"
						>
							<Badge variant="secondary">Set by admin</Badge>
							<span className="text-muted-foreground text-xs">
								{user.adminPlanChange.endsAt ? `until ${toDateLabel(user.adminPlanChange.endsAt)}` : "no end"}
							</span>
						</button>
					</TooltipTrigger>
					<TooltipContent>{user.adminPlanChange.reason}</TooltipContent>
				</Tooltip>
			)}
		</div>
	)
}
