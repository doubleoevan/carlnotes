import { sendDeletePersonalSource } from "@carlnotes/client/personalSourcesClient"
import type { PersonalSource } from "@carlnotes/contracts/personalSources"
import { useRef, useState } from "react"

export type PersonalSourceState = {
	error: string | null
	confirmation: { title: string } | null
	removeSource: () => void
	cancel: () => void
	confirm: () => Promise<void>
}

/**
 * Serializes confirmed Source deletion for the mounted account and Topic.
 */
export function usePersonalSource({
	topicId,
	source,
	onChanged,
}: {
	topicId: string
	source: PersonalSource
	onChanged: () => Promise<void>
}): PersonalSourceState {
	// keep one pending confirmation and mutation per mounted Source
	const [confirmation, setConfirmation] = useState<PersonalSourceState["confirmation"]>(null)
	const [error, setError] = useState<string | null>(null)
	const isMutating = useRef(false)
	const confirm = async (): Promise<void> => {
		if (!confirmation || isMutating.current) {
			return
		}
		isMutating.current = true
		setError(null)
		try {
			await sendDeletePersonalSource({ topicId, sourceId: source.id })
			setConfirmation(null)
			await onChanged()
		} catch {
			setError("Could not delete that content. Refresh and try again.")
		} finally {
			isMutating.current = false
		}
	}
	return {
		error,
		confirmation,
		confirm,
		removeSource: () => setConfirmation({ title: source.label }),
		cancel: () => setConfirmation(null),
	}
}
