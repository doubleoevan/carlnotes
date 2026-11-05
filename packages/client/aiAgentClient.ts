// account connection and one-time API key controls use the session client alone
import {
	aiAgentApiKeysResponse,
	connectedAiAgentsResponse,
	createdAiAgentApiKeyResponse,
	personalSourcesConnectionNudge,
} from "@carlnotes/contracts/personalSourcesAccounts"
import type { z } from "zod"
import { apiClient, readApiErrorMessage, readApiResponse } from "./apiClient"

/**
 * Reads the latest connected consent that the owner has not dismissed.
 */
export async function fetchPersonalSourcesConnectionNudge(): Promise<z.infer<typeof personalSourcesConnectionNudge>> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].nudge.$get()
	if (!response.ok) {
		throw new Error("Could not load the connection notice.")
	}
	return readApiResponse(personalSourcesConnectionNudge, response)
}

/**
 * Dismisses a displayed connection notice without hiding a later reconnect.
 */
export async function sendDismissPersonalSourcesNudge(consentCreatedAt: string): Promise<void> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].nudge.$post({ json: { consentCreatedAt } })
	if (!response.ok) {
		throw new Error("Could not dismiss the connection notice.")
	}
}

/**
 * Lists current AI Agent connections and disconnected retained history.
 */
export async function fetchConnectedAiAgents(): Promise<z.infer<typeof connectedAiAgentsResponse>> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].connections.$get()
	if (!response.ok) {
		throw new Error("Could not load connected AI Agents.")
	}
	return readApiResponse(connectedAiAgentsResponse, response)
}

/**
 * Revokes this account's grants for one app domain or isolated local client.
 */
export async function sendRevokeAiAgent(aiAgentId: string): Promise<void> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].connections[":aiAgentId"].$delete({
		param: { aiAgentId },
	})
	if (!response.ok) {
		throw new Error("Could not disconnect the AI Agent.")
	}
}

/**
 * Lists API key metadata without retrieving a bearer value or its digest.
 */
export async function fetchAiAgentApiKeys(): Promise<z.infer<typeof aiAgentApiKeysResponse>> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].keys.$get()
	if (!response.ok) {
		throw new Error("Could not load API keys.")
	}
	return readApiResponse(aiAgentApiKeysResponse, response)
}

/**
 * Creates one Premium key, whose returned secret must remain only in the one-time display.
 */
export async function sendCreateAiAgentApiKey(label: string): Promise<z.infer<typeof createdAiAgentApiKeyResponse>> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].keys.$post({ json: { label } })
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? "Could not create the API key.")
	}
	return readApiResponse(createdAiAgentApiKeyResponse, response)
}

/**
 * Revokes an owned key, including after the account has left Premium.
 */
export async function sendRevokeAiAgentApiKey(keyId: string): Promise<void> {
	const response = await apiClient().api["personal-sources"]["ai-agents"].keys[":keyId"].$delete({ param: { keyId } })
	if (!response.ok) {
		throw new Error("Could not revoke the API key.")
	}
}
