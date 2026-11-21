// the user's own part of a shared page's topic table and topic cards, which a profile's and a team's page read send
// beside the visitors' copy
import { type TopicCard, toReactionCount } from "@carlnotes/contracts/home"
import type { TopicsUserState } from "@carlnotes/contracts/pageUserStates"
import type { Topic } from "@carlnotes/contracts/profiles"
import { toSocialTargetKey } from "@carlnotes/contracts/social"
import { loadReactionSummaries } from "../social/reactionRows"
import { loadTopicOwners } from "./topicOwners"
import { loadTopicsEmailPreferences } from "./topicTableRows"

// the user, whether they are in a user block, and the shared copy's table rows and cards
type LoadTopicsUserStateOptions = {
	userId: string
	isInUserBlock: boolean
	topics: Topic[]
	topicCards: TopicCard[]
}

/**
 * Loads the user's own part of a shared copy's topic table and topic cards: the owning teams the copy leaves unnamed
 * that the user may see named, the user's email switches, and, for a user in a user block, the cards' reaction counts
 * without the people in one with them.
 */
export async function loadTopicsUserState({
	userId,
	isInUserBlock,
	topics,
	topicCards,
}: LoadTopicsUserStateOptions): Promise<TopicsUserState> {
	// the topics whose owning team the copy leaves unnamed, which only a private team's members see named
	const unnamedTeamTopicIds = [
		...new Set([
			...topics.filter((topic) => topic.team === null).map((topic) => topic.id),
			...topicCards.filter((topicCard) => topicCard.teamLink === null).map((topicCard) => topicCard.id),
		]),
	]
	const topicIds = [...new Set([...topics.map((topic) => topic.id), ...topicCards.map((topicCard) => topicCard.id)])]

	// the owning teams the user sees named, the email switches, and the cards' reactions as the user sees them
	const [topicOwners, isEmailEnabledByTopic, reactionSummaries] = await Promise.all([
		loadTopicOwners(unnamedTeamTopicIds, userId),
		loadTopicsEmailPreferences(userId, topicIds),
		isInUserBlock
			? loadReactionSummaries({
					userId,
					targets: topicCards.map((topicCard) => ({ kind: "topic" as const, id: topicCard.id })),
				})
			: null,
	])
	return {
		teamByTopicId: Object.fromEntries(
			[...topicOwners].flatMap(([topicId, topicOwner]) => (topicOwner.team ? [[topicId, topicOwner.team]] : [])),
		),
		isEmailEnabledByTopicId: Object.fromEntries(isEmailEnabledByTopic),
		reactionCountByTopicId: reactionSummaries
			? Object.fromEntries(
					topicCards.map((topicCard) => {
						const reactionSummary = reactionSummaries.get(toSocialTargetKey({ kind: "topic", id: topicCard.id }))
						return [topicCard.id, reactionSummary ? toReactionCount(reactionSummary) : 0]
					}),
				)
			: null,
	}
}
