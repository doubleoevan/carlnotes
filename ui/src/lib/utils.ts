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
 * A path safe to send a signed-out visitor back to after login. A browser reads a backslash as a slash
 * and strips control characters, so a backslash path would leave the site the way "//evil.com" would.
 */
export function toSafeRedirectPath(path: string | null): string {
	if (!path?.startsWith("/") || path.startsWith("//")) {
		return "/"
	}
	// checked per character, since a regex written with control characters trips the lint rule against them
	const hasEscapeCharacter = [...path].some((character) => character === "\\" || character.charCodeAt(0) < 0x20)
	return hasEscapeCharacter ? "/" : path
}

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
 * Order findings for display. Bookmarked findings are pinned above the unbookmarked ones in every mode,
 * and the current sort orders each group among itself, never interleaving the two.
 */
export function toSortedFindings(findings: TopicFinding[], sort: FindingSort): TopicFinding[] {
	const bookmarkedFindings = findings.filter((finding) => finding.isBookmarked)
	const unbookmarkedFindings = findings.filter((finding) => !finding.isBookmarked)
	return [...sortFindings(bookmarkedFindings, sort), ...sortFindings(unbookmarkedFindings, sort)]
}

// one group's ordering under the active sort mode
function sortFindings(findings: TopicFinding[], sort: FindingSort): TopicFinding[] {
	// relevance scores bunch at the top, so most of the first page ties and the tiebreak does the ordering.
	// recency then the id settle a tie the same way wherever the list is built
	if (sort === "relevant") {
		return [...findings].sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore ||
				byRecency(first, second) ||
				first.findingId.localeCompare(second.findingId),
		)
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
 * The copy that predates the clipboard api, for the browsers that refuse it. An off-screen field is selected
 * and copied through the document. It reports whether the copy took, since a browser can refuse this route too.
 */
export function copyThroughSelection(text: string): boolean {
	const textareaElement = document.createElement("textarea")
	textareaElement.value = text
	// off-screen instead of hidden, since a field the browser considers invisible cannot be selected
	textareaElement.style.position = "fixed"
	textareaElement.style.opacity = "0"
	document.body.append(textareaElement)
	textareaElement.select()
	const isCopied = document.execCommand("copy")
	textareaElement.remove()
	return isCopied
}

/**
 * The message to show a new invite subscriber that they will see findings only from the next scan onward.
 */
export const NEXT_SCAN_DISCLAIMER = "Findings appear after the topic's next brew."

/**
 * The topic page's subscribe control tooltip. A visitor sees the sign-up nudge, and a signed-in user sees
 * the toggle state, with the next-scan disclaimer added when subscribing to an "invite" topic.
 */
export function toSubscribeTooltip(isSignedIn: boolean, isSubscribed: boolean, isInviteTopic: boolean): string {
	// a visitor is nudged to sign up before the toggle applies to them at all
	if (!isSignedIn) {
		return "Sign up to subscribe"
	}
	// already subscribed, so the control's action is to leave
	if (isSubscribed) {
		return "Unsubscribe from this topic"
	}
	// subscribing to an invite topic is accepting it, so the copy includes the next-scan expectation
	return isInviteTopic ? `Subscribe to this topic. ${NEXT_SCAN_DISCLAIMER}` : "Subscribe to this topic"
}

/**
 * The bordered button treatment shared by the feed toolbar's controls.
 */
export const MENU_BUTTON_CLASS =
	"bg-card text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm shadow-lift sm:min-h-9"

/**
 * The thin visible scrollbar sized on both axes, so it shows automatically for vertical and horizontal overflow alike.
 */
export const THIN_SCROLLBAR_CLASS =
	"[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5"

/**
 * The card chrome wrapped around every data table, with the visible scrollbar showing automatically for overflow.
 */
export const TABLE_CARD_CLASS = `bg-card overflow-x-auto rounded-lg border p-4 shadow-lift ${THIN_SCROLLBAR_CLASS}`

// the section card chrome shared by the account page's panels
export const SECTION_CARD_CLASS = "bg-card rounded-lg border p-4 shadow-lift"

/**
 * The centered display-font title at the top of a note popover.
 */
export const POPOVER_HEADING_CLASS = "font-display mb-2 text-center text-lg"

/**
 * The card chrome around the topic page's info and settings sections.
 */
export const INFO_CARD_CLASS = "border-separator bg-card h-fit rounded-lg border p-5 text-sm shadow-lift"

/**
 * The card chrome around a numbered list of resources. Its background is mostly transparent, so the steam rings
 * drifting behind the page still read through it, and it is the shadow instead of the fill that lifts it off them.
 * The dark card includes more fill than the light one, which needs less to separate from the page behind it.
 */
export const RESOURCE_LIST_CARD_CLASS = "border-separator/60 bg-card/35 dark:bg-card/55 rounded-lg border shadow-lift"

/**
 * The inset that lines up a right-aligned row with the quota line above it. Text takes the full inset.
 * An icon button takes a smaller one — its glyph already sits inset from its own touch target, so the
 * full inset would push it in twice.
 */
export const RAIL_TEXT_INSET = "mr-2.5"
export const RAIL_ICON_INSET = "mr-1"

/**
 * What a file picker offers, shared by the chat composer and the topic prompt so the two cannot drift.
 */
export const FILE_PICKER_ACCEPT = "image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.log"

// a url written in a topic prompt, matched case-insensitively since a pasted address may carry an upper-case
// scheme. it runs to whitespace and then gives back the punctuation that usually ends a sentence, so a trailing
// period or comma is not read as part of the address. brackets are settled by toBalancedUrl instead of here
const PROMPT_URL_PATTERN = /https?:\/\/\S*[^\s<>"'.,;:!?]/gi

// a url keeps a closing bracket it opened and gives back one the sentence around it opened, so
// "(see https://example.com/a)" drops the paren while "https://example.com/a_(b)" keeps its own
function toBalancedUrl(url: string): string {
	let balancedUrl = url
	while (/[)\]]$/.test(balancedUrl)) {
		// count the bracket that actually closed, so a url ending in ] is not judged by its parens
		const isParen = balancedUrl.endsWith(")")
		const opened = balancedUrl.split(isParen ? "(" : "[").length - 1
		const closed = balancedUrl.split(isParen ? ")" : "]").length - 1
		if (opened >= closed) {
			break
		}

		// the url never opened this one, so it belongs to the sentence
		balancedUrl = balancedUrl.slice(0, -1)
	}
	return balancedUrl
}

// the url a Source reads, for the kinds that name one. everything else has no url to compare against
function toSourceUrl(
	source: { sourceKind: string; config?: Record<string, unknown> } | { optionKey: string; value: string },
): string {
	// a staged Source includes the raw value typed into its picker option, while a stored one includes a parsed config
	if ("value" in source) {
		return source.optionKey === "url" || source.optionKey === "rss" ? source.value : ""
	}
	return typeof source.config?.url === "string" ? source.config.url : ""
}

/**
 * The urls written in a topic prompt that are not already a Source. They are offered instead of being added, since
 * a url mentioned in passing is not necessarily one Carl should read on every scan.
 */
export function toPossibleSourceUrls(
	prompt: string,
	keptSources: { sourceKind: string; config?: Record<string, unknown> }[],
	addedSources: { optionKey: string; value: string }[],
): string[] {
	const sourceUrls = new Set([...keptSources, ...addedSources].map(toSourceUrl).filter(Boolean))
	const writtenUrls = (prompt.match(PROMPT_URL_PATTERN) ?? []).map(toBalancedUrl)
	return [...new Set(writtenUrls)].filter((url) => !sourceUrls.has(url))
}

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

/**
 * A uniformly shuffled copy of the items. The input array stays untouched.
 */
export function shuffle<T>(items: T[]): T[] {
	// Fisher-Yates over a copy: walk from the back, swapping each slot with a random one not yet fixed,
	// so every ordering is equally likely
	const shuffled = [...items]
	for (let index = shuffled.length - 1; index > 0; index--) {
		// swap this slot with one at or before it. the casts only drop the undefined that
		// noUncheckedIndexedAccess adds, since both indexes are in range
		const swapIndex = Math.floor(Math.random() * (index + 1))
		const heldItem = shuffled[index] as T
		shuffled[index] = shuffled[swapIndex] as T
		shuffled[swapIndex] = heldItem
	}
	return shuffled
}

/**
 * An ISO date as its month and year: Jul 2026. Empty for a null date.
 */
export function toMonthYearLabel(dateString: string | null): string {
	if (!dateString) {
		return ""
	}
	return new Date(dateString).toLocaleDateString(undefined, { month: "short", year: "numeric" })
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
	// only weekly includes a day, capitalized for display
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

/**
 * A count of Brews with the right plural
 */
export function toBrewsWord(count: number): string {
	return count === 1 ? "Brew" : "Brews"
}
