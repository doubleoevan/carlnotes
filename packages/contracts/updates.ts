// the updates list: the unread Findings a signed-in user should read next, trimmed to a reading budget
import { z } from "zod"
import { topicFinding } from "./findings"
import { podcastEpisode } from "./podcast"
import { findingSearchTopic } from "./search"

// the reading budgets a list can hold, in minutes, in the order a menu offers them
export const UPDATES_MINUTES = [5, 15, 30] as const

export type UpdatesMinutes = (typeof UPDATES_MINUTES)[number]

// the budget of a list that names no length
export const DEFAULT_UPDATES_MINUTES: UpdatesMinutes = 15

// the most characters an opener holds
export const UPDATES_OPENER_MAX_CHARS = 280

// the heading of the updates card on the home page and in the MCP view
export const UPDATES_TITLE = "Latest Brews"

// what a list with no Findings reads as
export const EMPTY_UPDATES_TEXT = "Nothing new worth your time. Carl checked. Twice."

// what a list that failed to load reads as
export const UPDATES_FAILED_TEXT = "Carl couldn't get your updates. He'll try again if you ask."

// the updates request body: the reading budget, and the one Topic a scoped list covers
export const updatesPayload = z.object({
	minutes: z.literal(UPDATES_MINUTES).default(DEFAULT_UPDATES_MINUTES),
	topicId: z.string().min(1).max(64).optional(),
})

// a list's Finding, with the Topic it came from and the minutes it takes
const updatesFinding = topicFinding.extend({
	topicId: z.string(),
	topicName: z.string(),
	topicPath: z.string(),
	readingMinutes: z.number(),
})

export type UpdatesFinding = z.infer<typeof updatesFinding>

// a built list: carl's opener, or null without one, the Findings in ranked order, and what did not fit. the more
// path opens the Topics page, or the Topic's page in a scoped list
const updates = z.object({
	opener: z.string().nullable(),
	findings: z.array(updatesFinding),
	moreCount: z.number(),
	morePath: z.string(),
})

export type Updates = z.infer<typeof updates>

// a built list as the site and the app read it, with what its rows need beside it: each Finding's Topic once, and each
// Topic's latest podcast episode the user may listen to, whose chapters put a pill on the Findings that they narrate
export const updatesResponse = updates.extend({
	topics: z.array(findingSearchTopic),
	podcastEpisodes: z.array(podcastEpisode),
})

export type UpdatesResponse = z.infer<typeof updatesResponse>
