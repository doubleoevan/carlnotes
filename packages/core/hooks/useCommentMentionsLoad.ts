import { useEffect } from "react"
import { loadCommentMentions, setCommentMentions } from "../stores/commentMentionStore"

/**
 * Reads the signed-in user's unseen Comment Mentions as each page or screen loads, and never on a timer. A visitor,
 * and an account that signed out, holds none.
 */
export function useCommentMentionsLoad(userId: string | null | undefined, pageKey: string): void {
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page's key is why the read runs again
	useEffect(() => {
		if (!userId) {
			setCommentMentions([])
			return
		}
		void loadCommentMentions()
	}, [userId, pageKey])
}
