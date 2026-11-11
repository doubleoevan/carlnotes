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

// the heading of the updates MCP view. only the news is titled Brews News
export const UPDATES_TITLE = "Brew Updates"

// what a list with no Findings reads as
export const EMPTY_UPDATES_TEXT = "Nothing new worth your time. Carl checked. Twice."

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

// the day's opener on its own, or null without one, as the home's news card reads it
export const updatesOpenerResponse = z.object({ opener: z.string().nullable() })

// a built list as the MCP view reads it, with what its rows need beside it: each Finding's Topic once, and each
// Topic's latest podcast episode the user may listen to, whose chapters put a pill on the Findings that they narrate
const updatesResponse = updates.extend({
	topics: z.array(findingSearchTopic),
	podcastEpisodes: z.array(podcastEpisode),
})

export type UpdatesResponse = z.infer<typeof updatesResponse>
