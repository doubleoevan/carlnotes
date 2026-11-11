// section order tests: every film section sits right before the podcast section it pairs with, on the home, on both
// apps' profile pages, on both apps' team pages, on both apps' podcast episode pages, and on both apps' topic pages,
// where the Topic Posts section sits between the comment thread and the page's cards. the theme song's credits sit
// right after the title of each film section and each podcast section of a page. both homes show their sections in
// one order, each week's new cards right after their home cards, a profile page has one Topic Posts section, and a
// team page has a profile's card sections
import { describe, expect, test } from "bun:test"
import { TEAM_SECTIONS } from "./cardSections"
import { HOME_SECTIONS } from "./homeFaces"
import { PROFILE_SECTIONS } from "./profileSections"

// the files that place a profile's card sections, from the repo root
const PROFILE_PAGE_FILES = [
	"apps/web/src/components/account/ProfileSections.tsx",
	"apps/mobile/app/profiles/[userId].tsx",
]

// the files that place a team's card sections, from the repo root
const TEAM_PAGE_FILES = ["apps/web/src/pages/TeamPage.tsx", "apps/mobile/app/teams/[teamId].tsx"]

// the files that place the home's card sections, from the repo root
const HOME_PAGE_FILES = ["apps/web/src/pages/HomePage.tsx", "apps/mobile/app/(tabs)/index.tsx"]

// the home's card sections in the order both homes show them, each by its title
const HOME_SECTION_TITLES = [
	["homeTopics", "Featured topics"],
	["homeTopicPodcastEpisodeVideos", "Featured films"],
	["newestTopicPodcastEpisodeVideos", "New films this week"],
	["homePodcastEpisodes", "Featured podcasts"],
	["newestPodcastEpisodes", "New podcasts this week"],
	["homeTopicPosts", "Featured posts"],
	["newestTopicPosts", "New posts this week"],
	["yourTopics", "Your topics"],
] as const

// the home's film sections, each with the podcast section that follows it
const HOME_SECTION_PAIRS = [
	["homeTopicPodcastEpisodeVideos", "homePodcastEpisodes"],
	["newestTopicPodcastEpisodeVideos", "newestPodcastEpisodes"],
] as const

// the film section, the films list, and the podcast episodes list, as both apps write them
const FILM_SECTION = "<TopicPodcastEpisodeVideoSection"
const FILM_LIST = '<PodcastEpisodesCard topic={topic} format="video"'
const PODCAST_EPISODE_LIST = "<PodcastEpisodesCard topic={topic}"

// the topic page's film element, each with the podcast element right after it
const TOPIC_PAGE_PAIRS = [
	[FILM_SECTION, "<PodcastEpisodePlayer"],
	[FILM_LIST, PODCAST_EPISODE_LIST],
] as const

// the files that place the topic page's sections, from the repo root, each with its elements in the order the page
// shows them: the film section, the podcast player, the comment thread, the Topic Posts section, then the cards with
// the films list and the podcast episodes list
const TOPIC_PAGE_ELEMENT_ORDERS: Record<string, string[]> = {
	// the web page, whose cards follow the page in the same file
	"apps/web/src/pages/TopicPage.tsx": [
		FILM_SECTION,
		"<PodcastEpisodePlayer",
		"<SocialSection",
		"<TopicPostsSection",
		"<TopicViews",
		FILM_LIST,
		PODCAST_EPISODE_LIST,
	],
	// the mobile screen, then its cards
	"apps/mobile/src/components/topic/TopicPageContent.tsx": [
		FILM_SECTION,
		"<PodcastEpisodePlayer",
		"<SocialSection",
		"<TopicPostsSection",
		"<TopicPageCards",
	],
	"apps/mobile/src/components/topic/TopicPageCards.tsx": [FILM_LIST, PODCAST_EPISODE_LIST],
}

// the files that place the podcast episode page's sections, from the repo root, each with the podcast's section, the
// film's section, and the comment thread as the file writes them
const PODCAST_EPISODE_PAGE_ELEMENT_ORDERS: Record<string, string[]> = {
	"apps/web/src/pages/PodcastEpisodePage.tsx": [
		"title={PODCAST_NAME}",
		"<TopicPodcastEpisodeVideoPageSection",
		"<SocialSection",
	],
	"apps/mobile/src/components/podcast/PodcastEpisodeScreen.tsx": [
		"title={PODCAST_NAME}",
		"title={TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE}",
		"<SocialSection",
	],
}

// the theme song's credits, the credits as a section's title note, and how many sections of each file show them:
// the film section and the podcast section of the topic page and of the podcast episode page, on both apps
const THEME_SONG_CREDITS = "<PodcastThemeSongNote"
const THEME_SONG_CREDITS_TITLE_NOTE = "titleNote={<PodcastThemeSongNote />}"
const THEME_SONG_CREDITS_COUNTS: Record<string, number> = {
	"apps/web/src/components/podcast/TopicPodcastEpisodeVideoSection.tsx": 1,
	"apps/web/src/components/podcast/PodcastEpisodePlayer.tsx": 1,
	"apps/web/src/pages/PodcastEpisodePage.tsx": 2,
	"apps/mobile/src/components/podcast/TopicPodcastEpisodeVideoSection.tsx": 1,
	"apps/mobile/src/components/podcast/PodcastEpisodePlayer.tsx": 1,
	"apps/mobile/src/components/podcast/PodcastEpisodeScreen.tsx": 2,
}

test("the theme song's credits sit beside the film and podcast section titles alone", async () => {
	for (const [sectionFile, creditsCount] of Object.entries(THEME_SONG_CREDITS_COUNTS)) {
		// every use of the credits in the file is a section's title note
		const source = await Bun.file(new URL(`../../../${sectionFile}`, import.meta.url)).text()
		expect(source.split(THEME_SONG_CREDITS_TITLE_NOTE)).toHaveLength(creditsCount + 1)
		expect(source.split(THEME_SONG_CREDITS)).toHaveLength(creditsCount + 1)
	}
})

describe("the home's sections", () => {
	test("read in one order, each week's new cards right after their home cards", () => {
		const sectionTitles = Object.entries(HOME_SECTIONS).map(([sectionKey, { title }]) => [sectionKey, title])
		expect(sectionTitles).toEqual(HOME_SECTION_TITLES.map((sectionTitle) => [...sectionTitle]))
	})

	test("are written in that order by both apps", async () => {
		for (const homePageFile of HOME_PAGE_FILES) {
			// the file writes each section after the one before it
			const source = await Bun.file(new URL(`../../../${homePageFile}`, import.meta.url)).text()
			const sectionElements = HOME_SECTION_TITLES.map(([sectionKey]) => `section={HOME_SECTIONS.${sectionKey}}`)
			expect(toElementIndexes(source, sectionElements)).not.toContain(-1)
		}
	})
})

describe("a profile page", () => {
	test("has one Topic Posts section on both apps, the last of its card sections", async () => {
		for (const profilePageFile of PROFILE_PAGE_FILES) {
			// the page writes the four card sections once each, the Topic Posts last
			const source = await Bun.file(new URL(`../../../${profilePageFile}`, import.meta.url)).text()
			const sectionElements = [...(source.match(/section=\{PROFILE_SECTIONS\.\w+\}/g) ?? [])]
			expect(sectionElements).toEqual(Object.keys(PROFILE_SECTIONS).map((key) => `section={PROFILE_SECTIONS.${key}}`))
			expect(sectionElements.at(-1)).toBe("section={PROFILE_SECTIONS.profileTopicPosts}")
		}
	})
})

describe("a team page", () => {
	test("has a profile's card sections, under the same titles in the same order", () => {
		// the titles of a page's card sections in their order
		const toSectionTitles = (sections: Record<string, { title: string }>): string[] =>
			Object.values(sections).map((section) => section.title)
		expect(toSectionTitles(TEAM_SECTIONS)).toEqual(toSectionTitles(PROFILE_SECTIONS))
	})

	test("writes each card section once on both apps, in that order", async () => {
		for (const teamPageFile of TEAM_PAGE_FILES) {
			// the page writes the four card sections once each, in the section list's order
			const source = await Bun.file(new URL(`../../../${teamPageFile}`, import.meta.url)).text()
			const sectionElements = [...(source.match(/section=\{TEAM_SECTIONS\.\w+\}/g) ?? [])]
			expect(sectionElements).toEqual(Object.keys(TEAM_SECTIONS).map((key) => `section={TEAM_SECTIONS.${key}}`))
		}
	})
})

describe("films come right before podcasts", () => {
	test("on the home", () => {
		// both homes render the sections in this order
		const sectionKeys = Object.keys(HOME_SECTIONS)
		expect(sectionKeys.indexOf("homeTopicPodcastEpisodeVideos")).toBe(1)
		expect(sectionKeys.indexOf("newestTopicPodcastEpisodeVideos")).toBe(2)
		for (const [filmSectionKey, podcastSectionKey] of HOME_SECTION_PAIRS) {
			expect(sectionKeys.indexOf(filmSectionKey)).toBeLessThan(sectionKeys.indexOf(podcastSectionKey))
		}
	})

	test("on both apps' profile pages", async () => {
		await expectFilmSectionBeforePodcastSection({
			sections: PROFILE_SECTIONS,
			sectionsName: "PROFILE_SECTIONS",
			filmSectionKey: "profileTopicPodcastEpisodeVideos",
			podcastSectionKey: "profilePodcastEpisodes",
			pageFiles: PROFILE_PAGE_FILES,
		})
	})

	test("on both apps' team pages", async () => {
		await expectFilmSectionBeforePodcastSection({
			sections: TEAM_SECTIONS,
			sectionsName: "TEAM_SECTIONS",
			filmSectionKey: "topicPodcastEpisodeVideoCards",
			podcastSectionKey: "podcastEpisodeCards",
			pageFiles: TEAM_PAGE_FILES,
		})
	})

	test("on both apps' podcast episode pages", async () => {
		for (const [podcastEpisodePageFile, elementOrder] of Object.entries(PODCAST_EPISODE_PAGE_ELEMENT_ORDERS)) {
			// the file writes the podcast's section, then the film's section, then the comment thread
			const source = await Bun.file(new URL(`../../../${podcastEpisodePageFile}`, import.meta.url)).text()
			expect(toElementIndexes(source, elementOrder)).not.toContain(-1)
		}
	})

	test("on both apps' topic pages", async () => {
		for (const [topicPageFile, elementOrder] of Object.entries(TOPIC_PAGE_ELEMENT_ORDERS)) {
			// where the file writes each element, each searched for after the one before it
			const source = await Bun.file(new URL(`../../../${topicPageFile}`, import.meta.url)).text()
			const elementIndexes = toElementIndexes(source, elementOrder)
			expect(elementIndexes).not.toContain(-1)

			// no other element opens between a film element and its podcast element. a pair that the file does not place
			// reads as an empty slice
			for (const [filmElement, podcastElement] of TOPIC_PAGE_PAIRS) {
				const filmEnd = (elementIndexes[elementOrder.indexOf(filmElement)] ?? source.length) + filmElement.length
				expect(source.slice(filmEnd, elementIndexes[elementOrder.indexOf(podcastElement)])).not.toContain("<")
			}
		}
	})
})

// a page's card sections and the name both apps write them by, the keys of its film section and of the podcast
// section right after it, and the files that place them, from the repo root
type FilmSectionPair = {
	sections: Record<string, unknown>
	sectionsName: string
	filmSectionKey: string
	podcastSectionKey: string
	pageFiles: string[]
}

// check that a page's film section comes right before its podcast section, in the section list and in each file
async function expectFilmSectionBeforePodcastSection({
	sections,
	sectionsName,
	filmSectionKey,
	podcastSectionKey,
	pageFiles,
}: FilmSectionPair): Promise<void> {
	// the film section's key comes right before the podcast section's
	const sectionKeys = Object.keys(sections)
	const filmSectionIndex = sectionKeys.indexOf(filmSectionKey)
	expect(filmSectionIndex).toBeGreaterThan(-1)
	expect(sectionKeys[filmSectionIndex + 1]).toBe(podcastSectionKey)

	for (const pageFile of pageFiles) {
		// each page writes the film section and then the podcast section, with no other section between them
		const source = await Bun.file(new URL(`../../../${pageFile}`, import.meta.url)).text()
		const sectionPair = [`${sectionsName}.${filmSectionKey}`, `${sectionsName}.${podcastSectionKey}`]
		const [filmIndex = -1, podcastIndex = -1] = toElementIndexes(source, sectionPair)
		expect(filmIndex).toBeGreaterThan(-1)
		expect(podcastIndex).toBeGreaterThan(filmIndex)
		expect(source.slice(filmIndex, podcastIndex).split(`${sectionsName}.`)).toHaveLength(2)
	}
}

// the index of each element in the source, each searched for after the one before it. -1 for an element the source
// does not write in that order
function toElementIndexes(source: string, elements: string[]): number[] {
	let searchStart = 0
	return elements.map((element) => {
		const elementIndex = searchStart === -1 ? -1 : source.indexOf(element, searchStart)
		searchStart = elementIndex === -1 ? -1 : elementIndex + element.length
		return elementIndex
	})
}
