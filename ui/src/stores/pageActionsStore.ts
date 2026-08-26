import type { FlagContentPayload } from "@shared/contracts"
import type { LucideIcon } from "lucide-react"
import { useEffect, useSyncExternalStore } from "react"

/**
 * An option in the page actions dropdown menu.
 */
export type PageActionOption = {
	label: string
	Icon: LucideIcon
	// whether the row stands for something already on, which fills its icon
	isActive?: boolean
	onSelect: () => void
}

/**
 * What the search bar's vertical "…" menu offers for the current page on screen.
 */
export type PageActions = {
	// the page's name, so the menu describes itself: Topic actions, Team actions
	page: string
	// what this page offers, like editing or deleting what it shows
	options?: PageActionOption[]
	// whether the bookmarked filter can scope to a team
	hasTeamBookmarks?: boolean
	// what the report issue option from this page flags
	report?: {
		subjectKind: FlagContentPayload["subjectKind"]
		subjectId: string
		subjectLabel: string
	}
}

// the page on screen owns the menu, so only one registration stands at a time
let pageActions: PageActions | null = null
const listeners = new Set<() => void>()
let version = 0

// notify every subscriber if the registration changed
function publish(actions: PageActions | null): void {
	pageActions = actions
	version += 1
	for (const listener of listeners) {
		listener()
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/**
 * A page registers its actions, which the menu reads. A page with no actions registers null.
 */
export function useRegisterPageActions(actions: PageActions | null): void {
	// each render builds a new actions object, and react would count every one as a change
	const signature = JSON.stringify(actions, (_, value) => (typeof value === "function" ? "handler" : value))
	// biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands in for the object
	useEffect(() => {
		publish(actions)
		return () => publish(null)
	}, [signature])
}

/**
 * The actions the page on screen registered, or null if a page doesn't have any.
 */
export function usePageActions(): PageActions | null {
	useSyncExternalStore(subscribe, () => version)
	return pageActions
}
