// the page heads of a topic, a team, an invitation, and a profile
import { expect, test } from "bun:test"
import { toInvitePageHead, toProfilePageHead, toTeamPageHead, toTopicPageHead } from "./pageHead"
import type { TopicPreview } from "./topicImage"

// a public topic's preview as toTopicPreview returns it
const TOPIC_PREVIEW: TopicPreview = {
	topicId: "t1",
	title: "Agents",
	visibility: "public",
	ownerUserId: "u1",
	ownerUsername: "carl",
	ownerAvatar: null,
	keptCount: 4,
	sourceCount: 2,
	description: "What agents are shipping this week.",
}

// a public topic's head includes its structured data. the document title names the site and the card does not
test("toTopicPageHead names the topic, its card, and its structured data", () => {
	const head = toTopicPageHead({
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
		jsonLd: { "@type": "CreativeWork" },
	})

	// the page's titles, description, and urls
	expect(head.title).toBe("Agents — CarlNotes")
	expect(head.cardTitle).toBe("Agents")
	expect(head.description).toBe("What agents are shipping this week.")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/topics/t1/agents")
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/topics/t1/preview.png?v=")

	// a public topic is indexed and names its feed and its structured data
	expect(head.isIndexed).toBe(true)
	expect(head.feedUrl).toBe("https://carlnotes.com/topics/t1/feed.xml")
	expect(head.jsonLd).toEqual({ "@type": "CreativeWork" })
})

// the platforms cache a card by its url, so a card that changes has to move to a new url
test("toTopicPageHead names a new card version once the topic is retitled, and the same one otherwise", () => {
	const toImageUrl = (topicPreview: TopicPreview): string =>
		toTopicPageHead({ topicPreview, appUrl: "https://carlnotes.com", jsonLd: null }).imageUrl
	expect(toImageUrl({ ...TOPIC_PREVIEW, title: "Agents at work" })).not.toBe(toImageUrl(TOPIC_PREVIEW))
	expect(toImageUrl({ ...TOPIC_PREVIEW })).toBe(toImageUrl(TOPIC_PREVIEW))
})

// a private topic's head keeps its card and has no structured data
test("toTopicPageHead gives a private topic its card and no structured data", () => {
	const head = toTopicPageHead({
		topicPreview: { ...TOPIC_PREVIEW, visibility: "private" },
		appUrl: "https://carlnotes.com",
		jsonLd: null,
	})
	expect(head.jsonLd).toBeNull()
	expect(head.cardTitle).toBe("Agents")

	// a private topic is never indexed, names no canonical url or feed, and still has its card url for a shared link
	expect(head.isIndexed).toBe(false)
	expect(head.canonicalUrl).toBeNull()
	expect(head.feedUrl).toBeNull()
	expect(head.cardUrl).toBe("https://carlnotes.com/topics/t1/agents")
})

// a team's head includes its own card, name, canonical url, and the counts its description reads
test("toTeamPageHead writes the team's card and counts", () => {
	const head = toTeamPageHead(
		{ teamId: "tm1", name: "Raccoon Crew", avatar: null, memberCount: 1, topicCount: 3 },
		"https://carlnotes.com",
	)

	// the card image, the canonical url, the description's counts, and the card title
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/teams/tm1/preview.png?v=")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/teams/tm1")
	expect(head.description).toBe("Raccoon Crew on CarlNotes. 1 member, 3 public topics.")
	expect(head.cardTitle).toBe("Raccoon Crew — CarlNotes")
})

// an invitation names its action. a team is joined and a topic is followed
test("toInvitePageHead titles a team invitation 'Join' and a topic invitation 'Follow'", () => {
	const inviteUrls = { imageUrl: "https://carlnotes.com/card.png", inviteUrl: "https://carlnotes.com/invite/t0k3n" }
	const teamInviteHead = toInvitePageHead({ ...inviteUrls, name: "Raccoon Crew", kind: "team" })
	const topicInviteHead = toInvitePageHead({ ...inviteUrls, name: "Espresso Machines", kind: "topic" })

	// a team is joined, and a topic is followed, in the title and in the description alike
	expect(teamInviteHead.title).toBe("Join Raccoon Crew on CarlNotes")
	expect(teamInviteHead.description).toContain("You are invited to join Raccoon Crew.")
	expect(topicInviteHead.title).toBe("Follow Espresso Machines on CarlNotes")
	expect(topicInviteHead.description).toContain("You are invited to follow Espresso Machines.")

	// a token is a credential, so its page is never indexed and its card url is the invite url
	expect(topicInviteHead.isIndexed).toBe(false)
	expect(topicInviteHead.canonicalUrl).toBeNull()
	expect(topicInviteHead.cardUrl).toBe("https://carlnotes.com/invite/t0k3n")
})

// a profile's head includes its card, canonical url, and the counts its description reads
test("toProfilePageHead writes the profile's card and counts", () => {
	const head = toProfilePageHead(
		{ userId: "u1", username: "carl", avatar: null, publicTopicCount: 1, followerCount: 2 },
		"https://carlnotes.com",
	)

	// the card image, the canonical url, and the description's counts
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/profiles/u1/preview.png?v=")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/profiles/u1")
	expect(head.description).toBe("carl on CarlNotes. 1 public topic, 2 followers.")
})

// a team or a profile with no public topic is not indexed
test("toTeamPageHead and toProfilePageHead leave a page with no public topic unindexed", () => {
	const teamHead = toTeamPageHead(
		{ teamId: "tm1", name: "Raccoon Crew", avatar: null, memberCount: 1, topicCount: 0 },
		"https://carlnotes.com",
	)
	const profileHead = toProfilePageHead(
		{ userId: "u1", username: "carl", avatar: null, publicTopicCount: 0, followerCount: 2 },
		"https://carlnotes.com",
	)

	// neither is indexed or names a canonical url
	expect(teamHead.isIndexed).toBe(false)
	expect(teamHead.canonicalUrl).toBeNull()
	expect(profileHead.isIndexed).toBe(false)
	expect(profileHead.canonicalUrl).toBeNull()

	// both keep their card for a shared link
	expect(teamHead.cardUrl).toBe("https://carlnotes.com/teams/tm1")
	expect(profileHead.cardUrl).toBe("https://carlnotes.com/profiles/u1")
})

// a public topic that is not yet shown is not indexed
test("toTopicPageHead leaves a public topic with too few findings unindexed", () => {
	const head = toTopicPageHead({
		topicPreview: { ...TOPIC_PREVIEW, keptCount: 2 },
		appUrl: "https://carlnotes.com",
		jsonLd: null,
	})

	// the page names no canonical url and keeps its feed and its card
	expect(head.isIndexed).toBe(false)
	expect(head.canonicalUrl).toBeNull()
	expect(head.feedUrl).toBe("https://carlnotes.com/topics/t1/feed.xml")
	expect(head.cardUrl).toBe("https://carlnotes.com/topics/t1/agents")
})
