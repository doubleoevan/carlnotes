// what a push notification says: a Scan push counts the Scan's new Findings and names the first, and a chat mention
// push names who mentioned or replied

// the most characters of the first Finding's title that a Scan push quotes, far inside the 4096-byte payload limit
const FINDING_TITLE_MAX_CHARS = 120

/**
 * Returns a Scan push's body: the count of new Findings, and the first one's title clipped at a word if it is long.
 */
export function toScanPushBody(findingCount: number, firstFindingTitle: string | null): string {
	// the count, with the first title quoted if it has one
	const findingCountText = `${findingCount} new finding${findingCount === 1 ? "" : "s"}`
	const shownTitle = firstFindingTitle?.trim() ? clipAtWord(firstFindingTitle.trim(), FINDING_TITLE_MAX_CHARS) : null
	if (!shownTitle) {
		return findingCountText
	}

	// a single Finding is the title itself, and several start with it
	return findingCount === 1 ? `${findingCountText}: “${shownTitle}”` : `${findingCountText}, including “${shownTitle}”`
}

/**
 * Returns a chat mention push's body: the sender, and whether they mentioned the recipient or replied to them.
 */
export function toChatMentionPushBody(authorUsername: string, isReply: boolean): string {
	return `${authorUsername} ${isReply ? "replied to you" : "mentioned you"}`
}

// a text cut at the last word that fits, with an ellipsis, or the text whole if it fits
function clipAtWord(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text
	}

	// the last space inside the limit ends the cut, or the limit itself for one long word
	const lastSpaceIndex = text.lastIndexOf(" ", maxChars - 1)
	const cutIndex = lastSpaceIndex > 0 ? lastSpaceIndex : maxChars - 1
	return `${text.slice(0, cutIndex).trimEnd()}…`
}
