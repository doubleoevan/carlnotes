import type { ReactionSummary, ReactionType, SocialTarget } from "@carlnotes/contracts/social"
import { useRef, useState } from "react"
import { type ReactionClient, useReactions } from "../hooks/useReactions"
import type { SocialElements } from "../lib/socialElements"
import { REACTION_SAVE_ERROR } from "../lib/socialLabels"
import { ReactionPicker } from "./ReactionPicker"

// what the row hangs on, the summary its page came with, and how each platform signs in and shows an error
export type ReactionRowProps = {
	target: SocialTarget
	summary: ReactionSummary | undefined
	isSignedIn: boolean
	// opens sign-up for a visitor who presses a type
	onSignIn: () => void
	onError: (message: string) => void
	// a changed summary, for a page that caches it
	onSummaryChange?: (summary: ReactionSummary) => void
	// how the platform reaches the reaction routes. the api by default
	client?: ReactionClient
	elements: Pick<SocialElements, "ReactionGroup" | "ReactionOption">
}

// what each app's adapter of the row takes
export type ReactionRowAdapterProps = Pick<ReactionRowProps, "target" | "summary" | "isSignedIn" | "onSummaryChange">

/**
 * Shares the reaction row between the web, the mobile app, and the MCP view: the six types with their counts and the
 * user's own marked. A press on a type sets it, and a press on the user's own type takes it back.
 */
export function ReactionRow({
	target,
	summary: loadedSummary,
	isSignedIn,
	onSignIn,
	onError,
	onSummaryChange,
	client,
	elements,
}: ReactionRowProps) {
	const { summary, save } = useReactions({ target, summary: loadedSummary, client, onSummaryChange })

	// one save at a time. the type in flight shows at once, and undefined means no save is in flight
	const [pendingReactionType, setPendingReactionType] = useState<ReactionType | null>()
	const isSavingRef = useRef(false)

	// a press on a type sets it, and a press on the user's own type takes it back. a visitor's press opens sign-up
	async function handlePick(reactionType: ReactionType): Promise<void> {
		if (!isSignedIn) {
			onSignIn()
			return
		}
		if (isSavingRef.current) {
			return
		}

		// show the press, save it, and say why if nothing changed. a client's save may throw an error
		const pickedReactionType = summary.ownReactionType === reactionType ? null : reactionType
		isSavingRef.current = true
		setPendingReactionType(pickedReactionType)
		const reactionWriteResult = await save(pickedReactionType).catch(() => ({
			status: "failed" as const,
			message: null,
		}))
		isSavingRef.current = false
		setPendingReactionType(undefined)
		if (reactionWriteResult.status === "failed") {
			onError(reactionWriteResult.message ?? REACTION_SAVE_ERROR)
		}
	}
	return (
		<ReactionPicker
			counts={summary.counts}
			ownReactionType={pendingReactionType === undefined ? summary.ownReactionType : pendingReactionType}
			isDisabled={pendingReactionType !== undefined}
			onPick={(reactionType) => void handlePick(reactionType)}
			elements={elements}
		/>
	)
}
