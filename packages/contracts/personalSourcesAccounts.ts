// account controls expose connection and credential metadata without bearer secrets
import { z } from "zod"

// connection labels derive from registrations, while concrete ids remain available for Topic setup
const connectedAiAgent = z.object({
	id: z.string(),
	label: z.string(),
	domain: z.string().nullable(),
	clientIds: z.array(z.string()),
	isConnected: z.boolean(),
	consentCreatedAt: z.iso.datetime().nullable(),
})
export const connectedAiAgentsResponse = z.object({ aiAgents: z.array(connectedAiAgent) })
const aiAgentApiKey = z.object({
	id: z.string(),
	label: z.string(),
	lastFour: z.string(),
	createdAt: z.iso.datetime(),
	lastUsedAt: z.iso.datetime().nullable(),
	revokedAt: z.iso.datetime().nullable(),
})
export const aiAgentApiKeysResponse = z.object({ keys: z.array(aiAgentApiKey), canCreate: z.boolean() })
export const createAiAgentApiKeyPayload = z.strictObject({ label: z.string().trim().min(1).max(80) })
export const createdAiAgentApiKeyResponse = z.object({ key: aiAgentApiKey, secret: z.string() })
export const addPersonalSourcesAiAgentPayload = z.strictObject({ clientId: z.string().min(1).max(2048) })
export const personalSourcesConnectionNudge = z.object({ consentCreatedAt: z.iso.datetime().nullable() })
export const personalSourcesAiAgentRecommendations = z.object({ aiAgentIds: z.array(z.string()) })
export const dismissPersonalSourcesNudgePayload = z.strictObject({ consentCreatedAt: z.iso.datetime() })
export const personalSourcesEmailSetupResponse = z.object({
	topicName: z.string(),
	address: z.email().nullable(),
	canReceive: z.boolean(),
})
export type ConnectedAiAgent = z.infer<typeof connectedAiAgent>
export type AiAgentApiKey = z.infer<typeof aiAgentApiKey>
export type PersonalSourcesEmailSetupResponse = z.infer<typeof personalSourcesEmailSetupResponse>
