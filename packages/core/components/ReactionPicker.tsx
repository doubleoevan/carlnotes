import { reactionTypes } from "@carlnotes/contracts/enums"
import { REACTION_TYPE_LABELS, type ReactionSummary, type ReactionType } from "@carlnotes/contracts/social"
import type { SocialElements } from "../lib/socialElements"
import { toMoreReactionUsersLabel } from "../lib/socialLabels"

// the counts to show, the type the user chose, and what a press does
export type ReactionPickerProps = {
	counts: ReactionSummary["counts"]
	ownReactionType: ReactionType | null
	isDisabled: boolean
	onPick: (reactionType: ReactionType) => void
	elements: Pick<SocialElements, "ReactionGroup" | "ReactionOption">
}

/**
 * Shares the reaction picker between the web, the mobile app, and the MCP view: the six types in one order, each
 * with how many chose it and who, and the user's own marked.
 */
export function ReactionPicker({
	counts,
	ownReactionType,
	isDisabled,
	onPick,
	elements: { ReactionGroup, ReactionOption },
}: ReactionPickerProps) {
	const countsByType = new Map(counts.map((reactionCount) => [reactionCount.reactionType, reactionCount]))
	return (
		<ReactionGroup>
			{reactionTypes.map((reactionType) => {
				// the type's count, its named users, and how many it leaves out
				const { count = 0, users = [] } = countsByType.get(reactionType) ?? {}
				const moreUserCount = count - users.length
				return (
					<ReactionOption
						key={reactionType}
						reactionType={reactionType}
						label={REACTION_TYPE_LABELS[reactionType]}
						count={count}
						users={users}
						moreUsersLabel={users.length > 0 && moreUserCount > 0 ? toMoreReactionUsersLabel(moreUserCount) : null}
						isOwn={ownReactionType === reactionType}
						isDisabled={isDisabled}
						onPress={() => onPick(reactionType)}
					/>
				)
			})}
		</ReactionGroup>
	)
}
