// toast action tests: each action's label and the page its click opens
import { expect, mock, test } from "bun:test"
import type { UseNavigateResult } from "@tanstack/react-router"
import type { MouseEvent } from "react"
import { toSeeAccountToastAction, toSeePlansToastAction } from "./toastActions"

// click an action with a recording navigate, and return the navigation it asked for
function toClickedNavigation(toAction: typeof toSeePlansToastAction): { label: unknown; navigation: unknown } {
	const navigate = mock(async (_navigation: unknown) => {})
	const action = toAction(navigate as unknown as UseNavigateResult<string>)
	action.onClick({} as MouseEvent<HTMLButtonElement>)
	return { label: action.label, navigation: navigate.mock.calls[0]?.[0] }
}

test("the See plans action opens the plans page", () => {
	expect(toClickedNavigation(toSeePlansToastAction)).toEqual({ label: "See plans", navigation: { to: "/plans" } })
})

test("the See account action opens the account page", () => {
	expect(toClickedNavigation(toSeeAccountToastAction)).toEqual({
		label: "See account",
		navigation: { to: "/account" },
	})
})
