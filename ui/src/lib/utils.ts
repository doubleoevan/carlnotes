// the helpers with no larger subject of their own to live under
import { type ClassValue, clsx } from "clsx"
import { FileText, Headphones, type LucideIcon, Play } from "lucide-react"
import { twMerge } from "tailwind-merge"
import type { ResourceKind } from "@/providers/TopicFeedProvider"

/**
 * A path safe to send a signed-out visitor back to after login. A browser reads a backslash as a slash
 * and strips control characters, so a backslash path would leave the site the way "//evil.com" would.
 */
export function toSafeRedirectPath(path: string | null): string {
	if (!path?.startsWith("/") || path.startsWith("//")) {
		return "/"
	}
	// checked per character. a regex written with control characters trips the lint rule against them
	const hasEscapeCharacter = [...path].some((character) => character === "\\" || character.charCodeAt(0) < 0x20)
	return hasEscapeCharacter ? "/" : path
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
 * The copy that predates the clipboard api, for the browsers that refuse it. An off-screen textarea is written to, selected,
 * and copied through the document. It reports whether the copy succeeded, which a browser can also refuse.
 */
export function copyWithDocument(text: string): boolean {
	const textareaElement = document.createElement("textarea")
	textareaElement.value = text
	// off-screen instead of hidden. a field the browser considers invisible cannot be selected
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
 * The Follow button's tooltip. A visitor sees the sign-up nudge, and a signed-in user sees
 * the toggle state, with the next-scan disclaimer added when subscribing to an "invite" topic.
 */
export function toSubscribeTooltip(isSignedIn: boolean, isSubscribed: boolean, isInviteTopic: boolean): string {
	// a visitor is nudged to sign up before the toggle applies to them at all
	if (!isSignedIn) {
		return "Sign up to subscribe"
	}
	// already subscribed, so the Follow button's action is to leave
	if (isSubscribed) {
		return "Unsubscribe from this topic"
	}
	// subscribing to an invite topic is accepting it, so the copy includes the next-scan expectation
	return isInviteTopic ? `Subscribe to this topic. ${NEXT_SCAN_DISCLAIMER}` : "Subscribe to this topic"
}

/**
 * Whether the viewport is wide enough for a docked panel to sit beside the page instead of filling it.
 */
export function isWideScreen(): boolean {
	return window.matchMedia("(min-width: 640px)").matches
}

/**
 * What the topic prompt's file picker shows.
 */
export const FILE_PICKER_ACCEPT = "image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.log"

/**
 * What the chat composers' file pickers offer: the topic prompt's list plus the video types a chat can play back.
 */
export const CHAT_FILE_PICKER_ACCEPT = `${FILE_PICKER_ACCEPT},video/mp4,video/quicktime,video/webm`

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
	// Fisher-Yates over a copy
	const shuffled = [...items]
	for (let index = shuffled.length - 1; index > 0; index--) {
		// swap this slot with one at or before it
		const swapIndex = Math.floor(Math.random() * (index + 1))
		const heldItem = shuffled[index] as T
		shuffled[index] = shuffled[swapIndex] as T
		shuffled[swapIndex] = heldItem
	}
	return shuffled
}
