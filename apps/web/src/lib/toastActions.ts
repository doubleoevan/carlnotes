// the action buttons a toast offers, each opening the page that explains what stopped the user
import type { UseNavigateResult } from "@tanstack/react-router"
import type { Action } from "sonner"

/**
 * Returns the toast's See plans action, which opens the plans page.
 */
export function toSeePlansToastAction(navigate: UseNavigateResult<string>): Action {
	return { label: "See plans", onClick: () => void navigate({ to: "/plans" }) }
}

/**
 * Returns the toast's See account action, which opens the account page.
 */
export function toSeeAccountToastAction(navigate: UseNavigateResult<string>): Action {
	return { label: "See account", onClick: () => void navigate({ to: "/account" }) }
}
