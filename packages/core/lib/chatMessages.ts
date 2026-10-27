/**
 * Formats the label for how long ago a chat turn finished, from "just now" through minutes, hours, and days.
 */
export function toTimeAgoLabel(at: number, now: number): string {
	// under a minute reads as just now, then minutes take over
	const elapsedMs = Math.max(0, now - at)
	const minutes = Math.floor(elapsedMs / 60_000)
	if (minutes < 1) {
		return "just now"
	}
	if (minutes < 60) {
		return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`
	}

	// hours label the rest of the day, then days
	const hours = Math.floor(minutes / 60)
	if (hours < 24) {
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`
	}
	const days = Math.floor(hours / 24)
	return days === 1 ? "1 day ago" : `${days} days ago`
}
