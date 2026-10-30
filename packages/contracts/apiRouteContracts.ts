// the route contracts the contract freeze serializes: for each api client capability the app reaches, keyed as the
// client parity check names it, the method, the Hono path, and the request and response schemas. a function that
// calls two routes has a second entry with a `#` suffix.

import type { z } from "zod"
import { accountRouteContracts } from "./accountRouteContracts"
import { chatRouteContracts } from "./chatRouteContracts"
import { podcastRouteContracts } from "./podcastRouteContracts"
import { teamRouteContracts } from "./teamRouteContracts"
import { topicRouteContracts } from "./topicRouteContracts"

// how a route's body travels: json, a multipart form, or none
export type ApiRouteBody = { json: z.ZodType } | { multipart: z.ZodType }

// one route the app calls. a helper that calls no route has no entry
export type ApiRouteContract = {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
	// the Hono path with its `:param` names, under /api
	path: string
	params?: z.ZodType
	query?: z.ZodType
	body?: ApiRouteBody
	// the json body a 2xx carries, the schema of each line or event of a stream, or nothing for a binary or empty body
	response?: z.ZodType
	stream?: "ndjson" | "sse"
}

// the capabilities that are helpers over the client, not routes: the freeze skips them
export const API_ROUTE_HELPERS: readonly string[] = [
	"apiClient.apiClient",
	"apiClient.configureApiClient",
	"apiClient.fetchApi",
	"apiClient.readApiErrorMessage",
	"apiClient.readApiResponse",
	"apiClient.showClientError",
	"apiClient.toApiUrl",
	"authClient.authClient",
	"authClient.configureAuthClient",
	"chatClient.toChatRejection",
	"clientWrite.showFailedWrite",
	"podcastEpisodeClient.isPodcastEpisodeAccessDenied",
	"teamClient.fetchLeaderTeams",
	"topicClient.readTopicGate",
	"profileClient.uploadAvatar",
	"voiceClient.toVoiceChatPage",
]

/**
 * Returns the capability key an entry belongs to: the key without its `#` route suffix.
 */
export function toCapabilityKey(entryKey: string): string {
	return entryKey.split("#", 1)[0] ?? entryKey
}

// the route contracts, one part file per area
export const API_ROUTE_CONTRACTS: Record<string, ApiRouteContract> = {
	...accountRouteContracts,
	...chatRouteContracts,
	...podcastRouteContracts,
	...teamRouteContracts,
	...topicRouteContracts,
}
