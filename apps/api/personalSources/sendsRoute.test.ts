import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import * as sends from "@carlnotes/pipeline/personalSources/send"
import { Hono } from "hono"
import { DEFAULT_BODY_LIMIT_BYTES, defaultBodyLimit } from "../bodyLimit"
import type { AppEnv } from "../currentUser"
import { personalSourcesSendsRoute } from "./sendsRoute"

// mount the real adapter behind the same default request-body bound as the API
const app = new Hono<AppEnv>().use("*", defaultBodyLimit).route("/", personalSourcesSendsRoute)
const payload = {
	topic_id: "topic",
	title: "Selected summary",
	summary: "Private context",
	links: [],
	request_id: "retry-1",
}
const secret = `cnk_v1_${"a".repeat(32)}_${"b".repeat(43)}`
afterEach(() => mock.restore())

test("a session or ordinary bearer token cannot act as a send-only key", async () => {
	const send = spyOn(sends, "sendToPersonalSources")
	for (const authorization of ["", "Bearer ordinary-token", "Basic cnk_v1_example", "Bearer cnk_v1_bad.secret"]) {
		const response = await app.request("/personal-sources/sends", request(payload, authorization))
		expect(response.status).toBe(401)
		expect(response.headers.get("cache-control")).toBe("no-store")
	}
	expect(send).not.toHaveBeenCalled()
})

test("the HTTP adapter preserves accepted, choice, quota, revocation, conflict, and failure outcomes", async () => {
	const outcomes: [PersonalSourcesSendResult, number][] = [
		[
			{
				status: "accepted",
				entryId: "entry",
				title: "Selected summary",
				queuedLinkCount: 0,
				topic: { id: "topic", name: "Personal", url: "https://carlnotes.com/topics/topic" },
			},
			200,
		],
		[{ status: "quota", resetAt: "2026-11-03T00:00:00.000Z" }, 429],
		[{ status: "disconnected" }, 401],
		[{ status: "not_found" }, 404],
		[{ status: "conflict", reason: "removed" }, 409],
		[{ status: "conflict", reason: "retry_mismatch" }, 409],
		[{ status: "unavailable", reason: "disabled" }, 503],
	]
	const send = spyOn(sends, "sendToPersonalSources")

	// every outcome returns its own status and is never cached
	for (const [outcome, status] of outcomes) {
		send.mockResolvedValueOnce(outcome)
		const response = await app.request("/personal-sources/sends", request(payload))
		expect(response.status).toBe(status)
		expect(response.headers.get("cache-control")).toBe("no-store")
		expect(await response.json()).toEqual(outcome)
	}
	expect(send).toHaveBeenLastCalledWith({
		sender: { kind: "api_key", secret },
		payload,
		analyticsProperties: { entryPoint: "api" },
	})
})

test("invalid payloads and oversized bodies stop before any persistence or matching call", async () => {
	const send = spyOn(sends, "sendToPersonalSources")
	for (const invalidPayload of [
		{ ...payload, topic_id: undefined },
		{ ...payload, userId: "different-owner" },
		{ ...payload, summary: "x".repeat(2001) },
		{ ...payload, links: ["http://127.0.0.1/private"] },
		{ ...payload, chat_url: "https://example.com/private", links: ["https://example.com/private"] },
	]) {
		expect((await app.request("/personal-sources/sends", request(invalidPayload))).status).toBe(400)
	}
	const oversized = { ...payload, summary: "x".repeat(DEFAULT_BODY_LIMIT_BYTES) }
	expect((await app.request("/personal-sources/sends", request(oversized))).status).toBe(413)
	expect(send).not.toHaveBeenCalled()
})

// all fixtures use synthetic credentials and never reach a provider
function request(body: unknown, authorization = `Bearer ${secret}`): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json", authorization }, body: JSON.stringify(body) }
}
