import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { isTopicFindingVisible } from "./findingPermissions"
import { db } from "./index"
import * as personalSourcesAuthority from "./personalSourcesAuthority"
import * as quotas from "./quotas"
import * as topicPermissions from "./topicPermissions"

// a Finding on another user's Topic, with one join row for the Finding's Topic lookup
function stubFindingTopic(visibility: "private" | "invite"): void {
	const topic = { id: "topic-1", ownerId: "owner-1", visibility, teamId: null, scanStartedAt: new Date() }
	const join = { innerJoin: () => join, where: () => join, limit: async () => [topic] }
	spyOn(db, "select").mockReturnValue({ from: () => join } as never)
	spyOn(topicPermissions, "toTopicRole").mockResolvedValue(null)
}

// the user's admin role and whether the Topic has Personal sources left to convert
function stubAccess({ isAdmin, hasPersonalSources = false }: { isAdmin: boolean; hasPersonalSources?: boolean }): void {
	spyOn(quotas, "loadUserAccess").mockResolvedValue({ isAdmin } as never)
	spyOn(personalSourcesAuthority, "hasUnconvertedPersonalSources").mockResolvedValue(hasPersonalSources)
}

afterEach(() => {
	mock.restore()
})

test("an admin sees a Finding on a private Topic", async () => {
	stubFindingTopic("private")
	stubAccess({ isAdmin: true })
	expect(await isTopicFindingVisible("admin-1", "finding-1")).toBe(true)
})

test("an admin sees no Finding on a private Topic with Personal sources left to convert", async () => {
	stubFindingTopic("private")
	stubAccess({ isAdmin: true, hasPersonalSources: true })
	expect(await isTopicFindingVisible("admin-1", "finding-1")).toBe(false)
})

test("a team member sees no Finding on a private Topic with Personal sources left to convert, and the owner does", async () => {
	stubFindingTopic("private")
	stubAccess({ isAdmin: false, hasPersonalSources: true })
	spyOn(topicPermissions, "toTopicRole").mockResolvedValue("member" as never)
	expect(await isTopicFindingVisible("member-1", "finding-1")).toBe(false)
	expect(await isTopicFindingVisible("owner-1", "finding-1")).toBe(true)
})

test("a user without a role sees no Finding on a private Topic", async () => {
	stubFindingTopic("private")
	stubAccess({ isAdmin: false })
	expect(await isTopicFindingVisible("user-1", "finding-1")).toBe(false)
})

test("a visitor sees no Finding on a private Topic", async () => {
	stubFindingTopic("private")
	stubAccess({ isAdmin: true })
	expect(await isTopicFindingVisible(null, "finding-1")).toBe(false)
})

test("an admin sees a Finding on an invite Topic before any subscription", async () => {
	stubFindingTopic("invite")
	spyOn(topicPermissions, "subscriptionActivatedAt").mockResolvedValue(null)
	stubAccess({ isAdmin: true })
	expect(await isTopicFindingVisible("admin-1", "finding-1")).toBe(true)
})
