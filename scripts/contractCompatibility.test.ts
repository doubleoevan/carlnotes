// the compatibility rules: what an installed reader survives and what breaks it, and what an old sender may still send
import { expect, test } from "bun:test"
import {
	compareRequest,
	compareResponse,
	compareSnapshotRoute,
	type JsonSchema,
	type SnapshotRoute,
} from "./contractCompatibility"

// an object schema whose properties and required list are present, so a test edits them without a null check
type ObjectSchema = JsonSchema & { properties: Record<string, JsonSchema>; required: string[] }

// a frozen response: a required name, an optional summary, a status enum, a list, and a record
const FROZEN_RESPONSE: ObjectSchema = {
	type: "object",
	properties: {
		name: { type: "string" },
		summary: { type: ["string", "null"] },
		status: { type: "string", enum: ["running", "done"] },
		count: { type: "number" },
		rows: { type: "array", items: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
		counts: { type: "object", propertyNames: { type: "string" }, additionalProperties: { type: "number" } },
	},
	required: ["name", "status", "count", "rows", "counts"],
}

// a copy of the frozen response with one change applied
function withChange(change: (schema: ObjectSchema) => void): JsonSchema {
	const schema = structuredClone(FROZEN_RESPONSE)
	change(schema)
	return schema
}

// one property of the frozen response, present in every test that edits it
function toProperty(schema: ObjectSchema, name: string): ObjectSchema {
	return schema.properties[name] as ObjectSchema
}

test("an unchanged response, a new property, and a narrowed type pass", () => {
	expect(compareResponse(FROZEN_RESPONSE, FROZEN_RESPONSE)).toEqual([])
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				s.properties.extra = { type: "boolean" }
				s.required.push("extra")
			}),
		),
	).toEqual([])
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				s.properties.count = { type: "integer" }
			}),
		),
	).toEqual([])
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				s.properties.summary = { type: "string" }
			}),
		),
	).toEqual([])
})

test("a removed required field, a changed type, and an extended enum fail", () => {
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				delete s.properties.name
				s.required = s.required.filter((n) => n !== "name")
			}),
		)[0],
	).toContain("/name")
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				s.required = s.required.filter((n) => n !== "name")
			}),
		)[0],
	).toContain("/name")
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				s.properties.count = { type: "string" }
			}),
		)[0],
	).toContain("/count: type string")
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				toProperty(s, "status").enum?.push("paused")
			}),
		)[0],
	).toContain("paused")
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				;(toProperty(s, "rows").items as ObjectSchema).required = []
			}),
		)[0],
	).toContain("/rows/[]/id")
	expect(
		compareResponse(
			FROZEN_RESPONSE,
			withChange((s) => {
				toProperty(s, "counts").additionalProperties = { type: "string" }
			}),
		)[0],
	).toContain("/counts/*")
})

test("a union option the snapshot never produced fails, and a dropped option passes", () => {
	const frozen: JsonSchema = {
		oneOf: [
			{ type: "object", properties: { t: { const: "a" } }, required: ["t"] },
			{ type: "object", properties: { t: { const: "b" } }, required: ["t"] },
		],
	}
	const added: JsonSchema = {
		oneOf: [...(frozen.oneOf as JsonSchema[]), { type: "object", properties: { t: { const: "c" } }, required: ["t"] }],
	}
	const dropped: JsonSchema = { oneOf: (frozen.oneOf ?? []).slice(0, 1) }
	expect(compareResponse(frozen, added)[0]).toContain("union option 2")
	expect(compareResponse(frozen, dropped)).toEqual([])
})

test("a request keeps accepting what the snapshot accepted", () => {
	const frozen: JsonSchema = {
		type: "object",
		properties: { q: { type: "string" }, kind: { type: "string", enum: ["a", "b"] } },
		required: ["q"],
	}
	// a new optional field, a widened type, and a new enum value pass
	expect(compareRequest(frozen, { ...frozen, properties: { ...frozen.properties, page: { type: "number" } } })).toEqual(
		[],
	)
	expect(
		compareRequest(frozen, {
			...frozen,
			properties: { ...frozen.properties, kind: { type: "string", enum: ["a", "b", "c"] } },
		}),
	).toEqual([])
	// a new required field, a narrowed type, and a removed enum value fail
	expect(
		compareRequest(frozen, {
			...frozen,
			properties: { ...frozen.properties, page: { type: "number" } },
			required: ["q", "page"],
		})[0],
	).toContain("/page")
	expect(
		compareRequest(frozen, { ...frozen, properties: { ...frozen.properties, q: { type: "string", enum: ["x"] } } })[0],
	).toContain("/q")
	expect(
		compareRequest(frozen, {
			...frozen,
			properties: { ...frozen.properties, kind: { type: "string", enum: ["a"] } },
		})[0],
	).toContain("b")
})

test("a route compares its method, path, stream kind, each request part, and its response", () => {
	const frozen: SnapshotRoute = {
		method: "POST",
		path: "/api/things",
		request: { body: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
		response: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
	}
	expect(compareSnapshotRoute("thingClient.create", frozen, frozen)).toEqual([])
	expect(compareSnapshotRoute("thingClient.create", frozen, undefined)[0]).toContain("gone from the registry")
	expect(compareSnapshotRoute("thingClient.create", frozen, { ...frozen, path: "/api/items" })[0]).toContain("moved")
	expect(compareSnapshotRoute("thingClient.create", frozen, { ...frozen, stream: "sse" })[0]).toContain(
		"stream kind changed from none to sse",
	)
	expect(compareSnapshotRoute("thingClient.create", { ...frozen, stream: "ndjson" }, frozen)[0]).toContain(
		"stream kind changed from ndjson to none",
	)
	expect(
		compareSnapshotRoute("thingClient.create", frozen, {
			...frozen,
			request: {
				body: {
					type: "object",
					properties: { name: { type: "string" }, size: { type: "number" } },
					required: ["name", "size"],
				},
			},
		})[0],
	).toContain("body/size")
	expect(
		compareSnapshotRoute("thingClient.create", frozen, {
			...frozen,
			request: {
				...frozen.request,
				query: { type: "object", properties: { page: { type: "number" } }, required: ["page"] },
			},
		})[0],
	).toContain("gained a required field")
	expect(compareSnapshotRoute("thingClient.create", frozen, { ...frozen, response: undefined })[0]).toContain(
		"response the frozen client reads is gone",
	)
})

test("a keyword the comparator cannot read fails conservatively", () => {
	expect(compareResponse({ type: "string" }, { type: "string", not: { const: "x" } })[0]).toContain(
		"cannot read the keyword not",
	)
})
