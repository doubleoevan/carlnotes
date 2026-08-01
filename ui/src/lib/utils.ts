// shared utils methods and dependencies for the ui
import type { TopicFinding } from "@shared/contracts"
import type { daysOfWeek, frequencies } from "@shared/enums"
import { type ClassValue, clsx } from "clsx"
import { FileText, Headphones, type LucideIcon, Play } from "lucide-react"
import { twMerge } from "tailwind-merge"
import type { ResourceKind } from "@/providers/TopicFeedProvider"

// the feed's filter views. bookmarked narrows to the user's bookmarked findings
export const FEED_VIEWS = ["all", "unread", "bookmarked"] as const
export type FeedView = (typeof FEED_VIEWS)[number]

// the feed sort modes. all three are read-side orderings of the delivered findings, never persisted
export const FINDING_SORTS = ["relevant", "newest", "trending"] as const
export type FindingSort = (typeof FINDING_SORTS)[number]

/**
 * Whether a finding belongs in the given feed view.
 */
export function matchesFeedView(finding: Pick<TopicFinding, "isConsumed" | "isBookmarked">, view: FeedView): boolean {
	if (view === "unread") {
		return !finding.isConsumed
	}
	return view === "bookmarked" ? finding.isBookmarked : true
}

/**
 * Order findings for display. Bookmarked findings pin above the unbookmarked ones in every mode, and the
 * active sort orders each group among itself, never interleaving the two.
 */
export function toFilteredFindings(findings: TopicFinding[], sort: FindingSort): TopicFinding[] {
	const pinned = findings.filter((finding) => finding.isBookmarked)
	const unbookmarked = findings.filter((finding) => !finding.isBookmarked)
	return [...sortFindings(pinned, sort), ...sortFindings(unbookmarked, sort)]
}

// one group's ordering under the active sort mode
function sortFindings(findings: TopicFinding[], sort: FindingSort): TopicFinding[] {
	if (sort === "relevant") {
		return [...findings].sort((first, second) => second.relevanceScore - first.relevanceScore)
	}
	if (sort === "newest") {
		return [...findings].sort(byRecency)
	}
	// trending ranks captured engagement value first, and value-less findings fallback to recency
	return [...findings].sort((first, second) => {
		if (first.engagement !== null && second.engagement !== null) {
			return second.engagement - first.engagement
		}
		// a finding with a signal outranks one without, and two signal-less findings fall back to recency
		if (first.engagement !== null || second.engagement !== null) {
			return first.engagement !== null ? -1 : 1
		}
		return byRecency(first, second)
	})
}

// newest first, with the fetch time standing in when a finding has no publish date
function byRecency(a: TopicFinding, b: TopicFinding): number {
	return new Date(b.publishedAt ?? b.fetchedAt).getTime() - new Date(a.publishedAt ?? a.fetchedAt).getTime()
}

/**
 * The lucide icon mapped to its resource kind
 */
export const RESOURCE_KIND_ICON: Record<ResourceKind, LucideIcon> = {
	read: FileText,
	watch: Play,
	listen: Headphones,
}

/**
 * Display copy for the default web search source
 */
export const WEB_SOURCE = { label: "web", summary: "let Carl crawl" }

/**
 * The message to show a new invite subscriber that they will see findings only from the next scan onward.
 */
export const NEXT_SCAN_DISCLAIMER = "Findings appear after the topic's next brew."

/**
 * The subscribe control's tooltip. A visitor sees the sign-up tooltip.
 * A signed-in user sees the toggle state, and subscribing to an "invite" topic also carries the next-scan disclaimer.
 */
export function toSubscribeTooltip(isSignedIn: boolean, isSubscribed: boolean, isInviteTopic: boolean): string {
	// a visitor is nudged to sign up before the toggle applies to them at all
	if (!isSignedIn) {
		return "Sign up to subscribe"
	}
	// already subscribed, so the control's action is to leave
	if (isSubscribed) {
		return "Unsubscribe"
	}
	// subscribing to an invite topic is accepting it, so the copy carries the next-scan expectation
	return isInviteTopic ? `Subscribe. ${NEXT_SCAN_DISCLAIMER}` : "Subscribe"
}

/**
 * The bordered button treatment shared by the feed toolbar's controls.
 */
export const MENU_BUTTON_CLASS =
	"bg-card text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm shadow-sm sm:min-h-9"

/**
 * The card chrome wrapped around every data table, scrolling horizontally on narrow screens.
 */
export const TABLE_CARD_CLASS = "bg-card overflow-x-auto rounded-lg border p-4 shadow-sm"

/**
 * The centered display-font title at the top of a note popover.
 */
export const POPOVER_HEADING_CLASS = "font-display mb-2 text-center text-lg"

/**
 * The card chrome around the topic page's info and settings sections.
 */
export const INFO_CARD_CLASS = "border-separator bg-card h-fit rounded-lg border p-5 text-sm shadow-sm"

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

/**
 * The short age label for an ISO date: today, 3d, 2w, 5mo, or 2y. Empty for a null date.
 */
export function toAgeLabel(dateString: string | null): string {
	// a null date renders as nothing
	if (!dateString) {
		return ""
	}
	// bucket the elapsed days into the coarsest readable unit
	const days = Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000)
	if (days < 1) {
		return "today"
	}
	// days, then weeks
	if (days < 7) {
		return `${days}d`
	}
	if (days < 30) {
		return `${Math.floor(days / 7)}w`
	}
	// months, then years
	if (days < 365) {
		return `${Math.floor(days / 30)}mo`
	}
	return `${Math.floor(days / 365)}y`
}

/**
 * The milliseconds between a scan's start and finish. Null while it has no finish time yet.
 */
export function durationMsBetween(startedAt: string, finishedAt: string | null): number | null {
	return finishedAt === null ? null : new Date(finishedAt).getTime() - new Date(startedAt).getTime()
}

/**
 * A short duration label from milliseconds: 45s, 3 min, or 4.4 min. Empty for a null, non-finite, or negative span.
 */
export function toDurationLabel(ms: number | null): string {
	// a missing, non-finite, or negative span renders as nothing
	if (ms === null || !Number.isFinite(ms) || ms < 0) {
		return ""
	}
	// under a minute reads in whole seconds, floored so a near-minute span never rounds up into the minute format
	if (ms < 60_000) {
		return `${Math.floor(ms / 1000)}s`
	}
	// otherwise minutes to one decimal, dropping a trailing .0 so whole minutes read cleanly
	const minutes = Math.round((ms / 60_000) * 10) / 10
	return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
}

/**
 * A dollar label from an amount: $0.15, $1.20. Null, NaN, or a missing value all read as $0.00.
 */
export function toDollarLabel(dollars: number | null): string {
	// coerce null or a non-number (seed rows carry no cost) to zero before formatting
	const amount = Number.isFinite(dollars) ? (dollars as number) : 0
	return `$${amount.toFixed(2)}`
}

/**
 * A dollar label from a cents figure: $0.15, $12.00. An em dash for an unavailable (null) value.
 */
export function toCentsLabel(cents: number | null): string {
	return cents === null ? "—" : toDollarLabel(cents / 100)
}

/**
 * A 12-hour label from a "HH:MM" 24-hour time, the hour unpadded the way a clock reads it: "9:00 AM".
 */
export function toTimeLabel(time: string): string {
	const [hours = 0, minutes = 0] = time.split(":").map(Number)
	return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * The schedule sentence for a topic's frequency, time, and (for weekly) day: "Daily at 9:00 AM",
 * "Weekly on Monday at 9:00 AM".
 */
export function toScheduleLabel(
	frequency: (typeof frequencies)[number],
	scheduledTime: string,
	scheduledDayOfWeek: (typeof daysOfWeek)[number],
): string {
	const time = toTimeLabel(scheduledTime)
	// only weekly carries a day, capitalized for display
	if (frequency === "weekly") {
		return `Weekly on ${capitalize(scheduledDayOfWeek)} at ${time}`
	}
	return `${capitalize(frequency)} at ${time}`
}

/**
 * A word with its first letter capitalized, for display.
 */
export function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1)
}
