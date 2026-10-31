import { DailyTopicLimitError, uploadTopicAttachment } from "@carlnotes/client/topicClient"
import {
	DAILY_TOPIC_LIMIT_HINTS,
	type SaveTopicOptions,
	saveTopic as saveSharedTopic,
} from "@carlnotes/core/lib/saveTopic"
import type { UseNavigateResult } from "@tanstack/react-router"
import { toast } from "sonner"
import { sendPendingUsernameInvites } from "@/components/invite/InviteEditor"
import { toSeePlansToastAction } from "@/lib/toastActions"

export { MISSING_FIELD_NOTES } from "@carlnotes/core/lib/saveTopic"

/**
 * Saves the shared Topic draft using browser file uploads and feedback.
 */
export function saveTopic(
	options: Omit<SaveTopicOptions<File>, "uploadAttachment" | "sendUsernameInvites" | "onWarning">,
): Promise<string> {
	return saveSharedTopic({
		...options,
		uploadAttachment: uploadTopicAttachment,
		sendUsernameInvites: sendPendingUsernameInvites,
		onWarning: (message) => toast.error(message),
	})
}

/**
 * Shows a toast that tells the user why a topic save failed.
 */
export function showSaveError(error: unknown, navigate: UseNavigateResult<string>): void {
	if (error instanceof DailyTopicLimitError) {
		toast.error(`${error.message}\n ${DAILY_TOPIC_LIMIT_HINTS.purchase}`, {
			action: toSeePlansToastAction(navigate),
		})
		return
	}
	toast.error(error instanceof Error ? error.message : "Save failed. Carl suggests trying again.")
}
