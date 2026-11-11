import type { NewsResponse } from "@carlnotes/contracts/news"
import { EMPTY_NEWS_STORY, toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NewsList } from "./NewsList"

// a query client that already holds the week's first page of a list, so no story reaches the api
function toStoryQueryClient(profileUserId: string | null, userId: string, newsPage: NewsResponse): QueryClient {
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
	queryClient.setQueryData(["news", profileUserId, userId, "week", 1], newsPage)
	return queryClient
}

// the web card's full week, its row with a film, its empty line, and a profile's rows as another reader
const meta: Meta<typeof NewsList> = {
	title: "Social/NewsList",
	component: NewsList,
	args: {
		profileUserId: null,
		userId: "user-evan",
		opener: "Espresso had a loud week, and the burr debate is not over.",
	},
	parameters: { webReference: "social-newslist--full-week" },
	decorators: [
		(Story, { args, parameters }) => (
			<QueryClientProvider
				client={toStoryQueryClient(
					args.profileUserId ?? null,
					args.userId ?? "",
					(parameters.newsPage as NewsResponse | undefined) ?? toNewsStoryPage(1),
				)}
			>
				<Story />
			</QueryClientProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

// 32 rows show five to a page under carl's opener, with the page buttons under them
export const FullWeek: Story = {}

// a Podcast Episode with a film shows the Video pill beside its play pill, which opens the Video sheet
export const WithFilm: Story = {
	parameters: { webReference: "social-newslist--with-film", newsPage: toNewsStoryPage(1, PODCAST_STORY_FILM_EPISODE) },
}

// a week with no row shows its empty line and no page buttons
export const QuietWeek: Story = { parameters: { newsPage: EMPTY_NEWS_STORY } }

// a profile's news as another reader: no opener, and a row names the Comment's author
export const Profile: Story = { args: { profileUserId: "user-evan", userId: "user-roastfan", opener: null } }
