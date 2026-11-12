// the topic page's and the team page's loading states hold the loaded pages' sections, in the loaded pages' layout
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { toElementClassNames } from "@/components/markupTestFixtures"
import { PLAIN_TOPIC_HEADER_GRID_CLASS, TOPIC_HEADER_AREA_CLASSES } from "@/lib/pageHeaderClasses"
import { FILM_CARD_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodePlayerCardSkeleton, TopicSkeleton } from "./TopicSkeleton"

// the class of the podcast feed button's placeholder under the chapter rows on a phone
const PHONE_FEED_BUTTON_CLASS = "bg-muted h-11 animate-pulse rounded-lg sm:hidden"

test("the topic's loading state is laid out in the loaded header's grid, with the film's card above the player card", () => {
	const html = renderToStaticMarkup(<TopicSkeleton />)
	const classNames = toElementClassNames(html, "div")

	// the header's grid floats the image on a phone, as the loaded header does
	expect(classNames).toContain(PLAIN_TOPIC_HEADER_GRID_CLASS)
	expect(classNames.some((className) => className.startsWith(TOPIC_HEADER_AREA_CLASSES.image))).toBe(true)

	// the film's card comes before the player card, which holds the topic page's podcast feed button
	const filmCardIndex = classNames.indexOf(FILM_CARD_CLASS)
	const feedButtonIndex = classNames.indexOf(PHONE_FEED_BUTTON_CLASS)
	expect(filmCardIndex).toBeGreaterThan(-1)
	expect(feedButtonIndex).toBeGreaterThan(filmCardIndex)
})

test("a known topic's loading state shows its title in the header's title area", () => {
	const html = renderToStaticMarkup(<TopicSkeleton topicTitle="Better coffee at home" />)
	expect(toElementClassNames(html, "h1")).toEqual([
		`${TOPIC_HEADER_AREA_CLASSES.title} font-display text-2xl leading-tight`,
	])
	expect(html).toContain("Better coffee at home")
})

test("the player card reserves the podcast feed button only for a page whose card has one", () => {
	const cardHtml = renderToStaticMarkup(<PodcastEpisodePlayerCardSkeleton />)
	const feedCardHtml = renderToStaticMarkup(<PodcastEpisodePlayerCardSkeleton hasFeedButton />)
	expect(toElementClassNames(cardHtml, "div")).not.toContain(PHONE_FEED_BUTTON_CLASS)
	expect(toElementClassNames(feedCardHtml, "div")).toContain(PHONE_FEED_BUTTON_CLASS)
})

test("a team's loading state holds its four card sections over its three tables", () => {
	const teamHtml = renderToStaticMarkup(<PageSkeleton kind="team" />)
	const profileHtml = renderToStaticMarkup(<PageSkeleton kind="profile" />)

	// each section is one accordion item: four of cards and three of tables for a team, and one of cards and two of
	// tables for a profile
	expect(teamHtml.match(/data-slot="accordion-item"/g)).toHaveLength(7)
	expect(profileHtml.match(/data-slot="accordion-item"/g)).toHaveLength(3)
})
