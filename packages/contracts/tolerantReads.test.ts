import { beforeEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { UNKNOWN_CASE } from "./enums"
import { displayEnum, takeDroppedEntryCount, toTolerantResponseSchema } from "./tolerantReads"

// a contract with a list, an optional and a nullable field, a display enum, a strict enum, a record, and a
// discriminated union
const frequency = displayEnum(["daily", "weekly"])
const role = z.enum(["leader", "member"])
const finding = z.object({ id: z.string(), summary: z.string().nullable(), note: z.string().optional() })
const response = z.object({
	name: z.string(),
	frequency,
	role,
	findings: z.array(finding),
	counts: z.record(z.string(), z.number()),
	canEdit: z.boolean(),
	gate: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("open") }),
		z.object({ kind: z.literal("invite"), topicName: z.string().nullable() }),
	]),
	limit: z.number().default(5),
})
const tolerantResponse = toTolerantResponseSchema(response)

// a response every rule leaves alone
const wellFormed = {
	name: "Coffee",
	frequency: "daily",
	role: "member",
	findings: [{ id: "f1", summary: "A summary", note: "a note" }],
	counts: { views: 3 },
	canEdit: false,
	gate: { kind: "invite", topicName: null },
	limit: 10,
}

// each test counts its own dropped entries
beforeEach(() => {
	takeDroppedEntryCount()
})

describe("toTolerantResponseSchema", () => {
	test("a well formed response parses as the contract parses it", () => {
		expect(tolerantResponse.parse(wellFormed)).toEqual(response.parse(wellFormed))
		expect(takeDroppedEntryCount()).toBe(0)
	})

	test("a malformed list entry is dropped and counted, and the rest render", () => {
		const parsed = tolerantResponse.parse({
			...wellFormed,
			findings: [{ id: "f1", summary: null }, { summary: "no id" }, { id: "f3", summary: "kept" }],
		})
		expect(parsed.findings.map((entry) => entry.id)).toEqual(["f1", "f3"])
		expect(takeDroppedEntryCount()).toBe(1)
	})

	test("an unknown display value takes the unknown case", () => {
		expect(tolerantResponse.parse({ ...wellFormed, frequency: "hourly" }).frequency).toBe(UNKNOWN_CASE)
		expect(() => response.parse({ ...wellFormed, frequency: "hourly" })).toThrow()
	})

	test("a strict enum and a permission flag stay strict", () => {
		expect(() => tolerantResponse.parse({ ...wellFormed, role: "owner" })).toThrow()
		expect(() => tolerantResponse.parse({ ...wellFormed, canEdit: "yes" })).toThrow()
		expect(() => tolerantResponse.parse({ ...wellFormed, canEdit: undefined })).toThrow()
	})

	test("an optional, a nullable, and a defaulted field that fail take their defaults", () => {
		const parsed = tolerantResponse.parse({
			...wellFormed,
			findings: [{ id: "f1", summary: 7, note: 9 }],
			limit: "ten",
		})
		expect(parsed.findings[0]).toEqual({ id: "f1", summary: null })
		expect(parsed.limit).toBe(5)
		expect(takeDroppedEntryCount()).toBe(0)
	})

	test("a required field that fails fails the response", () => {
		expect(() => tolerantResponse.parse({ ...wellFormed, name: 4 })).toThrow()
	})

	test("a record drops its malformed values", () => {
		const parsed = tolerantResponse.parse({ ...wellFormed, counts: { views: 3, listens: "many" } })
		expect(parsed.counts).toEqual({ views: 3 })
		expect(takeDroppedEntryCount()).toBe(1)
	})

	test("a discriminated union is rebuilt option by option", () => {
		expect(tolerantResponse.parse({ ...wellFormed, gate: { kind: "invite", topicName: 3 } }).gate).toEqual({
			kind: "invite",
			topicName: null,
		})
		expect(() => tolerantResponse.parse({ ...wellFormed, gate: { kind: "closed" } })).toThrow()
	})
})

describe("displayEnum", () => {
	test("adds the unknown case to the values and the type", () => {
		expect(frequency.options).toEqual(["daily", "weekly", UNKNOWN_CASE])
		const value: z.infer<typeof frequency> = UNKNOWN_CASE
		expect(frequency.parse(value)).toBe(UNKNOWN_CASE)
	})
})
