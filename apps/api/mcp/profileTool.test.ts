// read_profile: another person and a visitor read a profile as the profile page shows it to them, with every name
// fenced, a visitor names whose profile, the MCP view reads the unfenced page, and a topic-bound server reads no
// profile
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import {
	toPodcastEpisodeFixture,
	toPodcastEpisodeSummaryFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { ProfilePodcastEpisodeCard, ProfileResponse } from "@carlnotes/contracts/profilePage"
import { UNTRUSTED_DATA_TAG } from "@carlnotes/models/prompts/write"
import * as readNews from "../news/readNews"
import * as profiles from "../profiles"
import * as mcpViewData from "./mcpViewData"
import { BOUND_SERVER_TEXT } from "./results"
import { toResultText, toToolHandler, USER, VISITOR } from "./toolTestFixtures"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// what read_profile returns
type ReadProfileResult = {
	username: string
	includesNonPublicTopics: boolean
	topicTable: { items: { name: string; visibility: string }[]; totalCount: number }
}

// another person's profile as a reader who is not that person sees it: one public topic and no other cards
const PUBLIC_PROFILE = {
	userId: "user-2",
	username: "vienna",
	joinedAt: "2026-01-01T00:00:00.000Z",
	subscriberCount: 3,
	includesNonPublicTopics: false,
	isBlocked: false,
	profileTopics: [],
	profileTopicPodcastEpisodeVideos: [],
	profilePodcastEpisodes: [],
	profileTopicPosts: [],
	topics: [{ id: "topic-1", name: "Espresso", visibility: "public", keptCount: 4 }],
	teams: [],
} as unknown as ProfileResponse

// the profile, an empty week of news, and the MCP view's reads of the caller and the news
function stubProfile(): ReturnType<typeof spyOn> {
	spyOn(readNews, "readNews").mockResolvedValue({ newsEvents: [] } as never)
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	spyOn(mcpViewData, "loadMcpViewCardPodcastEpisodes").mockResolvedValue([])
	spyOn(mcpViewData, "loadNewsMcpViewData").mockImplementation(async (_toolCaller, news) => ({
		session: null,
		podcastEpisodes: [],
		news,
	}))
	return spyOn(profiles, "loadProfile").mockResolvedValue(PUBLIC_PROFILE)
}

test("another person reads a profile as the profile page shows it to them, with the names fenced", async () => {
	const loadProfileSpy = stubProfile()
	const toolResult = await toToolHandler("read_profile")({ user_id: "user-2" })
	const readProfileResult = toolResult.structuredContent as ReadProfileResult

	// the reader's id decides what the page shows, and the public topic comes back fenced
	expect(loadProfileSpy).toHaveBeenCalledWith("user-2", "user-1")
	expect(readProfileResult.includesNonPublicTopics).toBe(false)
	expect(readProfileResult.username).toContain(UNTRUSTED_DATA_TAG)
	expect(readProfileResult.topicTable.items).toHaveLength(1)
	expect(readProfileResult.topicTable.items[0]?.name).toContain(UNTRUSTED_DATA_TAG)
})

test("the MCP view reads the unfenced page, its first page of news, and whose profile it is", async () => {
	stubProfile()
	const toolResult = await toToolHandler("read_profile")({ user_id: "user-2" })
	const { profile } = (toolResult._meta?.[MCP_VIEW_META_KEY] ?? {}) as McpViewData
	expect(profile?.profile.username).toBe("vienna")
	expect(profile?.newsPage).toEqual({ newsEvents: [] } as never)
	expect(profile?.isOwnProfile).toBe(false)

	// the caller's own profile is theirs
	const ownToolResult = await toToolHandler("read_profile")({})
	expect(((ownToolResult._meta?.[MCP_VIEW_META_KEY] ?? {}) as McpViewData).profile?.isOwnProfile).toBe(true)
})

test("a visitor reads a named profile as a visitor, and must name one", async () => {
	const loadProfileSpy = stubProfile()
	await toToolHandler("read_profile", VISITOR)({ user_id: "user-2" })
	expect(loadProfileSpy).toHaveBeenCalledWith("user-2", null)

	// with no id there is no profile of their own to read
	const toolResult = await toToolHandler("read_profile", VISITOR)({})
	expect(toolResult.isError).toBe(true)
	expect(loadProfileSpy).toHaveBeenCalledTimes(1)
})

test("a topic-bound server reads no profile", async () => {
	const loadProfileSpy = stubProfile()
	const toolResult = await toToolHandler("read_profile", USER, "topic-1")({})
	expect(toResultText(toolResult)).toBe(BOUND_SERVER_TEXT)
	expect(loadProfileSpy).not.toHaveBeenCalled()
})

// a public topic's podcast episode card on a profile
function toProfilePodcastEpisodeCard(podcastEpisodeId: string): ProfilePodcastEpisodeCard {
	return {
		podcastEpisode: toPodcastEpisodeSummaryFixture({ id: podcastEpisodeId }),
		topic: { id: "topic-1", name: "Espresso", path: "/topics/topic-1/espresso", image: null },
		reactionCount: 0,
		isTopicPublic: true,
		isTopicOwned: true,
	}
}

test("the profile's podcast episodes and films reach the MCP view with play tokens, beside the news's", async () => {
	stubProfile()
	const profileWithCards = {
		...PUBLIC_PROFILE,
		profilePodcastEpisodes: [toProfilePodcastEpisodeCard("episode-1")],
		profileTopicPodcastEpisodeVideos: [toProfilePodcastEpisodeCard("episode-2")],
	} as unknown as ProfileResponse
	spyOn(profiles, "loadProfile").mockResolvedValue(profileWithCards)
	const playablePodcastEpisode = toPodcastEpisodeFixture({ id: "episode-1" })
	const loadSpy = spyOn(mcpViewData, "loadMcpViewCardPodcastEpisodes").mockResolvedValue([playablePodcastEpisode])

	// both cards' podcast episodes load for the caller and play from the view's data
	const toolResult = await toToolHandler("read_profile")({ user_id: "user-2" })
	expect(loadSpy).toHaveBeenCalledWith(USER, [
		...profileWithCards.profilePodcastEpisodes,
		...profileWithCards.profileTopicPodcastEpisodeVideos,
	])
	expect(((toolResult._meta?.[MCP_VIEW_META_KEY] ?? {}) as McpViewData).podcastEpisodes).toEqual([
		playablePodcastEpisode,
	])
})
