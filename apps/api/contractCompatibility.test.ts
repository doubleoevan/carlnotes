// the frozen 0.1.0 contracts still hold on the live routes: each fixture's request satisfies the frozen request
// schemas, goes through its route in-process as its user over the stubbed pool and Redis, comes back 2xx, and
// has a body the frozen response schema accepts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { API_ROUTE_CONTRACTS } from "@carlnotes/contracts/apiRouteContracts"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020"
import { apiRoute } from "./api"
import { CONTRACT_FIXTURES, type ContractFixture } from "./contractFixtures"
import { signInAs, toSignedInApp } from "./testSession"

// a frozen route: its request part schemas and its response schema, as the freeze wrote them
type FrozenRoute = {
	request: Partial<Record<"params" | "query" | "body", object>>
	response?: object
}

// the frozen snapshot's routes by registry key
const frozenRoutes = ((await Bun.file("contracts/0.1.0.json").json()) as { routes: Record<string, FrozenRoute> }).routes

// the validator options. the freeze writes zod's startsWith as the format starts_with beside the pattern that checks
// it. the format itself checks nothing
const AJV_OPTIONS = { allErrors: true, strict: false, formats: { starts_with: true } } as const

// the validator of a json body or a response, and the one of the params and the query, which travel as strings and
// are coerced the way the route's own schema coerces them
const jsonAjv = new Ajv2020(AJV_OPTIONS)
const stringAjv = new Ajv2020({ ...AJV_OPTIONS, coerceTypes: true })

// each schema compiles once
const validatorBySchema = new WeakMap<object, ValidateFunction>()

// the auth secret that signs the app sign-up challenge and the podcast cover urls, set for each test and put back after
let savedAuthSecret: string | undefined

beforeEach(() => {
	savedAuthSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	stubRedisClient()
})

afterEach(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
	restoreConnectionPool()
	restoreRedisClient()
})

// the schema's errors on the data, each naming the key and the part, or none. validate the params and the query on a
// copy. coercion writes the coerced values back
function toSchemaErrors(key: string, part: string, schema: object, data: unknown): string[] {
	// the compiled validator, compiled on the schema's first use
	const ajv = part === "params" || part === "query" ? stringAjv : jsonAjv
	const validate = validatorBySchema.get(schema) ?? ajv.compile(schema)
	validatorBySchema.set(schema, validate)
	return validate(structuredClone(data)) ? [] : [`${key} ${part}: ${ajv.errorsText(validate.errors)}`]
}

// the path the fixture's request takes: the contract's path with its params filled in and its query added, after the
// /api base for a route of the api tree itself and without it for a route mounted on the tree
function toRequestPath(contractPath: string, fixture: ContractFixture): string {
	const path = contractPath.replace(/:(\w+)/g, (_, paramName: string) => fixture.request.params?.[paramName] ?? "")
	const query = new URLSearchParams(fixture.request.query).toString()
	return `${fixture.route === apiRoute ? path : path.replace(/^\/api/, "")}${query ? `?${query}` : ""}`
}

// the request's method, with its body as json if it has one
function toRequestInit(method: string, body: unknown): RequestInit {
	return body === undefined
		? { method }
		: { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
}

test("every contract fixture names a registry entry", () => {
	const unknownKeys = Object.keys(CONTRACT_FIXTURES).filter((key) => !(key in API_ROUTE_CONTRACTS))
	expect(unknownKeys).toEqual([])
})

// one test per fixture
for (const [key, fixture] of Object.entries(CONTRACT_FIXTURES)) {
	const contract = API_ROUTE_CONTRACTS[key]
	const frozenRoute = frozenRoutes[key]
	if (!contract) {
		continue
	}
	test(`${key} accepts its frozen request and responds in the frozen shape`, async () => {
		// the frozen request schemas accept the fixture's request
		const requestErrors = (["params", "query", "body"] as const).flatMap((part) => {
			const schema = frozenRoute?.request[part]
			return schema ? toSchemaErrors(key, part, schema, fixture.request[part] ?? {}) : []
		})
		expect(requestErrors).toEqual([])

		// the route handles the request in-process, as the fixture's user
		stubConnectionPool(fixture.toQueryRows)
		signInAs(fixture.userId)
		const app =
			fixture.userId && fixture.route !== apiRoute ? toSignedInApp(fixture.route, fixture.userId) : fixture.route
		const response = await app.request(
			toRequestPath(contract.path, fixture),
			toRequestInit(contract.method, fixture.request.body),
		)
		const responseText = await response.text()

		// a status outside 2xx fails with the body, which names the rejection
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`${key} responded ${response.status}: ${responseText}`)
		}

		// the body satisfies the frozen response schema. a key the snapshot does not hold, a route with no json
		// response, and a stream, whose lines are not one json body, end at the status
		if (!frozenRoute?.response || !contract.response || contract.stream) {
			return
		}
		expect(toSchemaErrors(key, "response", frozenRoute.response, JSON.parse(responseText))).toEqual([])
	})
}
