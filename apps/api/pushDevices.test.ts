// push device route tests: a visitor is rejected, a registration binds the token to the session and turns on the
// preferences the user never chose, a rotation removes the session's previous token, and an unregister touches only
// the caller's own session
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import type { AppEnv } from "./currentUser"
import { pushDevicesRoute } from "./pushDevices"
import * as sessions from "./sessions"
import { toJsonRequest, toSignedInApp } from "./testSession"

// put the spied session refresh and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a phone's registration as the app sends it
const registration = { expoPushToken: "ExponentPushToken[phone-a]", platform: "ios", appVersion: "0.2.0" }

// a request with the given method and json body
function toJsonRequestWithMethod(method: string, body: unknown): RequestInit {
	return { ...toJsonRequest(body), method }
}

// the push routes with the given session user, or a visitor for null, and that user's session
function toPushDevicesApp(sessionUser: ({ id: string } & Record<string, unknown>) | null): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use(async (context, next) => {
			// the user and their session's id, as the api's session middleware sets them
			context.set("user", sessionUser as never)
			context.set("sessionId", sessionUser ? `session-${sessionUser.id}` : null)
			await next()
		})
		.route("/", pushDevicesRoute)
}

// a visitor can neither register nor unregister, and nothing is written
test("a visitor's registration and unregister are rejected", async () => {
	// an app with no session
	const sentQueries = stubConnectionPool(() => [])
	const visitorApp = toPushDevicesApp(null)

	// both requests are unauthorized and send no query
	expect((await visitorApp.request("/push-devices", toJsonRequest(registration))).status).toBe(401)
	expect((await visitorApp.request("/push-devices", toJsonRequestWithMethod("DELETE", registration))).status).toBe(401)
	expect(sentQueries).toHaveLength(0)
})

// a token that is not Expo's is rejected before anything is written
test("a registration with a malformed token is rejected", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const response = await toSignedInApp(pushDevicesRoute, "user-1").request(
		"/push-devices",
		toJsonRequest({ ...registration, expoPushToken: "raw-fcm-token" }),
	)
	expect(response.status).toBe(400)
	expect(sentQueries).toHaveLength(0)
})

// the first registration binds the token to the session and account, and the preference change rewrites the sessions
test("a first registration binds the session and turns the preferences on", async () => {
	// the preference update changes the user's row
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue()
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith('update "users"') ? [["user-1"]] : []))
	const response = await toSignedInApp(pushDevicesRoute, "user-1").request("/push-devices", toJsonRequest(registration))
	expect(response.status).toBe(200)

	// the upsert moves the token to this account and session, which is how a second account takes a phone over
	const upsertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "push_devices"'))
	expect(upsertQuery?.text).toContain('on conflict ("expo_push_token") do update set "user_id" = $')
	expect(upsertQuery?.values).toContain("ExponentPushToken[phone-a]")
	expect(upsertQuery?.values).toContain("user-1")
	expect(upsertQuery?.values).toContain("session-user-1")

	// only a preference that is still null turns on
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(updateQuery?.text).toContain('coalesce("users"."is_topic_push_enabled", true)')
	expect(updateQuery?.text).toContain('coalesce("users"."is_chat_mention_push_enabled", true)')

	// the account keeps its phones seen most recently, and retires the rest
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "push_devices"'))
	expect(deleteQuery?.text).toContain('"push_devices"."id" not in (select "id" from "push_devices"')
	expect(deleteQuery?.text).toContain('order by "push_devices"."last_seen_at" desc limit $')
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// a later registration with both preferences chosen leaves the sessions alone
test("a registration with both preferences chosen does not rewrite the sessions", async () => {
	// a quiet session refresh and query log
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue()
	const sentQueries = stubConnectionPool(() => [])

	// an app whose session user chose both kinds
	const chosenApp = toPushDevicesApp({ id: "user-1", isTopicPushEnabled: true, isChatMentionPushEnabled: false })

	// the phone binds, and neither the users row nor the sessions are written
	await chosenApp.request("/push-devices", toJsonRequest(registration))
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "users"'))).toBe(false)
	expect(refreshSessionUserSpy).not.toHaveBeenCalled()
})

// a rotated token removes the previous token's row for this session only, before the new one is bound
test("a rotation removes the session's previous token", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await toSignedInApp(pushDevicesRoute, "user-1").request(
		"/push-devices",
		toJsonRequest({ ...registration, previousExpoPushToken: "ExponentPushToken[phone-old]" }),
	)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "push_devices"'))
	expect(deleteQuery?.values).toEqual(["ExponentPushToken[phone-old]", "session-user-1"])
})

// an unregister deletes the token only where this session registered it
test("an unregister names the caller's own session", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const response = await toSignedInApp(pushDevicesRoute, "user-1").request(
		"/push-devices",
		toJsonRequestWithMethod("DELETE", { expoPushToken: "ExponentPushToken[phone-a]" }),
	)
	expect(response.status).toBe(200)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "push_devices"'))
	expect(deleteQuery?.text).toContain('"push_devices"."session_id" = $2')
	expect(deleteQuery?.values).toEqual(["ExponentPushToken[phone-a]", "session-user-1"])
})

// a switch saves its one kind to the row and rewrites the sessions
test("a push preference saves one kind and refreshes the sessions", async () => {
	// the topic switch turned off
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue()
	const sentQueries = stubConnectionPool(() => [])
	const response = await toSignedInApp(pushDevicesRoute, "user-1").request(
		"/users/me/push-preferences",
		toJsonRequest({ kind: "topic-scan", isEnabled: false }),
	)
	expect(response.status).toBe(200)

	// only the topic column is written, and the sessions are refreshed
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(updateQuery?.text).toContain('"is_topic_push_enabled" = $1')
	expect(updateQuery?.text).not.toContain("is_chat_mention_push_enabled")
	expect(updateQuery?.values?.[0]).toBe(false)
	expect(updateQuery?.values?.at(-1)).toBe("user-1")
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// a visitor cannot save a switch
test("a visitor's push preference is rejected", async () => {
	// an app with no session
	const sentQueries = stubConnectionPool(() => [])
	const visitorApp = toPushDevicesApp(null)

	// the request is unauthorized and sends no query
	const response = await visitorApp.request(
		"/users/me/push-preferences",
		toJsonRequest({ kind: "chat-mention", isEnabled: true }),
	)
	expect(response.status).toBe(401)
	expect(sentQueries).toHaveLength(0)
})
