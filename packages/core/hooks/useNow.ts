import { useEffect, useState } from "react"

// a minute, which is as fine as any relative time label this app writes ever gets
const CLOCK_TICK_MS = 60_000

/**
 * The current time, re-read on a tick, for relative labels that would otherwise go stale on screen.
 * One clock per list instead of one per row, so a quiet transcript re-renders once a minute at most.
 */
export function useNow(tickMs: number = CLOCK_TICK_MS): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), tickMs)
		return () => clearInterval(interval)
	}, [tickMs])
	return now
}
