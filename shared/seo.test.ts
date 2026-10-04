// the topic slug and path helpers, and the meta description
import { expect, test } from "bun:test"
import {
	isTopicSlugStale,
	toHostWithoutWww,
	toJsonLdText,
	toMetaDescription,
	toPageTitle,
	toPodcastEpisodePath,
	toPodcastFeedPath,
	toTopicFeedPath,
	toTopicPath,
	toTopicSlug,
} from "./seo"

const TOPIC_ID = "60221dfa-df65-44fa-84d4-fbaf10d48e5b"

// a slug is the name as url-safe words, and a topic's path puts it after the id
test("toTopicSlug writes the name as url-safe words", () => {
	expect(toTopicSlug("Speed reading, for insomniacs!")).toBe("speed-reading-for-insomniacs")
	expect(toTopicSlug("Café Ünïcode")).toBe("cafe-unicode")
	expect(toTopicPath({ id: TOPIC_ID, name: "Agents" })).toBe(`/topics/${TOPIC_ID}/agents`)
	expect(toTopicPath({ id: "top_agent_infra", name: "Agent infrastructure" })).toBe(
		"/topics/top_agent_infra/agent-infrastructure",
	)
})

// a name with nothing url-safe in it leaves the path at the id, and a long name is limited
test("toTopicSlug leaves an unusable name without a slug and limits a long one", () => {
	expect(toTopicSlug("!!!")).toBe("")
	expect(toTopicPath({ id: TOPIC_ID, name: "!!!" })).toBe(`/topics/${TOPIC_ID}`)
	expect(toTopicSlug("a".repeat(200))).toBe("a".repeat(60))

	// a slug limited at a separator keeps no dash at the end
	expect(toTopicSlug(`${"a".repeat(59)} tail`)).toBe("a".repeat(59))
})

// a description fits a search result, cut at a word
test("toMetaDescription clips at a word and joins lines", () => {
	expect(toMetaDescription("Short one.\n\nTwo lines.")).toBe("Short one. Two lines.")
	const clippedDescription = toMetaDescription(`${"word ".repeat(50)}end`)
	expect(clippedDescription.length).toBeLessThanOrEqual(160)
	expect(clippedDescription).toMatch(/^(word )+word…$/)

	// a long word with no space to clip at is clipped at the limit
	expect(toMetaDescription("a".repeat(200))).toBe(`${"a".repeat(159)}…`)
})

// a scan summary is markdown, and a description is its plain words
test("toMetaDescription writes markdown as plain words", () => {
	const scanSummary =
		"## This week\n\n- **Agents** ship [a new SDK](https://example.com) with `tools`.\n> A *quiet* week.\n1. Done."
	expect(toMetaDescription(scanSummary)).toBe("This week Agents ship a new SDK with tools. A quiet week. Done.")
	expect(toMetaDescription("5 * 3 = 15, and 2*x stays")).toBe("5 * 3 = 15, and 2*x stays")
})

// a page's title names the page, then the site
test("toPageTitle puts the site's name after the page's", () => {
	expect(toPageTitle("Plans")).toBe("Plans — CarlNotes")
})

// a url is stale without the current slug or with an old one, and a name with no slug needs none
test("isTopicSlugStale compares the url's slug with the name's", () => {
	expect(isTopicSlugStale({ id: TOPIC_ID, name: "Agents" }, "agents")).toBe(false)
	expect(isTopicSlugStale({ id: TOPIC_ID, name: "Agents" }, undefined)).toBe(true)
	expect(isTopicSlugStale({ id: TOPIC_ID, name: "Agents" }, "old-name")).toBe(true)
	expect(isTopicSlugStale({ id: TOPIC_ID, name: "!!!" }, undefined)).toBe(false)
})

// a topic's feed keeps the id-only path whatever the topic's name
test("toTopicFeedPath uses the id alone", () => {
	expect(toTopicFeedPath(TOPIC_ID)).toBe(`/topics/${TOPIC_ID}/feed.xml`)
})

// a topic's podcast feed keeps the id-only path too, and an episode's page path comes after its topic's own path
test("toPodcastFeedPath uses the id alone, and toPodcastEpisodePath adds the season and episode number to the topic's path", () => {
	expect(toPodcastFeedPath(TOPIC_ID)).toBe(`/topics/${TOPIC_ID}/podcast.xml`)
	const podcastEpisodePath = toPodcastEpisodePath(
		{ id: TOPIC_ID, name: "Home Espresso" },
		{ season: 2026, episodeNumber: 3 },
	)
	expect(podcastEpisodePath).toBe(`/topics/${TOPIC_ID}/home-espresso/episodes/2026/3`)
})

// a host reads in lowercase without its www, and a url that does not parse is returned unchanged
test("toHostWithoutWww drops a leading www and returns an unparseable url unchanged", () => {
	expect(toHostWithoutWww("https://www.Example.com/a/b?c=1")).toBe("example.com")
	expect(toHostWithoutWww("https://news.example.com/")).toBe("news.example.com")
	expect(toHostWithoutWww("not a url")).toBe("not a url")
})

// a name that closes a script tag is written with no raw "<", and still parses back to the same name
test("toJsonLdText escapes every < so no name can close the script tag", () => {
	const jsonLdText = toJsonLdText({ name: "</script><b>" })
	expect(jsonLdText).not.toContain("<")
	expect(JSON.parse(jsonLdText)).toEqual({ name: "</script><b>" })
})
