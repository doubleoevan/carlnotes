import type { AdminUserRow } from "@carlnotes/contracts/admin"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import { ADMIN_PLAN_CHANGE_REASON_MAX } from "@carlnotes/contracts/payloads"
import type { Plan } from "@carlnotes/contracts/plans"
import { type FormEvent, useState } from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"

// the admin plan change a dialog saves: the plan, the reason, and the end date as an ISO time, null for no end
export type AdminPlanChangeSave = { plan: Plan; reason: string; endsAt: string | null }

/**
 * The admin users table's admin plan change dialog: a required reason and an optional end date for the plan the admin
 * picked, which the user keeps without billing until that date ends. An admin plan change being edited starts from its
 * reason and end date.
 */
export function AdminPlanChangeDialog({
	username,
	plan,
	adminPlanChange = null,
	onSave,
	onClose,
}: {
	username: string
	plan: Plan
	adminPlanChange?: AdminUserRow["adminPlanChange"]
	onSave: (adminPlanChangeSave: AdminPlanChangeSave) => Promise<void>
	onClose: () => void
}) {
	const [reason, setReason] = useState(adminPlanChange?.reason ?? "")
	const [endDate, setEndDate] = useState(adminPlanChange?.endsAt ? toLocalDate(new Date(adminPlanChange.endsAt)) : "")
	const [isPending, setIsPending] = useState(false)

	// save once, ending the admin plan change at the close of its end date in the admin's time zone
	async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (isPending || !reason.trim()) {
			return
		}
		setIsPending(true)
		try {
			const endTime = isPaidPlan(plan) && endDate ? new Date(`${endDate}T23:59:59`) : null
			const endsAt = endTime && !Number.isNaN(endTime.getTime()) ? endTime.toISOString() : null
			await onSave({ plan, reason: reason.trim(), endsAt })
		} finally {
			setIsPending(false)
		}
	}

	// the earliest end date is today
	const today = toLocalDate(new Date())
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}>
			<DialogContent className="sm:max-w-md" isCloseButtonDisabled={isPending}>
				<form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
					<DialogTitle>
						{"Change "}
						<span className="font-semibold">{username}</span>
						{` to ${plan}`}
					</DialogTitle>
					{/* the free plan ends an admin plan change, so it has no end date to ask for */}
					<DialogDescription>
						{!isPaidPlan(plan)
							? "This ends the plan an admin set and returns them to the free plan."
							: "They keep this plan without billing until the end date, then return to the free plan. Someone with an active paid subscription can't have their plan changed here."}
					</DialogDescription>
					<div className="flex flex-col gap-2">
						<Label htmlFor="admin-plan-change-reason">Reason</Label>
						<Input
							id="admin-plan-change-reason"
							value={reason}
							required
							maxLength={ADMIN_PLAN_CHANGE_REASON_MAX}
							onChange={(event) => setReason(event.target.value)}
						/>
					</div>
					<div className={!isPaidPlan(plan) ? "hidden" : "flex flex-col gap-2"}>
						<Label htmlFor="admin-plan-change-end-date">End date (optional)</Label>
						<Input
							id="admin-plan-change-end-date"
							type="date"
							min={today}
							value={endDate}
							onChange={(event) => setEndDate(event.target.value)}
						/>
					</div>
					<DialogFooter>
						{/* aria-disabled instead of disabled, so the focused button keeps focus while the save runs */}
						<Button type="button" variant="ghost" onClick={() => !isPending && onClose()} aria-disabled={isPending}>
							Cancel
						</Button>
						<Button type="submit" aria-disabled={isPending || !reason.trim()}>
							{!isPaidPlan(plan) ? "Return to free" : "Change plan"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

// a time's date in the admin's time zone, as a date input's yyyy-mm-dd value
function toLocalDate(time: Date): string {
	return time.toLocaleDateString("en-CA")
}
