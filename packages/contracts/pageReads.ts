// the page reads: one read per page that holds the page's head and everything its first screen shows
import { z } from "zod"
import { cardsPageQuery, optionalCardsPageNumber, pagedQuery } from "./cardPages"
import { dashboardResponse } from "./dashboards"
import { newsResponse } from "./news"
import { pageHead } from "./pageHead"
import { profileUserState, topicPostUserState } from "./pageUserStates"
import { podcastEpisodePageResponse } from "./podcastEpisodePage"
import { profileResponse } from "./profilePage"
import { profileQuery } from "./profiles"
import { topicPostResponse } from "./topicPosts"
import { topicGateResponse, topicResponse } from "./topics"

// a profile's page read: the head, the profile, the first page of the week's news, null if the news read failed, and
// the user state for a signed-in reader who shares the visitors' copy, null for anyone else
export const profilePageRead = z.object({
	head: pageHead,
	profile: profileResponse,
	news: newsResponse.nullable(),
	userState: profileUserState.nullable(),
})

export type ProfilePageRead = z.infer<typeof profilePageRead>

// a profile page read's query: the audience an admin reads someone else's profile as, and whether the read pages the
// person's Topic Posts, with the zero-based page it holds
export const profilePageReadQuery = profileQuery.extend({
	...pagedQuery.shape,
	topicPostsPage: optionalCardsPageNumber,
})

// the query of one later page of a person's Topic Posts, in the audience the profile is read as
export const profileTopicPostsQuery = profileQuery.extend(cardsPageQuery.shape)

// a topic's page read: the head, and the page if the reader may open the topic, or the gate of an invite topic. a
// private topic's read holds its head alone
export const topicPageRead = z.object({
	head: pageHead,
	topic: topicResponse.nullable(),
	topicGate: topicGateResponse.nullable(),
})

export type TopicPageRead = z.infer<typeof topicPageRead>

// a podcast episode's page read: the head, and the page if the reader may listen to the podcast episode, or the gate
// of its invite topic. a private topic's podcast episode has its head alone
export const podcastEpisodePageRead = z.object({
	head: pageHead,
	podcastEpisodePage: podcastEpisodePageResponse.nullable(),
	topicGate: topicGateResponse.nullable(),
})

export type PodcastEpisodePageRead = z.infer<typeof podcastEpisodePageRead>

// a Topic Post's page read: the head of a published post, null for a draft, the post if the reader may read it, null
// for a post of a topic the reader may not open, and the user state for a signed-in reader who shares the
// visitors' copy, null for anyone else
export const topicPostPageRead = z.object({
	head: pageHead.nullable(),
	topicPost: topicPostResponse.nullable(),
	userState: topicPostUserState.nullable(),
})

export type TopicPostPageRead = z.infer<typeof topicPostPageRead>

// the part of a Dashboard page that is the user's own: whether they read the full snapshot
const dashboardUserState = z.object({ hasFullAccess: z.boolean() })

export type DashboardUserState = z.infer<typeof dashboardUserState>

// a Dashboard's page read: the head, and the default selection's snapshot with its series at the reader's access, and
// the user state, null for a visitor
export const dashboardPageRead = z.object({
	head: pageHead,
	dashboard: dashboardResponse,
	userState: dashboardUserState.nullable(),
})

export type DashboardPageRead = z.infer<typeof dashboardPageRead>
