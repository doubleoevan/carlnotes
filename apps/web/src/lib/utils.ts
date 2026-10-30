// the helpers with no larger subject of their own to live under
import type { TopicFinding } from "@carlnotes/contracts/findings"
import { File, FileText, Headphones, type LucideIcon, Play } from "lucide-react"
import { toast } from "sonner"

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
 * Whether a url path is the parent path itself or a path after it, matched at a segment boundary, so "/apiary" is
 * not after "/api".
 */
export function isPathAtOrAfter(path: string, parentPath: string): boolean {
	return path === parentPath || path.startsWith(`${parentPath}/`)
}

/**
 * Reads the mcp authorize path to return to after login, with the query the mcp plugin sent to the login page, or
 * null.
 */
export function toAuthorizeReturnPath(searchParams: URLSearchParams): string | null {
	if (!searchParams.has("client_id") || !searchParams.has("redirect_uri")) {
		return null
	}
	return `/api/auth/oauth2/authorize?${searchParams.toString()}`
}

/**
 * The lucide icon mapped to its resource kind
 */
export const RESOURCE_KIND_ICON: Record<TopicFinding["resourceKind"], LucideIcon> = {
	read: FileText,
	watch: Play,
	listen: Headphones,
	unknown: File,
}

/**
 * Copies text to the clipboard, through the document for a browser that rejects the clipboard api, confirms a
 * copy that succeeded in a toast when given one, and reports whether it succeeded.
 */
export async function copyToClipboard(text: string, copiedToast?: string): Promise<boolean> {
	const isTextCopied = await writeClipboard(text)
	if (isTextCopied && copiedToast) {
		toast(copiedToast)
	}
	return isTextCopied
}

// the clipboard api, or the document for a browser that rejects it
async function writeClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return copyWithDocument(text)
	}
}

// the copy that predates the clipboard api: an off-screen textarea, selected and copied through the document
function copyWithDocument(text: string): boolean {
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
		return "Sign up to follow"
	}
	// already subscribed, so the Follow button's action is to leave
	if (isSubscribed) {
		return "Unfollow this topic"
	}
	// subscribing to an invite topic is accepting it, so the copy includes the next-scan expectation
	return isInviteTopic ? `Follow this topic. ${NEXT_SCAN_DISCLAIMER}` : "Follow this topic"
}

/**
 * Whether a key press in a composer sends the draft: Enter without Shift, outside an IME composition. An IME user
 * presses Enter to confirm a candidate, and that press arrives with isComposing true.
 */
export function isSendKey(keyPress: {
	key: string
	shiftKey: boolean
	nativeEvent: Pick<KeyboardEvent, "isComposing">
}): boolean {
	return keyPress.key === "Enter" && !keyPress.shiftKey && !keyPress.nativeEvent.isComposing
}

/**
 * Whether the viewport is wide enough for a docked panel to sit beside the page instead of filling it.
 */
export function isWideScreen(): boolean {
	return window.matchMedia("(min-width: 640px)").matches
}

/**
 * Whether the screen is touched instead of pointed at, where an on-screen keyboard covers the page while a box has focus.
 */
export function isTouchScreen(): boolean {
	return window.matchMedia("(pointer: coarse)").matches
}

/**
 * Whether the app handles a link's click itself, which is a primary click with no modifier key.
 */
export function shouldHandleLinkClick(
	click: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
	return click.button === 0 && !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey
}

/**
 * Returns a link's click handler that runs an action instead of following the link, if the app handles the click.
 */
export function toLinkClickHandler(
	handleLinkClick: () => void,
): (click: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "preventDefault">) => void {
	return (click) => {
		// a modified or secondary click is the browser's
		if (!shouldHandleLinkClick(click)) {
			return
		}

		// the app's click runs the action instead of following the link
		click.preventDefault()
		handleLinkClick()
	}
}

/**
 * What the topic prompt's file picker shows.
 */
export const FILE_PICKER_ACCEPT =
	"image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.log,.docx,.xlsx"

/**
 * What the chat composers' file pickers can accept.
 * The topic picker allows types the chat path rejects, so the lists stay separate.
 */
export const CHAT_FILE_PICKER_ACCEPT =
	"image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.log,.docx,.xlsx,video/mp4,video/quicktime,video/webm"

/**
 * Adds a listener for each event on a target, and returns the call that removes them.
 */
export function addEventListeners(target: EventTarget, listeners: [string, () => void][]): () => void {
	for (const [eventName, listener] of listeners) {
		target.addEventListener(eventName, listener)
	}

	// the call that removes every listener
	return () => {
		for (const [eventName, listener] of listeners) {
			target.removeEventListener(eventName, listener)
		}
	}
}
