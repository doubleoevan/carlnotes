// the action buttons a toast offers, each opening the page that explains what stopped the user
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { UseNavigateResult } from "@tanstack/react-router"
import type { Action } from "sonner"

/**
 * Returns the toast's See plans action, which opens the plans page.
 */
export function toSeePlansToastAction(navigate: UseNavigateResult<string>): Action {
	return { label: PURCHASE_COPY.seePlans, onClick: () => void navigate({ to: PLANS_PATH }) }
}

/**
 * Returns the toast's See account action, which opens the account page.
 */
export function toSeeAccountToastAction(navigate: UseNavigateResult<string>): Action {
	return { label: "See account", onClick: () => void navigate({ to: "/account" }) }
}
