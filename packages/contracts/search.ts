// the search bar contracts: each result type and the query limits
import type { ProfileIdentity } from "./profiles"
import type { TeamIdentity } from "./teams"

// a user profile search result
export type UserSearchResult = ProfileIdentity

// a public team the search bar found, in the shape its avatar and link both read
export type TeamSearchResult = TeamIdentity

// a topic the search bar found, in the shape its link reads
export type TopicSearchResult = { id: string; name: string }

// a podcast episode the search bar found: its title and its topic's name, and the path of its page
export type PodcastEpisodeSearchResult = { id: string; title: string; topicName: string; pagePath: string }

// how long a query must be before it can search users, teams, or topics, and how many user matches can be returned
export const SEARCH_MIN_CHARS = 2

export const USER_SEARCH_LIMIT = 5
