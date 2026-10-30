// push routing tests: a push opens its Topic or room for its own account, anything else opens Home, and a push for the
// screen already open is recognized
import { expect, test } from "bun:test"
import { SITE_URL } from "@carlnotes/contracts/site"
import { isPushForAccount, isPushForPath, toPushOpenPath } from "./pushNotificationRouting"

// a mention push for user-1 in a Topic's room, and a Topic push for user-1
const MENTION_PUSH_DATA = {
	kind: "chat-mention",
	url: `${SITE_URL}/topics/topic-1/chat?chatTeamId=team-1`,
	recipientUserId: "user-1",
}
const TOPIC_PUSH_DATA = {
	kind: "topic-scan",
	url: `${SITE_URL}/topics/topic-1/home-espresso`,
	recipientUserId: "user-1",
}

// the account the push was sent to opens its room or Topic
test("a push opens its room or Topic for its own account", () => {
	expect(toPushOpenPath(MENTION_PUSH_DATA, "user-1")).toBe("/topics/topic-1/chat?chatTeamId=team-1")
	expect(toPushOpenPath(TOPIC_PUSH_DATA, "user-1")).toBe("/topics/topic-1")
	expect(toPushOpenPath({ ...MENTION_PUSH_DATA, url: `${SITE_URL}/teams/team-1/chat` }, "user-1")).toBe(
		"/teams/team-1/chat",
	)
})

// another account, a signed-out phone, a link off the site, and malformed data open Home
test("anything but this account's site link opens Home", () => {
	expect(toPushOpenPath(MENTION_PUSH_DATA, "user-2")).toBe("/")
	expect(toPushOpenPath(MENTION_PUSH_DATA, null)).toBe("/")
	expect(toPushOpenPath({ ...MENTION_PUSH_DATA, url: "https://example.com/topics/topic-1/chat" }, "user-1")).toBe("/")
	expect(toPushOpenPath({ url: `${SITE_URL}/topics/topic-1` }, "user-1")).toBe("/")
	expect(toPushOpenPath(undefined, "user-1")).toBe("/")
})

// the room on screen matches its push, and another screen does not
test("a push is for the open screen only if its path matches", () => {
	expect(isPushForPath(MENTION_PUSH_DATA, "/topics/topic-1/chat?chatTeamId=team-1")).toBe(true)
	expect(isPushForPath(MENTION_PUSH_DATA, "/topics/topic-1/chat?chatTeamId=team-2")).toBe(false)
	expect(isPushForPath(MENTION_PUSH_DATA, "/topics/topic-1/chat")).toBe(false)
	expect(isPushForPath(MENTION_PUSH_DATA, "/topics/topic-1")).toBe(false)
	expect(
		isPushForPath({ ...MENTION_PUSH_DATA, url: "https://example.com/topics/topic-1/chat" }, "/topics/topic-1/chat"),
	).toBe(false)
})

// a push belongs to the account it names, and to no visitor
test("a push is for the account it names", () => {
	expect(isPushForAccount(MENTION_PUSH_DATA, "user-1")).toBe(true)
	expect(isPushForAccount(MENTION_PUSH_DATA, "user-2")).toBe(false)
	expect(isPushForAccount(MENTION_PUSH_DATA, null)).toBe(false)
})
