// the three ways a topic gets shared, and the copied confirmation they share between them

import { useState } from "react"
import { toast } from "sonner"
import { sendCreateTopicInvite, toInviteUrl } from "@/clients/topicClient"
import { COPIED_FEEDBACK_MS, INVITE_LABEL } from "@/components/share/ShareOptions"
import { openShareSheet } from "@/lib/shareSheet"
import { copyWithDocument } from "@/lib/utils"

// what the share menu can do, and the label it shows after a copy lands
export type ShareTopicActions = {
	// the label of whatever was just copied, which the row shows until it clears itself
	copiedLabel: string | null
	copyLink: (label: string, text: string) => Promise<void>
	// the device's own share sheet, for the topic's page and for an invite to it
	shareTopic: () => Promise<void>
	shareInvite: () => Promise<void>
}

/**
 * The actions to send for the share menu. Each one falls back to the clipboard when the device has no sheet to open,
 * A sheet the user actually shared through closes the menu.
 */
export function useShareTopicActions(
	topicId: string,
	topicName: string,
	topicUrl: string,
	onShared: () => void,
): ShareTopicActions {
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)

	// copy a link to the topic to the clipboard and show a confirmation label
	const copyLink = async (label: string, text: string): Promise<void> => {
		let isCopied = true
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			isCopied = copyWithDocument(text)
		}
		// only a copy that landed shows the copied note
		if (isCopied) {
			setCopiedLabel(label)
			setTimeout(() => setCopiedLabel(null), COPIED_FEEDBACK_MS)
		}
	}

	// hand a url to the device's sheet, falling back to the clipboard only where there is no sheet to open
	const openSheet = async (text: string, url: string, copiedAs: string): Promise<void> => {
		const shared = await openShareSheet({ title: topicName, text, url })
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
		shareTopic: () => openSheet(`${topicName} on CarlNotes`, topicUrl, "Copy link"),
		// the invite token is created inside the click. a menu that is never used creates nothing
		shareInvite: async () => {
			// the invite is made first, and a failed create ends in a toast instead of an empty sheet
			let invite: Awaited<ReturnType<typeof sendCreateTopicInvite>>
			try {
				invite = await sendCreateTopicInvite(topicId, "share-sheet")
			} catch (error) {
				console.error("invite create failed", error)
				toast.error("That invite didn't get made. Try again.")
				return
			}
			// the sheet offers the invite url under its own label
			await openSheet(`Join ${topicName} on CarlNotes`, toInviteUrl(invite.token), INVITE_LABEL)
		},
	}
}
