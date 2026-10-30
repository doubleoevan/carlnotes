// the compatibility rules between a frozen contract and the current one, over the JSON Schema zod emits: a response
// stays readable by an installed build when everything the current schema can produce is something the frozen schema
// accepts, and a request stays sendable when everything the frozen schema accepted is something the current schema
// accepts. both are the one question "does the accepting schema accept everything the accepted schema allows"

// the JSON Schema subset zod emits
export type JsonSchema = {
	// a value's type and literal values
	type?: string | string[]
	enum?: unknown[]
	const?: unknown
	// an object's properties and a list's items
	properties?: Record<string, JsonSchema>
	required?: string[]
	additionalProperties?: boolean | JsonSchema
	items?: JsonSchema
	// a union's options and a reference into the document's definitions
	anyOf?: JsonSchema[]
	oneOf?: JsonSchema[]
	$ref?: string
	$defs?: Record<string, JsonSchema>
	[keyword: string]: unknown
}

// one snapshot file: the app version it was frozen at, and each route's schemas
export type ContractSnapshot = {
	appVersion: string
	frozenAt: string
	routes: Record<string, SnapshotRoute>
}

// one route as the snapshot holds it
export type SnapshotRoute = {
	method: string
	path: string
	request: { params?: JsonSchema; query?: JsonSchema; body?: JsonSchema; multipart?: JsonSchema }
	response?: JsonSchema
	stream?: "ndjson" | "sse"
}

// the keywords the comparator understands. any other keyword that constrains a value fails conservatively
const KNOWN_KEYWORDS = new Set([
	"$schema",
	"$defs",
	"$ref",
	"type",
	"enum",
	"const",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"anyOf",
	"oneOf",
	"default",
	"description",
	"format",
	"pattern",
	"minimum",
	"maximum",
	"minLength",
	"maxLength",
	"minItems",
	"maxItems",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"propertyNames",
	"nullable",
	"id",
	"title",
])

type CompareOptions = {
	// the schema that has to accept, and the schema whose values it has to accept
	accepting: JsonSchema
	accepted: JsonSchema
	acceptingRoot: JsonSchema
	acceptedRoot: JsonSchema
	path: string
	// the pairs already being compared, so a cycle through $ref ends
	seen: Set<string>
}

/**
 * Returns the issues that make a current response unreadable by a build frozen on the snapshot: a required property
 * gone or optional, a type the snapshot does not accept, or an enum value the snapshot did not have.
 */
export function compareResponse(frozen: JsonSchema, current: JsonSchema): string[] {
	return compareAccepts({
		accepting: frozen,
		accepted: current,
		acceptingRoot: frozen,
		acceptedRoot: current,
		path: "",
		seen: new Set(),
	})
}

/**
 * Returns the issues that make a request the snapshot accepted unsendable now: a new required field, a narrowed
 * type, or a removed enum value.
 */
export function compareRequest(frozen: JsonSchema, current: JsonSchema): string[] {
	return compareAccepts({
		accepting: current,
		accepted: frozen,
		acceptingRoot: current,
		acceptedRoot: frozen,
		path: "",
		seen: new Set(),
	})
}

/**
 * Returns the issues between two snapshot routes: the method, path, or stream kind changed, a request part the
 * snapshot had is no longer accepted, or a response part the snapshot promised is gone or unreadable.
 */
export function compareSnapshotRoute(key: string, frozen: SnapshotRoute, current: SnapshotRoute | undefined): string[] {
	// a route the app called has to exist at the same method and path, streaming the same way
	if (!current) {
		return [`${key}: the route is gone from the registry`]
	}
	if (frozen.method !== current.method || frozen.path !== current.path) {
		return [`${key}: the route moved from ${frozen.method} ${frozen.path} to ${current.method} ${current.path}`]
	}
	// a reader that expects one stream kind cannot read another, or a plain response
	if (frozen.stream !== current.stream) {
		return [`${key}: the stream kind changed from ${frozen.stream ?? "none"} to ${current.stream ?? "none"}`]
	}

	// each request part the frozen client sent is still accepted, and the response it reads is still produced
	return [...compareRequestParts(key, frozen, current), ...compareResponsePart(key, frozen, current)]
}

// the request parts: a part the current route dropped is ignored, a new part may not require anything, and a part both
// have compares as a request
function compareRequestParts(key: string, frozen: SnapshotRoute, current: SnapshotRoute): string[] {
	const issues: string[] = []
	for (const part of ["params", "query", "body", "multipart"] as const) {
		// the two sides of one part
		const frozenPart = frozen.request[part]
		const currentPart = current.request[part]
		if (!frozenPart && currentPart && hasRequiredProperty(currentPart)) {
			issues.push(`${key}: the ${part} gained a required field the frozen client never sent`)
		}

		// a part both have compares as a request
		if (frozenPart && currentPart) {
			issues.push(...prefixIssues(key, part, compareRequest(frozenPart, currentPart)))
		}
	}
	return issues
}

// the response: gone, or compared as a response
function compareResponsePart(key: string, frozen: SnapshotRoute, current: SnapshotRoute): string[] {
	if (frozen.response && !current.response) {
		return [`${key}: the response the frozen client reads is gone`]
	}

	// a response both have compares as one, and a route with none passes
	if (frozen.response && current.response) {
		return prefixIssues(key, "response", compareResponse(frozen.response, current.response))
	}
	return []
}

// whether a schema requires any property at its top level
function hasRequiredProperty(schema: JsonSchema): boolean {
	return (schema.required ?? []).length > 0
}

// each issue with the route key and the part in front
function prefixIssues(key: string, part: string, issues: string[]): string[] {
	return issues.map((issue) => `${key} ${part}${issue}`)
}

// the one question, recursive: every value the accepted schema allows is a value the accepting schema accepts
function compareAccepts(options: CompareOptions): string[] {
	const { path, seen } = options
	const accepting = resolveRef(options.accepting, options.acceptingRoot)
	const accepted = resolveRef(options.accepted, options.acceptedRoot)

	// end a cycle, and fail on a keyword the comparator cannot read
	const seenKey = `${JSON.stringify(accepting)}|${JSON.stringify(accepted)}`
	if (seen.has(seenKey)) {
		return []
	}
	const unknownKeyword = [...Object.keys(accepting), ...Object.keys(accepted)].find(
		(keyword) => !KNOWN_KEYWORDS.has(keyword),
	)
	if (unknownKeyword) {
		return [`${path || "/"}: the comparator cannot read the keyword ${unknownKeyword}`]
	}
	const nextOptions = { ...options, seen: new Set([...seen, seenKey]) }

	// a union on either side: each accepted option needs an accepting option
	const acceptedOptions = toUnionOptions(accepted)
	const acceptingOptions = toUnionOptions(accepting)
	if (acceptedOptions || acceptingOptions) {
		return compareUnions({
			...nextOptions,
			acceptedOptions: acceptedOptions ?? [accepted],
			acceptingOptions: acceptingOptions ?? [accepting],
		})
	}

	// a schema with no constraint accepts everything
	if (isUnconstrained(accepting)) {
		return []
	}
	if (isUnconstrained(accepted)) {
		return [`${path || "/"}: the accepted side is unconstrained where the other side has a type`]
	}

	// the types, the literal values, then the structure
	const issues = compareTypes(accepting, accepted, path)
	issues.push(...compareLiterals(accepting, accepted, path))
	issues.push(...compareObjects({ ...nextOptions, accepting, accepted }))
	issues.push(...compareArrays({ ...nextOptions, accepting, accepted }))
	return issues
}

// the options of a union schema, or null for a plain one
function toUnionOptions(schema: JsonSchema): JsonSchema[] | null {
	return schema.anyOf ?? schema.oneOf ?? null
}

type CompareUnionsOptions = CompareOptions & { acceptedOptions: JsonSchema[]; acceptingOptions: JsonSchema[] }

// each accepted option is accepted by at least one accepting option
function compareUnions(options: CompareUnionsOptions): string[] {
	const issues: string[] = []
	for (const [index, acceptedOption] of options.acceptedOptions.entries()) {
		const isAccepted = options.acceptingOptions.some(
			(acceptingOption) =>
				compareAccepts({ ...options, accepting: acceptingOption, accepted: acceptedOption }).length === 0,
		)
		if (!isAccepted) {
			issues.push(`${options.path || "/"}: union option ${index} is accepted by no option of the other side`)
		}
	}
	return issues
}

// a schema that names no type, literal, or structure
function isUnconstrained(schema: JsonSchema): boolean {
	// no type and no literal
	const hasValueConstraint = schema.type !== undefined || schema.enum !== undefined || schema.const !== undefined

	// no properties and no items
	const hasStructure = schema.properties !== undefined || schema.items !== undefined
	return !hasValueConstraint && !hasStructure
}

// the accepted type set is within the accepting one. integer is within number
function compareTypes(accepting: JsonSchema, accepted: JsonSchema, path: string): string[] {
	const acceptingTypes = toTypeSet(accepting)
	const acceptedTypes = toTypeSet(accepted)

	// the first type the accepting side lacks
	for (const type of acceptedTypes) {
		if (!acceptingTypes.has(type) && !(type === "integer" && acceptingTypes.has("number"))) {
			return [`${path || "/"}: type ${type} is not accepted, the other side accepts ${[...acceptingTypes].join(" | ")}`]
		}
	}
	return []
}

// the type names a schema allows, from its type keyword or its literal
function toTypeSet(schema: JsonSchema): Set<string> {
	if (Array.isArray(schema.type)) {
		return new Set(schema.type)
	}
	if (schema.type) {
		return new Set([schema.type])
	}

	// a literal names its type by its value
	const literalValue = schema.const ?? schema.enum?.[0]
	return new Set([literalValue === null ? "null" : typeof literalValue])
}

// the accepted literal values are within the accepting ones
function compareLiterals(accepting: JsonSchema, accepted: JsonSchema, path: string): string[] {
	const acceptingValues = toLiteralValues(accepting)
	if (!acceptingValues) {
		return []
	}

	// an open value where the other side is literal
	const acceptedValues = toLiteralValues(accepted)
	if (!acceptedValues) {
		return [`${path || "/"}: any value is produced where the other side accepts only ${acceptingValues.join(", ")}`]
	}

	// the values the accepting side lacks
	const extraValues = acceptedValues.filter((value) => !acceptingValues.includes(value))
	return extraValues.length > 0 ? [`${path || "/"}: the values ${extraValues.join(", ")} are not accepted`] : []
}

// a schema's literal values, from its enum or const, as strings
function toLiteralValues(schema: JsonSchema): string[] | null {
	if (schema.enum) {
		return schema.enum.map(String)
	}
	return schema.const === undefined ? null : [String(schema.const)]
}

// the object rules: every property the accepting side requires is required on the accepted side, each shared
// property recurses, and a record's values recurse
function compareObjects(options: CompareOptions): string[] {
	const { accepting, accepted, path } = options
	if (!toTypeSet(accepting).has("object") || !toTypeSet(accepted).has("object")) {
		return []
	}

	// every required property on the accepting side is required on the accepted side
	const issues: string[] = []
	for (const requiredName of accepting.required ?? []) {
		if (!(accepted.required ?? []).includes(requiredName)) {
			issues.push(`${path}/${requiredName}: required on one side and absent or optional on the other`)
		}
	}

	// each shared property, then a record's values
	for (const [name, acceptedProperty] of Object.entries(accepted.properties ?? {})) {
		const acceptingProperty = accepting.properties?.[name]
		if (acceptingProperty) {
			issues.push(
				...compareAccepts({
					...options,
					accepting: acceptingProperty,
					accepted: acceptedProperty,
					path: `${path}/${name}`,
				}),
			)
		}
	}
	if (typeof accepting.additionalProperties === "object" && typeof accepted.additionalProperties === "object") {
		issues.push(
			...compareAccepts({
				...options,
				accepting: accepting.additionalProperties,
				accepted: accepted.additionalProperties,
				path: `${path}/*`,
			}),
		)
	}
	return issues
}

// the array rule: the items recurse
function compareArrays(options: CompareOptions): string[] {
	const { accepting, accepted, path } = options
	if (!accepting.items || !accepted.items) {
		return []
	}
	return compareAccepts({ ...options, accepting: accepting.items, accepted: accepted.items, path: `${path}/[]` })
}

// a $ref into the document's $defs, resolved, or the schema as it is
function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
	if (!schema.$ref) {
		return schema
	}
	const definitionName = schema.$ref.replace(/^#\/\$defs\//, "")
	return root.$defs?.[definitionName] ?? schema
}
