import { createContext, type ReactNode, useCallback, useMemo, useState } from "react"

// the podcast episodes a Topic page's removals hide until the page's next read
export const PodcastEpisodeRemovalContext = createContext({
	hiddenEpisodeIds: new Set<string>(),
	setEpisodeHidden: (_id: string, _isHidden: boolean): void => {},
})

/** Keeps confirmed episodes hidden through stale season reads until the viewer leaves the page. */
export function PodcastEpisodeRemovalProvider({ children }: { children: ReactNode }) {
	const [hiddenEpisodeIds, setHiddenEpisodeIds] = useState(() => new Set<string>())
	const setEpisodeHidden = useCallback((id: string, isHidden: boolean): void => {
		setHiddenEpisodeIds((current) => {
			const next = new Set(current)
			if (isHidden) {
				next.add(id)
			} else {
				next.delete(id)
			}
			return next
		})
	}, [])
	// Polling a Topic leaves removal consumers subscribed to the same value.
	const value = useMemo(() => ({ hiddenEpisodeIds, setEpisodeHidden }), [hiddenEpisodeIds, setEpisodeHidden])
	return <PodcastEpisodeRemovalContext value={value}>{children}</PodcastEpisodeRemovalContext>
}
