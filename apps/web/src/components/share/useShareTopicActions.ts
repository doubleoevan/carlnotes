// the three ways a topic or a Topic Post gets shared, and the copied confirmation they share between them

import { sendCreateTopicInvite } from "@carlnotes/client/topicClient"
import { useCopyFeedback } from "@carlnotes/core/hooks/useCopyFeedback"
import { toast } from "sonner"
import { toInviteUrl } from "@/lib/inviteUrl"
import { canOpenShareSheet, openShareSheet } from "@/lib/shareSheet"
import { copyToClipboard } from "@/lib/utils"
import { COPY_PAGE_LABEL, INVITE_LABEL } from "./ShareOptions"

// what the share menu can do, and the label it shows after a copy lands
export type ShareTopicActions = {
	// the label of whatever was just copied, which the row shows until it clears itself
	copiedLabel: string | null
	copyLink: (label: string, text: string) => Promise<void>
	// the device's own share sheet, for the shared page and for an invite to it
	shareTopic: () => Promise<void>
	shareInvite: () => Promise<void>
}

// the topic, the Topic Post shared in its place, if any, the shared page's name and url, and what a finished share does
type UseShareTopicActionsOptions = {
	topicId: string
	topicPostId?: string
	sharedName: string
	sharedUrl: string
	onShared: () => void
}

/**
 * The actions to send for the share menu. Each one falls back to the clipboard when the device has no sheet to open,
 * A sheet the user actually shared through closes the menu.
 */
export function useShareTopicActions({
	topicId,
	topicPostId,
	sharedName,
	sharedUrl,
	onShared,
}: UseShareTopicActionsOptions): ShareTopicActions {
	const { copiedLabel, markCopied } = useCopyFeedback()

	// copy a link to the clipboard and show a confirmation label
	const copyLink = async (label: string, text: string): Promise<void> => {
		if (await copyToClipboard(text)) {
			markCopied(label)
		}
	}

	// hand a url to the device's sheet, falling back to the clipboard only where there is no sheet to open.
	// the invite option is offered everywhere now, so a sheet only opens where one is worth offering
	const openSheet = async (text: string, url: string, copiedAs: string): Promise<void> => {
		const shared = canOpenShareSheet() ? await openShareSheet({ title: sharedName, text, url }) : "unavailable"
		if (shared === "unavailable") {
			await copyLink(copiedAs, url)
			return
		}
		// a dismissed sheet is a decision. only a shared one counts as done
		if (shared === "shared") {
			onShared()
		}
	}

	return {
		copiedLabel,
		copyLink,
		shareTopic: () => openSheet(`${sharedName} on CarlNotes`, sharedUrl, COPY_PAGE_LABEL),
		// the invite token is created inside the click. a menu that is never used creates nothing
		shareInvite: async () => {
			// the invite is made first, and a failed create attempt ends in a toast instead of an empty sheet
			let inviteResult: Awaited<ReturnType<typeof sendCreateTopicInvite>>
			try {
				inviteResult = await sendCreateTopicInvite(topicId, "share-sheet", topicPostId)
			} catch (error) {
				console.error("invite create failed", error)
				toast.error("That invite didn't get made. Try again.")
				return
			}
			// a day at the invite limit ends in a toast too
			if (inviteResult === "limited") {
				toast.error("Daily invite limit reached. It resets tomorrow.")
				return
			}
			// the sheet offers the invite url under its own label. a post's invite follows its topic and opens the post
			const inviteVerb = topicPostId ? "Read" : "Join"
			await openSheet(`${inviteVerb} ${sharedName} on CarlNotes`, toInviteUrl(inviteResult.token), INVITE_LABEL)
		},
	}
}
