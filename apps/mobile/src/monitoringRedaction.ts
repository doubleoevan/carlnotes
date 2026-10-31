import { redactEvent } from "@carlnotes/contracts/monitoringRedaction"
import { toReportedPath } from "@carlnotes/contracts/reportedPath"

// the optional native fields the additional client redaction removes or shapes
type MobileEvent = Omit<Parameters<typeof redactEvent>[0], "spans"> & {
	user?: unknown
	breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown> }[]
	transaction?: string
	spans?: { description?: string; data?: Record<string, unknown> }[]
}

/**
 * Applies shared event redaction, removes native user/request payloads, and filters private detail keys.
 */
export function redactMobileEvent<Event extends MobileEvent>(event: Event): Event {
	// preserve stack traces and SDK diagnostics while filtering private fields
	const redactedEvent = redactEvent(event)
	delete redactedEvent.user
	if (redactedEvent.request) {
		redactedEvent.request = { url: toSafeUrl(redactedEvent.request.url) }
	}
	if (redactedEvent.transaction) {
		redactedEvent.transaction = toSafeUrl(redactedEvent.transaction)
	}

	// filter the private keys in the attached details and the span data
	if (redactedEvent.extra) {
		redactedEvent.extra = redactDetails(redactedEvent.extra)
	}
	if (redactedEvent.contexts) {
		redactedEvent.contexts = redactDetails(redactedEvent.contexts)
	}
	if (redactedEvent.spans) {
		redactedEvent.spans = redactedEvent.spans.map((span) => ({
			...span,
			description: toSafeUrl(span.description),
			data: redactDetails(span.data),
		}))
	}

	// replace the urls and file paths in the exception messages
	if (redactedEvent.exception?.values) {
		redactedEvent.exception = {
			...redactedEvent.exception,
			values: redactedEvent.exception.values.map((exceptionValue) =>
				exceptionValue.value ? { ...exceptionValue, value: toSafeText(exceptionValue.value) } : exceptionValue,
			),
		}
	}

	// drop typed content breadcrumbs and the messages of the rest
	if (redactedEvent.breadcrumbs) {
		redactedEvent.breadcrumbs = redactedEvent.breadcrumbs
			.filter(({ category }) => !isPrivateBreadcrumbCategory(category))
			.map((breadcrumb) => ({ ...breadcrumb, message: undefined, data: redactDetails(breadcrumb.data) }))
	}
	return redactedEvent
}

/**
 * Identifies breadcrumb categories that can contain private typed content.
 */
export function isPrivateBreadcrumbCategory(category: string | undefined): boolean {
	return category === "console" || Boolean(category?.startsWith("ui."))
}

// fields that may hold private content or credentials, including nested navigation state
const PRIVATE_FIELD =
	/params|arguments|headers|cookie|authorization|token|password|email|body|content|prompt|markdown|text|transcript|device_id|installation_id|^id$/i
const URL_PATTERN = /(?:[a-z][a-z\d+.-]*:\/\/|mailto:|tel:|data:)[^\s]+/gi

// an app file path on either platform, such as a recording's cache file. FILE_PATH_START matches a value that is a
// path, and FILE_PATH_PATTERN matches each path in a text
const FILE_PATH_START = /^(?:\/private)?\/(?:var|data|storage|Users)\//
const FILE_PATH_PATTERN = /(?:\/private)?\/(?:var|data|storage|Users)\/[^\s'"]+/g

// redact nested context and span data while retaining the SDK's stack frames
function redactDetails(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!record) {
		return record
	}
	return Object.fromEntries(
		Object.entries(record)
			.filter(([key]) => !PRIVATE_FIELD.test(key))
			.map(([key, value]) => [
				key,
				typeof value === "string"
					? toSafeUrl(value)
					: value && typeof value === "object" && !Array.isArray(value)
						? redactDetails(value as Record<string, unknown>)
						: Array.isArray(value)
							? undefined
							: value,
			]),
	)
}

// shape known relative routes, and replace the urls and file paths in any other text
function toSafeUrl(value: string | undefined): string | undefined {
	if (!value) {
		return value
	}

	// a route keeps its shape, and an api path keeps its first segment
	if (value.startsWith("/") && !FILE_PATH_START.test(value)) {
		return value.startsWith("/api/")
			? `/api/${value.split("/")[2]?.split(/[?#]/)[0] ?? ":route"}`
			: toReportedPath(value)
	}

	// any other text loses its urls and file paths
	return toSafeText(value)
}

// a text with each HTTP url replaced by its origin, every other url replaced, and every file path replaced
function toSafeText(text: string): string {
	const textWithSafeUrls = text.replace(URL_PATTERN, (match) => {
		// an HTTP url keeps its origin, and any other url is replaced
		try {
			const url = new URL(match)
			return /^https?:$/.test(url.protocol) ? url.origin : "[url]"
		} catch {
			return "[url]"
		}
	})

	// then the file paths
	return textWithSafeUrls.replace(FILE_PATH_PATTERN, "[path]")
}
