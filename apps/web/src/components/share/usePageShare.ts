// sharing a page's url from a Share dialog: the copy with its confirmation, the device's share sheet that falls back to
// the copy, and the report of each option by its channel
import { useCopyFeedback } from "@carlnotes/core/hooks/useCopyFeedback"
import { useIsMounted } from "@/hooks/useBrowserValue"
import { canOpenShareSheet, openShareSheet } from "@/lib/shareSheet"
import { copyToClipboard } from "@/lib/utils"
import { COPY_PAGE_LABEL } from "./ShareOptions"

// the page's title, its absolute url, and the report of an option by its channel
type UsePageShareOptions = {
	title: string
	url: string
	onShareOptionClick: (channel: string) => void
}

// the page's title, url, and report, the label just copied, whether a share sheet can open, and each option's handler
type PageShare = UsePageShareOptions & {
	copiedLabel: string | null
	isShareSheetAvailable: boolean
	copyLink: (label: string, text: string) => Promise<void>
	sharePage: () => Promise<void>
}

/**
 * Returns a Share dialog's copy and share sheet for one page's url.
 */
export function usePageShare({ title, url, onShareOptionClick }: UsePageShareOptions): PageShare {
	const { copiedLabel, markCopied } = useCopyFeedback()
	// whether this browser can open a share sheet, false until the component mounts in the browser
	const isShareSheetAvailable = useIsMounted() && canOpenShareSheet()

	// copy a link to the clipboard and show a confirmation label
	async function copyLink(label: string, linkText: string): Promise<void> {
		onShareOptionClick("copy-link")
		if (await copyToClipboard(linkText)) {
			markCopied(label)
		}
	}

	// pass the page's url to the device's sheet. a rejected gesture falls back to the clipboard copy
	async function sharePage(): Promise<void> {
		onShareOptionClick("share-sheet")
		if ((await openShareSheet({ title, text: `${title} on CarlNotes`, url })) === "unavailable") {
			await copyLink(COPY_PAGE_LABEL, url)
		}
	}
	return { title, url, onShareOptionClick, copiedLabel, isShareSheetAvailable, copyLink, sharePage }
}
