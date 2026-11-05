// additive personal sources routes leave every frozen Topic representation unchanged
import { z } from "zod"
import type { ApiRouteContract } from "./apiRouteContracts"
import {
	personalSourceEntryPage,
	personalSourcesImportResult,
	personalSourceTitlePage,
	topicPersonalSources,
} from "./personalSources"
import {
	addPersonalSourcesAiAgentPayload,
	aiAgentApiKeysResponse,
	connectedAiAgentsResponse,
	createAiAgentApiKeyPayload,
	createdAiAgentApiKeyResponse,
	dismissPersonalSourcesNudgePayload,
	personalSourcesAiAgentRecommendations,
	personalSourcesConnectionNudge,
	personalSourcesEmailSetupResponse,
} from "./personalSourcesAccounts"
import {
	personalSourcesImportPayload,
	personalSourcesNumberedPageQuery,
	personalSourcesPageQuery,
} from "./personalSourcesPayloads"
import { idParam, okResponse } from "./routeShapes"

// scoped ids bind each entry and Source action to an sender-authorized Topic
const sourceParams = idParam.extend({ sourceId: z.string() })
const entryParams = idParam.extend({ entryId: z.string() })
export const personalSourcesRouteContracts: Record<string, ApiRouteContract> = {
	"personalSourcesClient.fetchPersonalSourceTitles": {
		method: "GET",
		path: "/api/topics/:id/personal-sources/sources/:sourceId/titles",
		params: sourceParams,
		query: personalSourcesPageQuery,
		response: personalSourceTitlePage,
	},
	"personalSourcesClient.fetchTopicPersonalSourcesEntries": {
		method: "GET",
		path: "/api/topics/:id/personal-sources/entries",
		params: idParam,
		query: personalSourcesNumberedPageQuery,
		response: personalSourceEntryPage,
	},
	"personalSourcesClient.fetchPersonalSourcesAiAgentRecommendations": {
		method: "GET",
		path: "/api/topics/:id/personal-sources/ai-agents/recommendations",
		params: idParam,
		response: personalSourcesAiAgentRecommendations,
	},
	"aiAgentClient.fetchPersonalSourcesConnectionNudge": {
		method: "GET",
		path: "/api/personal-sources/ai-agents/nudge",
		response: personalSourcesConnectionNudge,
	},
	"aiAgentClient.sendDismissPersonalSourcesNudge": {
		method: "POST",
		path: "/api/personal-sources/ai-agents/nudge",
		body: { json: dismissPersonalSourcesNudgePayload },
		response: okResponse,
	},
	"personalSourcesClient.sendAddPersonalSourcesAiAgent": {
		method: "POST",
		path: "/api/topics/:id/personal-sources/ai-agents",
		params: idParam,
		body: { json: addPersonalSourcesAiAgentPayload },
		response: okResponse,
	},
	"personalSourcesClient.fetchPersonalSourcesEmailSetup": {
		method: "GET",
		path: "/api/topics/:id/personal-sources/email",
		params: idParam,
		response: personalSourcesEmailSetupResponse,
	},
	"personalSourcesClient.sendImportConversations": {
		method: "POST",
		path: "/api/topics/:id/personal-sources/imports",
		params: idParam,
		body: { json: personalSourcesImportPayload },
		response: personalSourcesImportResult,
	},
	"personalSourcesClient.fetchTopicPersonalSources": {
		method: "GET",
		path: "/api/topics/:id/personal-sources",
		params: idParam,
		response: topicPersonalSources,
	},
	"personalSourcesClient.fetchPersonalSourcesEntries": {
		method: "GET",
		path: "/api/topics/:id/personal-sources/sources/:sourceId/entries",
		params: sourceParams,
		query: personalSourcesPageQuery,
		response: personalSourceEntryPage,
	},
	"personalSourcesClient.sendDeletePersonalSourceEntry": {
		method: "DELETE",
		path: "/api/topics/:id/personal-sources/entries/:entryId",
		params: entryParams,
		response: okResponse,
	},
	"personalSourcesClient.sendDeletePersonalSource": {
		method: "DELETE",
		path: "/api/topics/:id/personal-sources/sources/:sourceId",
		params: sourceParams,
		response: okResponse,
	},
	"aiAgentClient.fetchConnectedAiAgents": {
		method: "GET",
		path: "/api/personal-sources/ai-agents/connections",
		response: connectedAiAgentsResponse,
	},
	"aiAgentClient.sendRevokeAiAgent": {
		method: "DELETE",
		path: "/api/personal-sources/ai-agents/connections/:aiAgentId",
		params: z.object({ aiAgentId: z.string() }),
		response: okResponse,
	},
	"aiAgentClient.fetchAiAgentApiKeys": {
		method: "GET",
		path: "/api/personal-sources/ai-agents/keys",
		response: aiAgentApiKeysResponse,
	},
	"aiAgentClient.sendCreateAiAgentApiKey": {
		method: "POST",
		path: "/api/personal-sources/ai-agents/keys",
		body: { json: createAiAgentApiKeyPayload },
		response: createdAiAgentApiKeyResponse,
	},
	"aiAgentClient.sendRevokeAiAgentApiKey": {
		method: "DELETE",
		path: "/api/personal-sources/ai-agents/keys/:keyId",
		params: z.object({ keyId: z.string() }),
		response: okResponse,
	},
}
