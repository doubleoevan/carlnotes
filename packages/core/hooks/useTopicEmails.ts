import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import { useState } from "react"

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
	async function setEmail(topicId: string, isEmailEnabled: boolean): Promise<void> {
		if (pending[topicId]) {
			return
		}
		const previous = choices[topicId]
		setChoices((current) => ({ ...current, [topicId]: isEmailEnabled }))
		setPending((current) => ({ ...current, [topicId]: true }))
		setError(null)
		try {
			await sendSubscriptionEmail(topicId, isEmailEnabled)
		} catch {
			setChoices((current) => ({ ...current, [topicId]: previous }))
			setError("That didn't save. Try again.")
		} finally {
			setPending((current) => ({ ...current, [topicId]: false }))
		}
	}
	return { choices, pending, error, setEmail }
}
