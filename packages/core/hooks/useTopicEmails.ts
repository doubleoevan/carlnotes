import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import { useState } from "react"
import { SAVE_FAILED_TEXT } from "../lib/sessionCopy"

/**
 * Keeps topic email choices responsive and rolls failed writes back on both platforms.
 */
export function useTopicEmails(): {
	choices: Record<string, boolean | undefined>
	pending: Record<string, boolean | undefined>
	error: string | null
	setEmail: (topicId: string, isEmailEnabled: boolean) => Promise<void>
} {
	// track each topic independently so one slow write does not block another row
	const [choices, setChoices] = useState<Record<string, boolean | undefined>>({})
	const [pending, setPending] = useState<Record<string, boolean | undefined>>({})
	const [error, setError] = useState<string | null>(null)

	// save one topic's choice, shown at once and rolled back if the save is rejected
	async function setEmail(topicId: string, isEmailEnabled: boolean): Promise<void> {
		if (pending[topicId]) {
			return
		}

		// show the choice at once
		const previous = choices[topicId]
		setChoices((current) => ({ ...current, [topicId]: isEmailEnabled }))
		setPending((current) => ({ ...current, [topicId]: true }))
		setError(null)

		// save it
		try {
			await sendSubscriptionEmail(topicId, isEmailEnabled)
		} catch {
			// roll the choice back and name the failure
			setChoices((current) => ({ ...current, [topicId]: previous }))
			setError(SAVE_FAILED_TEXT)
		} finally {
			setPending((current) => ({ ...current, [topicId]: false }))
		}
	}
	return { choices, pending, error, setEmail }
}
