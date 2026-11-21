// a section the server pages renders its page buttons as links to each page's url, which the html holds for a reader
// without JavaScript and a crawler, and a section that holds every card renders no link
import { expect, test } from "bun:test"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { HOME_SECTIONS } from "@carlnotes/core/lib/homeFaces"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { Accordion } from "@/components/primitives/accordion"

// the week's twenty new posts: four pages, the first of which the home read holds
const NEWEST_TOPIC_POSTS = Array.from({ length: 20 }, (_, index) => ({ id: `post-${index + 1}` }) as TopicPostCard)

// the home's section of the week's new posts at a url, paged by the server or holding every card
async function renderNewestTopicPostsSection({ path, isPagedOnServer }: { path: string; isPagedOnServer: boolean }) {
	const firstPageTopicPosts = NEWEST_TOPIC_POSTS.slice(0, 6)
	return renderWithRouter(
		<QueryClientProvider client={new QueryClient()}>
			<Accordion type="multiple">
				<PagedCardsSection
					section={HOME_SECTIONS.newestTopicPosts}
					rows={isPagedOnServer ? firstPageTopicPosts : NEWEST_TOPIC_POSTS}
					serverPages={
						isPagedOnServer
							? {
									queryKey: ["newest-topic-posts"],
									loadedPage: { rows: firstPageTopicPosts, page: 0, totalCount: NEWEST_TOPIC_POSTS.length },
									fetchPage: async () => ({ rows: [], totalCount: NEWEST_TOPIC_POSTS.length }),
								}
							: undefined
					}
					renderCard={(topicPost) => <span>{topicPost.id}</span>}
				/>
			</Accordion>
		</QueryClientProvider>,
		path,
	)
}

test("the home's html links each page of a section the server pages, keeping the url's other pages", async () => {
	const html = await renderNewestTopicPostsSection({ path: "/?newFilms=2", isPagedOnServer: true })

	// a link to each of the four pages, the first without its key, and the films' page kept
	for (const pageHref of ["/?newFilms=2", "/?newFilms=2&amp;newPosts=2", "/?newFilms=2&amp;newPosts=3"]) {
		expect(html).toContain(`href="${pageHref}"`)
	}
	expect(html).toContain('href="/?newFilms=2&amp;newPosts=4"')

	// the first page's cards alone, with the links shown without JavaScript
	expect(html).toContain("post-6")
	expect(html).not.toContain("post-7")
	expect(html).not.toContain("hidden scripted:flex")
})

test("a section that holds every card renders every card and no page link", async () => {
	const html = await renderNewestTopicPostsSection({ path: "/", isPagedOnServer: false })
	expect(html).toContain("post-20")
	expect(html).not.toContain("newPosts=")
})
