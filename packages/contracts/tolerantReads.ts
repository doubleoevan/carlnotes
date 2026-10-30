// the tolerant schema the mobile app parses a response with: a malformed list entry is dropped, an optional or
// nullable field that fails takes its default, a display enum's unknown value takes the unknown case, and everything
// else stays as strict as the contract

import { z } from "zod"
import { UNKNOWN_CASE, type UnknownCase } from "./enums"

/**
 * Returns an enum for a response field that only drives display, with the unknown case among its values.
 */
export function displayEnum<const Values extends readonly [string, ...string[]]>(
	values: Values,
): z.ZodEnum<{ [Value in Values[number] | UnknownCase]: Value }> {
	return z.enum([...values, UNKNOWN_CASE]) as z.ZodEnum<{ [Value in Values[number] | UnknownCase]: Value }>
}

// how many list and record entries the tolerant schemas dropped since the last read
let droppedEntryCount = 0

/**
 * Returns the count of entries dropped since the last call, and resets it.
 */
export function takeDroppedEntryCount(): number {
	const count = droppedEntryCount
	droppedEntryCount = 0
	return count
}

/**
 * Returns the tolerant schema of a response schema.
 */
export function toTolerantResponseSchema<Schema extends z.ZodType>(schema: Schema): z.ZodType<z.output<Schema>> {
	return toTolerantSchema(schema) as z.ZodType<z.output<Schema>>
}

// the definition fields the walk reads, by kind
type SchemaDefinition = {
	type: string
	// an object's properties and catchall, an array's element, and a wrapper's inner schema
	shape?: Record<string, z.ZodType>
	catchall?: z.ZodType
	element?: z.ZodType
	innerType?: z.ZodType
	defaultValue?: unknown
	// an enum's values, a union's options and discriminator, and a record's key and value
	entries?: Record<string, string>
	options?: z.ZodType[]
	discriminator?: string
	keyType?: z.ZodType
	valueType?: z.ZodType
	// a pipe's two ends and a lazy schema's getter
	in?: z.ZodType
	out?: z.ZodType
	getter?: () => z.ZodType
}

// walk one schema's definition and rebuild it tolerant where the rule says
function toTolerantSchema(schema: z.ZodType): z.ZodType {
	const definition = (schema as unknown as { def: SchemaDefinition }).def
	switch (definition.type) {
		// a container is rebuilt member by member
		case "object":
			return toTolerantObject(definition)
		case "array":
			return toTolerantArray(definition.element as z.ZodType)
		// a member that may be absent takes its default on a failure
		case "optional":
			return z.optional(toTolerantSchema(definition.innerType as z.ZodType)).catch(undefined)
		case "nullable":
			return z.nullable(toTolerantSchema(definition.innerType as z.ZodType)).catch(null)
		case "default":
			return toTolerantSchema(definition.innerType as z.ZodType)
				.default(definition.defaultValue)
				.catch(definition.defaultValue)
		// a display enum takes the unknown case, and a strict one stays strict
		case "enum":
			return isDisplayEnum(definition) ? schema.catch(UNKNOWN_CASE) : schema
		// a union and a record are rebuilt option by option
		case "union":
			return toTolerantUnion(definition)
		case "record":
			return toTolerantRecord(definition)
		// a readonly, a pipe, and a lazy schema wrap the tolerant schema of what they hold
		case "readonly":
			return toTolerantSchema(definition.innerType as z.ZodType).readonly()
		case "pipe":
			return z.pipe(toTolerantSchema(definition.in as z.ZodType), definition.out as z.ZodType)
		case "lazy":
			return z.lazy(() => toTolerantSchema((definition.getter as () => z.ZodType)()))

		// a primitive, a literal, a tuple, and an intersection stay as the contract wrote them
		default:
			return schema
	}
}

// an enum that declared the unknown case among its values
function isDisplayEnum(definition: SchemaDefinition): boolean {
	return Object.hasOwn(definition.entries ?? {}, UNKNOWN_CASE)
}

// an object with each property rebuilt, keeping its catchall for a loose or strict object
function toTolerantObject(definition: SchemaDefinition): z.ZodType {
	const shape = Object.fromEntries(
		Object.entries(definition.shape ?? {}).map(([key, propertySchema]) => [key, toTolerantSchema(propertySchema)]),
	)
	const objectSchema = z.object(shape)
	return definition.catchall ? objectSchema.catchall(definition.catchall) : objectSchema
}

// a list whose malformed entries are dropped and counted
function toTolerantArray(elementSchema: z.ZodType): z.ZodType {
	const tolerantElement = toTolerantSchema(elementSchema)

	// keep each entry that parses
	return z.array(z.unknown()).transform((entries) =>
		entries.flatMap((entry) => {
			const entryResult = tolerantElement.safeParse(entry)
			if (entryResult.success) {
				return [entryResult.data]
			}
			droppedEntryCount++
			return []
		}),
	)
}

// a record whose malformed values are dropped and counted, keyed as the contract keys it
function toTolerantRecord(definition: SchemaDefinition): z.ZodType {
	const tolerantValue = toTolerantSchema(definition.valueType as z.ZodType)

	// keep each value that parses
	return z.record(definition.keyType as z.ZodString, z.unknown()).transform((record) =>
		Object.fromEntries(
			Object.entries(record).flatMap(([key, value]) => {
				const valueResult = tolerantValue.safeParse(value)
				if (valueResult.success) {
					return [[key, valueResult.data]]
				}

				// count the dropped value
				droppedEntryCount++
				return []
			}),
		),
	)
}

// a union with each option rebuilt, discriminated where the contract discriminates
function toTolerantUnion(definition: SchemaDefinition): z.ZodType {
	const options = (definition.options ?? []).map(toTolerantSchema)
	if (definition.discriminator) {
		return z.discriminatedUnion(definition.discriminator, options as [z.ZodObject, ...z.ZodObject[]])
	}
	return z.union(options as [z.ZodType, ...z.ZodType[]])
}
