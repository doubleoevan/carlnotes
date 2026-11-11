// what a rank dialog ranks and says: its rows, the moves its save sends, and its words for the home's pins and for a
// profile's

import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"

// one row in the working order: the topic, film, podcast episode, or Topic Post and its label
export type RankedItem = { id: string; label: string }

/**
 * Returns a Topic Post as a rank dialog's row, named by its title and its Topic.
 */
export function toTopicPostRankedItem({
	id,
	title,
	topicName,
}: Pick<TopicPostCard, "id" | "title" | "topicName">): RankedItem {
	return { id, label: toDotSeparatedText([title, topicName]) }
}

// one move the save sends: a position, or zero to clear
export type PinnedOrderMove = { id: string; position: number }

// what a rank dialog ranks
export type RankedNoun = "topics" | "films" | "podcasts" | "posts"

// the words one rank dialog shows
export type RankDialogLabels = {
	title: string
	emptyText: string
	// the picker that adds a row, which a dialog with no row to add never shows
	addLabel: string
	removeConfirmTitle: string
	toRemoveLabel: (itemLabel: string) => string
	toRemoveConfirmText: (itemLabel: string) => string
}

/**
 * Returns the words of the admin's rank dialog for the home's pinned topics, films, podcast episodes, or Topic Posts.
 */
export function toHomeRankDialogLabels(noun: RankedNoun): RankDialogLabels {
	return {
		title: `Home ${noun}`,
		emptyText: `No home ${noun}.`,
		addLabel: toAddLabel(noun),
		removeConfirmTitle: `Remove from home ${noun}?`,
		toRemoveLabel: (itemLabel) => `Remove ${itemLabel} from the home ${noun}`,
		toRemoveConfirmText: (itemLabel) => `${itemLabel} will leave the home ${noun}.`,
	}
}

/**
 * Returns the words of a person's rank dialog for the topics, films, podcast episodes, or Topic Posts pinned to their
 * own profile.
 */
export function toProfileRankDialogLabels(noun: RankedNoun): RankDialogLabels {
	return {
		title: `Featured ${noun}`,
		emptyText: `No featured ${noun} yet.`,
		addLabel: toAddLabel(noun),
		removeConfirmTitle: `Remove from featured ${noun}?`,
		toRemoveLabel: (itemLabel) => `Remove ${itemLabel} from your featured ${noun}`,
		toRemoveConfirmText: (itemLabel) => `${itemLabel} will leave your featured ${noun}.`,
	}
}

// the label of the picker that adds a row
function toAddLabel(noun: RankedNoun): string {
	return `Add a ${noun.slice(0, -1)}`
}

// the action menu options that open the admin's rank dialogs for the home's pins
export const HOME_RANK_OPTION_LABELS: Record<RankedNoun, string> = {
	topics: "Home topics",
	films: "Home films",
	podcasts: "Home podcasts",
	posts: "Home posts",
}

// the action menu options that open a person's rank dialogs for their own profile's pins
export const PROFILE_RANK_OPTION_LABELS: Record<RankedNoun, string> = {
	topics: "Featured topics",
	films: "Featured films",
	podcasts: "Featured podcasts",
	posts: "Featured posts",
}
