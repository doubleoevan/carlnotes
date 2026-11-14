// profile page tests: the empty topics and teams sections on someone else's profile, the server render's news rows
// and cards, the film section right before the podcast section, and the one Topic Posts section with every post
import { expect, test } from "bun:test"
import type { NewsResponse } from "@carlnotes/contracts/news"
import { toPodcastEpisodeSummaryFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { ProfilePodcastEpisodeCard, ProfileResponse, ProfileTopicPostCard } from "@carlnotes/contracts/profilePage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ProfileSections } from "@/components/account/ProfileSections"
import { renderWithRouter } from "@/components/chat/renderWithRouter"

// someone else's profile with no public topics and no public teams
const emptyProfile: ProfileResponse = {
	userId: "user-2",
	username: "lin",
	avatarSource: "initials",
	avatarVersion: null,
	joinedAt: "2026-07-01T00:00:00.000Z",
	subscriberCount: 0,
	includesNonPublicTopics: false,
	isBlocked: false,
	topics: [],
	teams: [],
	profileTopics: [],
	pinnedTopicCount: 0,
	profileTopicPodcastEpisodeVideos: [],
	pinnedTopicPodcastEpisodeVideoCount: 0,
	profilePodcastEpisodes: [],
	profileTopicPosts: [],
	pinnedTopicPostCount: 0,
	pinnedPodcastEpisodeCount: 0,
}

// the open topics section shows a muted line in a card, as the teams section does, never a blank section
test("someone else's profile with no topics says so, as it does for no teams", async () => {
	// the sections' news reads through a query client, which a server render never fetches from
	const html = await renderWithRouter(
		<QueryClientProvider client={new QueryClient()}>
			<ProfileSections profile={emptyProfile} isOwnProfile={false} onReloadProfile={() => {}} />
		</QueryClientProvider>,
	)
	expect(html).toContain("Brews News</button>")

	// each table sits under its title, and a table with nothing in it shows no count
	expect(html).toContain("All Topics</span></button>")
	expect(html).toContain("All Teams</span></button>")
	const toEmptyCardHtml = (line: string): string =>
		`<div data-slot="table-card" class="bg-card rounded-lg border p-4 shadow-raised mb-2"><p class="text-muted-foreground py-2 text-sm">${line}</p></div>`
	expect(html).toContain(toEmptyCardHtml("No public topics."))
	expect(html).toContain(toEmptyCardHtml("No public teams."))
})

// a Topic's new Finding as a news row, by its number
const toNewsEvent = (newsEventNumber: number): NewsResponse["newsEvents"][number] => ({
	id: `news-${newsEventNumber}`,
	kind: "finding",
	occurredAt: "2026-11-09T12:00:00.000Z",
	topicId: "topic-1",
	topicName: "Home espresso",
	image: null,
	path: `/topics/topic-1/home-espresso?finding=finding-${newsEventNumber}`,
	findingId: `finding-${newsEventNumber}`,
	podcastEpisodeId: null,
	topicPostId: null,
	listenerCount: null,
	actor: null,
	title: `News finding ${newsEventNumber}`,
	text: null,
	reactionType: null,
	reactionCount: null,
	commentAuthor: null,
})

// a crawler reads the week's first news rows and every Topic card with no script run
test("the server render holds the first page of the week's news and every Topic card", async () => {
	// fourteen public Topics as cards, more than one page of the section shows
	const profileTopics = Array.from({ length: 14 }, (_, i) => ({
		id: `topic-${i + 1}`,
		name: `Card topic ${i + 1}`,
		path: `/topics/topic-${i + 1}/card-topic-${i + 1}`,
		image: null,
		tags: [],
		owner: { userId: "user-2", username: "lin", avatarSource: "initials", avatarVersion: null },
		teamLink: null,
		reactionCount: 0,
		latestPodcastEpisode: null,
		isPublic: true,
		isOwned: true,
	}))

	// the first page the server read: five rows of a window that holds seven
	const firstNewsPage: NewsResponse = {
		newsEvents: Array.from({ length: 5 }, (_, i) => toNewsEvent(i + 1)),
		podcastEpisodes: [],
		total: 7,
		cursor: "cursor-1",
	}
	const html = await renderWithRouter(
		<QueryClientProvider client={new QueryClient()}>
			<ProfileSections
				profile={{ ...emptyProfile, profileTopics }}
				firstNewsPage={firstNewsPage}
				isOwnProfile={false}
				onReloadProfile={() => {}}
			/>
		</QueryClientProvider>,
	)

	// each of the five rows, and each of the fourteen cards, a card off the first page included
	for (let newsEventNumber = 1; newsEventNumber <= 5; newsEventNumber++) {
		expect(html).toContain(`News finding ${newsEventNumber}`)
	}
	expect(html.match(/aria-label="Open Card topic \d+"/g)).toHaveLength(14)
})

// a podcast episode with a film as a profile card, by its id and its title
const toFilmPodcastEpisodeCard = (id: string, title: string): ProfilePodcastEpisodeCard => ({
	podcastEpisode: toPodcastEpisodeSummaryFixture({ id, title, hasVideo: true }),
	topic: { id: "topic-1", name: "Home espresso", path: "/topics/topic-1/home-espresso", image: null },
	reactionCount: 0,
	isTopicPublic: true,
	isTopicOwned: true,
})

// films lead the podcasts, a film card has the film's play button alone, and a podcast card whose episode has a film
// has play alone
test("Featured Films sits right before Featured Podcasts, and a profile with no film shows no film section", async () => {
	// a profile with one film and one podcast episode, and the same profile with no film
	const profile: ProfileResponse = {
		...emptyProfile,
		profileTopicPodcastEpisodeVideos: [toFilmPodcastEpisodeCard("episode-film", "The film card")],
		profilePodcastEpisodes: [toFilmPodcastEpisodeCard("episode-podcast", "The podcast card")],
	}
	const toSectionsHtml = (sectionsProfile: ProfileResponse): Promise<string> =>
		renderWithRouter(
			<QueryClientProvider client={new QueryClient()}>
				<ProfileSections profile={sectionsProfile} isOwnProfile={false} onReloadProfile={() => {}} />
			</QueryClientProvider>,
		)
	const html = await toSectionsHtml(profile)

	// the film section's title, its count, and its card come before the podcast section's
	const filmSectionIndex = html.indexOf("Featured Films")
	const podcastSectionIndex = html.indexOf("Featured Podcasts")
	expect(filmSectionIndex).toBeGreaterThan(-1)
	expect(podcastSectionIndex).toBeGreaterThan(filmSectionIndex)
	const filmSectionHtml = html.slice(filmSectionIndex, podcastSectionIndex)
	expect(filmSectionHtml).toContain("1 film")
	expect(filmSectionHtml).toContain('aria-label="Open The film card"')

	// the film card has the film's play button and no Watch, and the podcast card has no film button
	expect(filmSectionHtml).toContain('aria-label="Play film"')
	expect(filmSectionHtml).not.toContain("Watch</button>")
	expect(filmSectionHtml).not.toContain("Video</button>")
	expect(html.slice(podcastSectionIndex)).not.toContain("Video</button>")

	// a profile with no film shows no film section
	const htmlWithoutFilms = await toSectionsHtml({ ...profile, profileTopicPodcastEpisodeVideos: [] })
	expect(htmlWithoutFilms).not.toContain("Featured Films")
	expect(htmlWithoutFilms).toContain("Featured Podcasts")
})

// every published Topic Post is a card of the one Topic Posts section, whose count is the whole number
test("Featured Posts lists every Topic Post with the whole count, and the page has no second Topic Post section", async () => {
	// fourteen posts, more than one page of the section shows and more than a person once pinned
	const profileTopicPosts: ProfileTopicPostCard[] = Array.from({ length: 14 }, (_, i) => ({
		id: `post-${i + 1}`,
		topicId: "topic-1",
		topicName: "Home espresso",
		title: `Card post ${i + 1}`,
		author: { userId: "user-2", username: "lin", avatarSource: "initials", avatarVersion: null },
		publishedAt: "2026-11-09T12:00:00.000Z",
		wordCount: 320,
		image: null,
		summary: null,
		reactionCount: 0,
		path: `/topics/topic-1/home-espresso/posts/post-${i + 1}/card-post-${i + 1}`,
		isTopicPublic: true,
		isTopicOwned: true,
	}))
	const html = await renderWithRouter(
		<QueryClientProvider client={new QueryClient()}>
			<ProfileSections
				profile={{ ...emptyProfile, profileTopicPosts, pinnedTopicPostCount: 13 }}
				isOwnProfile={false}
				onReloadProfile={() => {}}
			/>
		</QueryClientProvider>,
	)

	// the section's title, its count of every post, and every card, a card off the first page included
	expect(html).toContain("Featured Posts")
	expect(html).toContain("14 posts")
	expect(
		html.match(/href="\/topics\/topic-1\/home-espresso\/posts\/post-\d+\/card-post-\d+"/g)?.length,
	).toBeGreaterThanOrEqual(14)
	expect(html).not.toContain("Open Mic")

	// the section sits right before the topics table
	expect(html.indexOf("Featured Posts")).toBeLessThan(html.indexOf("All Topics"))
})
