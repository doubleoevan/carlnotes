// podcast feed tests: the feed's tags, its guids across a rename, a listener's blocked feed, the chapters file,
// and the transcript
import { expect, test } from "bun:test"
import type { PodcastEpisodeScript } from "@shared/contracts"
import {
	PODCAST_THEME_SONG,
	PODCAST_THEME_SONG_DRUMMING_CREDIT,
	PODCAST_THEME_SONG_HEADING,
	PODCAST_THEME_SONG_PERFORMANCE_CREDIT,
	PODCAST_THEME_SONG_PRODUCTION_CREDIT,
	PODCAST_THEME_SONG_WRITING_CREDIT,
} from "@shared/podcastEpisodes"
import { toXmlText } from "./feed"
import {
	type ToPodcastFeedXmlOptions,
	toPodcastEpisodeChaptersJson,
	toPodcastFeedXml,
	toTranscriptHtml,
} from "./podcastFeed"

// the cover urls in a feed are signed with the app's auth secret
Bun.env.BETTER_AUTH_SECRET ??= "podcast-feed-test-secret"

// a public topic's feed with one podcast episode
const podcastFeed: ToPodcastFeedXmlOptions = {
	appUrl: "https://carlnotes.example.com",
	topic: { id: "topic-1", name: "Home <espresso>", prompt: "Gear & technique.", visibility: "public" },
	feedUrl: "https://carlnotes.example.com/topics/topic-1/podcast.xml",
	podcastEpisodeFilesBaseUrl: "https://carlnotes.example.com/api/episodes",
	isBlockedFromPodcastDirectories: false,
	podcastEpisodes: [
		{
			id: "episode-1",
			title: "A quieter grinder",
			description: "A quieter burr set.",
			season: 2026,
			episodeNumber: 14,
			durationSeconds: 440,
			audioByteSize: 3_520_000,
			publishedAt: new Date("2026-10-01T09:00:00Z"),
		},
	],
}

test("the channel has the tags a podcast app requires, with the show's cover and both hosts", () => {
	const feedXml = toPodcastFeedXml(podcastFeed)

	// the namespaces, the title, and the escaped topic text, which ends with the theme song's credits and its link
	const themeSongCredit = `${PODCAST_THEME_SONG_HEADING}: ${PODCAST_THEME_SONG.youtubeUrl}. ${PODCAST_THEME_SONG_WRITING_CREDIT}. ${PODCAST_THEME_SONG_PERFORMANCE_CREDIT}. ${PODCAST_THEME_SONG_PRODUCTION_CREDIT}. ${PODCAST_THEME_SONG_DRUMMING_CREDIT}.`
	expect(feedXml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')
	expect(feedXml).toContain('xmlns:podcast="https://podcastindex.org/namespace/1.0"')
	expect(feedXml).toContain("<title>Home &lt;espresso&gt;: Coffee Break podcast with Carl and Vienna</title>")
	expect(feedXml).toContain(
		`<description>${toXmlText(`Gear & technique. Carl and Vienna are AI voices. ${themeSongCredit}`)}</description>`,
	)

	// what Apple requires of a channel, and the Podcasting 2.0 tags
	expect(feedXml).toContain("<language>en</language>")
	expect(feedXml).toContain('<itunes:category text="News"/>')
	expect(feedXml).toContain("<itunes:explicit>false</itunes:explicit>")
	expect(feedXml).toMatch(
		/<itunes:image href="https:\/\/carlnotes\.example\.com\/api\/podcast-covers\/show\/topic-1\/[0-9a-f]{32}-3000\.jpg"\/>/,
	)
	expect(feedXml).toMatch(/<podcast:guid>[0-9a-f-]{36}<\/podcast:guid>/)
	expect(feedXml).toContain('<podcast:person role="host">Vienna</podcast:person>')
	expect(feedXml).not.toContain("itunes:block")
})

test("an item names its season, episode number, enclosure, cover, chapters, and transcript, and says the voices are AI", () => {
	// the feed, and the base url of its podcast episode's files
	const feedXml = toPodcastFeedXml(podcastFeed)
	const podcastEpisodeFilesUrl = "https://carlnotes.example.com/api/episodes/episode-1"

	// the stable enclosure with its length and type, then the season, the episode number, the duration, and the publish date
	expect(feedXml).toContain(`<enclosure url="${podcastEpisodeFilesUrl}/audio.mp3" length="3520000" type="audio/mpeg"/>`)
	expect(feedXml).toContain("<itunes:season>2026</itunes:season>")
	expect(feedXml).toContain("<itunes:episode>14</itunes:episode>")
	expect(feedXml).toContain("<itunes:duration>440</itunes:duration>")
	expect(feedXml).toContain("<pubDate>Thu, 01 Oct 2026 09:00:00 GMT</pubDate>")

	// the episode's own cover, its page, and its Podcasting 2.0 files
	expect(feedXml).toMatch(/<itunes:image href="[^"]*\/podcast-covers\/episode\/episode-1\/[0-9a-f]{32}-3000\.jpg"\/>/)
	expect(feedXml).toContain("<link>https://carlnotes.example.com/topics/topic-1/home-espresso/episodes/2026/14</link>")
	expect(feedXml).toContain(
		`<podcast:chapters url="${podcastEpisodeFilesUrl}/chapters.json" type="application/json+chapters"/>`,
	)
	expect(feedXml).toContain(`<podcast:transcript url="${podcastEpisodeFilesUrl}/transcript.html" type="text/html"/>`)
	expect(feedXml).toContain("<description>A quieter burr set. Carl and Vienna are AI voices.</description>")
})

test("a rename keeps every guid, and gives the show a new cover url", () => {
	// the same feed after its topic is renamed, and how the guids and the show's cover are read out of a feed
	const renamedFeed = { ...podcastFeed, topic: { ...podcastFeed.topic, name: "Espresso at home" } }
	const toGuids = (feedXml: string): string[] => feedXml.match(/<(podcast:)?guid[^>]*>[^<]+</g) ?? []
	const toShowCover = (feedXml: string): string | undefined => feedXml.match(/podcast-covers\/show\/[^"]+/)?.[0]

	// the feed's guid and the item's guid are both unchanged, and the show's cover url is new
	expect(toGuids(toPodcastFeedXml(renamedFeed))).toEqual(toGuids(toPodcastFeedXml(podcastFeed)))
	expect(toGuids(toPodcastFeedXml(podcastFeed))).toContain('<guid isPermaLink="false">episode-1<')
	expect(toShowCover(toPodcastFeedXml(renamedFeed))).not.toBe(toShowCover(toPodcastFeedXml(podcastFeed)))
})

test("a listener's own feed is blocked from directories and links the topic page at the episode", () => {
	// an invite topic's feed at a path after a listener's token
	const listenerFeed: ToPodcastFeedXmlOptions = {
		...podcastFeed,
		topic: { ...podcastFeed.topic, visibility: "invite" },
		feedUrl: "https://carlnotes.example.com/podcast-feeds/token-1.xml",
		podcastEpisodeFilesBaseUrl: "https://carlnotes.example.com/api/podcast-feeds/token-1/episodes",
		isBlockedFromPodcastDirectories: true,
	}
	const feedXml = toPodcastFeedXml(listenerFeed)

	// the block tag, every file's path after the token path, and no public podcast episode page
	expect(feedXml).toContain("<itunes:block>Yes</itunes:block>")
	expect(feedXml).toContain(
		'url="https://carlnotes.example.com/api/podcast-feeds/token-1/episodes/episode-1/audio.mp3"',
	)
	expect(feedXml).toContain("<link>https://carlnotes.example.com/topics/topic-1/home-espresso?episode=episode-1</link>")
})

test("the chapters file gives each chapter its start, its title, and its finding's source", () => {
	// two chapters, each with its title, its finding's source, and its start
	const chaptersJson = toPodcastEpisodeChaptersJson([
		{ title: "The grinder", sourceUrl: "https://a.com/1", startSeconds: 0 },
		{ title: "The water", sourceUrl: "https://b.com/2", startSeconds: 155 },
	])
	expect(JSON.parse(chaptersJson)).toEqual({
		version: "1.2.0",
		chapters: [
			{ startTime: 0, title: "The grinder", url: "https://a.com/1" },
			{ startTime: 155, title: "The water", url: "https://b.com/2" },
		],
	})
})

test("the transcript names each speaker, escapes the script's text, and drops the vocal tags", () => {
	// a script with a vocal tag and text that needs escaping
	const podcastEpisodeScript: PodcastEpisodeScript = {
		coldOpen: [{ speaker: "host", text: "Your grinder got quieter." }],
		segments: [
			{
				transition: [],
				chapters: [
					{
						findingId: "finding-1",
						title: "The <quiet> grinder",
						turns: [{ speaker: "cohost", text: "Okay, <laugh> why do I care about 62 < 90?" }],
					},
				],
			},
		],
		signOff: [{ speaker: "host", text: "Well, I've got more reading to do." }],
	}
	const transcriptHtml = toTranscriptHtml("A quieter grinder", podcastEpisodeScript)

	// each turn under its speaker's name, the chapter's title escaped, and the tag gone
	expect(transcriptHtml).toContain("<p><b>Carl:</b> Your grinder got quieter.</p>")
	expect(transcriptHtml).toContain("<h2>The &lt;quiet&gt; grinder</h2>")
	expect(transcriptHtml).toContain("<p><b>Vienna:</b> Okay, why do I care about 62 &lt; 90?</p>")
	expect(transcriptHtml).toContain("<p>Carl and Vienna are AI voices.</p>")
	expect(transcriptHtml).toContain('<meta name="robots" content="noindex">')
})
