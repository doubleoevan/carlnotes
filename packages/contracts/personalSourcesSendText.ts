// text-only MCP clients and the Topic card read the same bounded confirmation
import { PERSONAL_SOURCES_DAILY_LIMIT_MESSAGE, type PersonalSourcesSendResult } from "./personalSources"

/**
 * Describes a send outcome without returning its summary, links, or private chat reference.
 */
export function toPersonalSourcesSendText(result: PersonalSourcesSendResult): string {
	switch (result.status) {
		case "accepted":
			return (result.confirmations ?? [result])
				.map(
					(confirmation) =>
						`Saved “${result.title}” to ${confirmation.topic.name}. ${confirmation.queuedLinkCount} distinct links are waiting for a Scan. ${confirmation.topic.url}`,
				)
				.join("\n")
		case "quota":
			return `${PERSONAL_SOURCES_DAILY_LIMIT_MESSAGE} It resets at ${result.resetAt}. Nothing was saved.`
		case "disconnected":
			return "Reconnect this app to CarlNotes, or use an active Premium API key. Nothing was saved."
		case "not_found":
			return "No eligible Topic has that id on this connection. Nothing was saved."
		case "unavailable":
			return "Personal sources receiving is temporarily unavailable. Nothing was saved."
		case "conflict":
			return toConflictText(result.reason)
	}
}

// a retry never restores deleted content or silently chooses a different destination
function toConflictText(reason: "retry_mismatch" | "removed"): string {
	switch (reason) {
		case "retry_mismatch":
			return "This request id already identifies different content. Nothing was saved."
		case "removed":
			return "The entry for this request id was deleted. It was not restored."
	}
}
