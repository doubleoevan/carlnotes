import {
	fetchReactionSummary,
	type ReactionWriteResult,
	saveReaction as saveReactionRequest,
} from "@carlnotes/client/socialClient"
import {
	EMPTY_REACTION_SUMMARY,
	type ReactionSummary,
	type ReactionType,
	type SocialTarget,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import { useEffect, useState } from "react"

// how a platform reaches the reaction routes. the web and the mobile app call the api, and the MCP view calls a tool,
// which has no read of a summary
export type ReactionClient = {
	save: (target: SocialTarget, reactionType: ReactionType | null) => Promise<ReactionWriteResult>
	fetchSummary?: (target: SocialTarget) => Promise<ReactionSummary>
}

// the api's reaction routes
const API_REACTION_CLIENT: ReactionClient = {
	save: (target, reactionType) => saveReactionRequest({ target, reactionType }),
	fetchSummary: fetchReactionSummary,
}

// a social target's reactions as its row shows them, and the save that changes the user's own
export type ReactionsState = {
	summary: ReactionSummary
	save: (reactionType: ReactionType | null) => Promise<ReactionWriteResult>
}

// the social target, the summary a read came with, the client, and a listener for a changed summary
type UseReactionsOptions = {
	target: SocialTarget
	summary: ReactionSummary | undefined
	client?: ReactionClient
	onSummaryChange?: (summary: ReactionSummary) => void
}

/**
 * Holds one social target's reactions: the summary its page came with, and the save that replaces the summary with
 * the one the write returned.
 */
export function useReactions({
	target,
	summary: loadedSummary,
	client = API_REACTION_CLIENT,
	onSummaryChange,
}: UseReactionsOptions): ReactionsState {
	const [summary, setSummary] = useState(loadedSummary ?? EMPTY_REACTION_SUMMARY)

	// a new read of the page, or another social target, starts from its own summary
	const targetKey = toSocialTargetKey(target)
	const { fetchSummary } = client
	// biome-ignore lint/correctness/useExhaustiveDependencies: the target's key stands for the target
	useEffect(() => {
		setSummary(loadedSummary ?? EMPTY_REACTION_SUMMARY)
		if (loadedSummary || !fetchSummary) {
			return
		}

		// a list whose read came without the summary reads it, and a failed read leaves the row empty
		let isCurrent = true
		void fetchSummary(target)
			.then((fetchedSummary) => isCurrent && setSummary(fetchedSummary))
			.catch(() => {})
		return () => {
			isCurrent = false
		}
	}, [targetKey, loadedSummary, fetchSummary])

	// save the user's own reaction, or remove it with no type, and keep the summary the write returned
	async function save(reactionType: ReactionType | null): Promise<ReactionWriteResult> {
		const reactionWriteResult = await client.save(target, reactionType)
		if (reactionWriteResult.status === "saved") {
			setSummary(reactionWriteResult.summary)
			onSummaryChange?.(reactionWriteResult.summary)
		}
		return reactionWriteResult
	}

	// the summary and its save
	return { summary, save }
}
