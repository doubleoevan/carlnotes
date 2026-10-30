// the freeze's rules: a reached capability needs an entry or a helper line, a response object is open to new
// properties, the version comes from the config's text, and two freezes of the same routes are the same snapshot
import { expect, test } from "bun:test"
import type { ApiRouteContract } from "@carlnotes/contracts/apiRouteContracts"
import { z } from "zod"
import {
	isSameSnapshot,
	toAppVersion,
	toContractSnapshot,
	toMissingSnapshotViolations,
	toSnapshotPath,
} from "./contractFreeze"

// a registry with one route and one two-route function
const CONTRACTS: Record<string, ApiRouteContract> = {
	"thingClient.fetchThing": {
		method: "GET",
		path: "/api/things/:id",
		params: z.object({ id: z.string() }),
		response: z.object({ name: z.string(), rows: z.array(z.object({ id: z.string() })) }),
	},
	"thingClient.sendThing": { method: "POST", path: "/api/things", body: { json: z.object({ name: z.string() }) } },
	"thingClient.sendThing#team": {
		method: "POST",
		path: "/api/teams/:id/things",
		body: { json: z.object({ name: z.string() }) },
	},
}

test("the snapshot holds the reached entries, both routes of a two-route function, with open response objects", () => {
	const snapshot = toContractSnapshot({
		appVersion: "1.0.0",
		frozenAt: "2026-10-29",
		reachedCapabilityKeys: ["thingClient.fetchThing", "thingClient.sendThing", "thingClient.helper"],
		contracts: CONTRACTS,
		helpers: ["thingClient.helper"],
	})
	expect(Object.keys(snapshot.routes)).toEqual([
		"thingClient.fetchThing",
		"thingClient.sendThing",
		"thingClient.sendThing#team",
	])
	const response = snapshot.routes["thingClient.fetchThing"]?.response
	expect(response?.additionalProperties).toBeUndefined()
	expect(response?.properties?.rows?.items?.additionalProperties).toBeUndefined()
	expect(response?.required).toEqual(["name", "rows"])
	expect(snapshot.routes["thingClient.sendThing"]?.request.body?.required).toEqual(["name"])
})

test("a reached capability with no entry fails the freeze", () => {
	expect(() =>
		toContractSnapshot({
			appVersion: "1.0.0",
			frozenAt: "",
			reachedCapabilityKeys: ["thingClient.unknown"],
			contracts: CONTRACTS,
			helpers: [],
		}),
	).toThrow("thingClient.unknown")
})

test("the version is read from the config's text, and the snapshot path follows it", () => {
	expect(toAppVersion('const expoConfig = {\n\tname: "CarlNotes",\n\tversion: "1.2.3",\n}')).toBe("1.2.3")
	expect(() => toAppVersion("const expoConfig = {}")).toThrow("declares no version")
	expect(toSnapshotPath("1.2.3")).toBe("contracts/1.2.3.json")
})

test("two freezes of the same routes are the same snapshot whenever they were written", () => {
	const options = {
		appVersion: "1.0.0",
		reachedCapabilityKeys: ["thingClient.fetchThing"],
		contracts: CONTRACTS,
		helpers: [],
	}
	const first = toContractSnapshot({ ...options, frozenAt: "2026-10-29" })
	const second = toContractSnapshot({ ...options, frozenAt: "2026-11-01" })
	expect(isSameSnapshot(first, second)).toBe(true)
	expect(isSameSnapshot(first, { ...second, appVersion: "1.0.1" })).toBe(false)
})

test("a declared, unretired version without a snapshot is a violation, and a retired one is not", () => {
	const releases = [
		{ version: "1.0.0", status: "released" as const, platforms: ["ios"], date: "2026-10-01" },
		{ version: "1.1.0", status: "submitted" as const, platforms: ["ios"], date: "2026-10-20" },
		{ version: "0.9.0", status: "retired" as const, platforms: ["ios"], date: "2026-09-01" },
	]
	const violations = toMissingSnapshotViolations(releases, ["1.0.0"])
	expect(violations).toHaveLength(1)
	expect(violations[0]).toContain("1.1.0 is submitted")
	expect(toMissingSnapshotViolations(releases, ["1.0.0", "1.1.0"])).toEqual([])
})
