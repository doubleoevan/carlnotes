import { useRef, useState } from "react"

/**
 * Serializes page changes and keeps a failed action visible for retry.
 */
export function usePageMutation(onReload?: () => void): {
	isPending: boolean
	error: string | null
	run: (action: () => Promise<unknown>) => Promise<void>
} {
	// block a second press immediately, before React paints the disabled control
	const isRunning = useRef(false)
	const [isPending, setIsPending] = useState(false)
	const [error, setError] = useState<string | null>(null)
	async function run(action: () => Promise<unknown>): Promise<void> {
		if (isRunning.current) {
			return
		}
		// retain the current content while the server applies the action
		isRunning.current = true
		setIsPending(true)
		setError(null)
		try {
			await action()
			onReload?.()
		} catch (error) {
			setError(error instanceof Error ? error.message : "That change didn't save. Try again.")
		} finally {
			isRunning.current = false
			setIsPending(false)
		}
	}
	return { isPending, error, run }
}
