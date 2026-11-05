// real OAuth rows exercise live-grant predicates and user-scoped domain revocation
import { db } from "@carlnotes/db"
import { loadConnectedAiAgents, loadLiveAiAgent, revokeConnectedAiAgent } from "@carlnotes/db/aiAgentConnections"
import { sources } from "@carlnotes/db/schema/topics"
import { oauthClients, oauthConsents, oauthRefreshTokens } from "@carlnotes/db/schema/users"
import { appUrl } from "@carlnotes/server/appUrl"
import { checkPersonalSources, seedPersonalSourcesTopic } from "./personalSourcesSmokeFixtures"

// fixtures vary one live-grant predicate while leaving the other authority rows valid
type AiAgentFixture = {
	userId: string
	label: string
	disabled?: boolean
	wrongResource?: boolean
	expired?: boolean
	revoked?: boolean
	rotated?: boolean
	consentUserId?: string
	grantUserId?: string
	redirectOrigin?: string
}

/**
 * Refuses revoked, expired, disabled, wrong-user/resource, rotated-only, and spoofed-name registrations.
 */
export async function checkPersonalSourcesAiAgentGrants(): Promise<void> {
	const owner = await seedPersonalSourcesTopic("oauth-owner")
	const other = await seedPersonalSourcesTopic("oauth-other")
	const validClientId = await seedAiAgentGrant({ userId: owner.userId, label: "valid" })
	checkPersonalSources(
		"a live MCP grant resolves the verified client domain",
		(await loadLiveAiAgent({ userId: owner.userId, clientId: validClientId }))?.label === "Claude",
	)
	for (const fixture of [
		{ label: "revoked", revoked: true },
		{ label: "expired", expired: true },
		{ label: "disabled", disabled: true },
		{ label: "wrong-resource", wrongResource: true },
		{ label: "rotated", rotated: true },
		{ label: "wrong-consent-user", consentUserId: other.userId },
		{ label: "wrong-grant-user", grantUserId: other.userId },
	]) {
		const clientId = await seedAiAgentGrant({ ...fixture, userId: owner.userId })
		checkPersonalSources(
			`${fixture.label} cannot establish send identity`,
			(await loadLiveAiAgent({ userId: owner.userId, clientId })) === null,
		)
	}
	const spoofId = await seedAiAgentGrant({
		userId: owner.userId,
		label: "name-spoof",
		redirectOrigin: "https://unknown.example",
	})
	checkPersonalSources(
		"an advertised Claude name cannot spoof another registered domain",
		(await loadLiveAiAgent({ userId: owner.userId, clientId: spoofId }))?.label === "unknown.example",
	)

	// both accounts share one registered app, but each has its own consent and refresh grant
	await insertGrant({ userId: other.userId, clientId: validClientId })
	const secondClientId = await seedAiAgentGrant({ userId: owner.userId, label: "same-domain" })
	const groups = await loadConnectedAiAgents(owner.userId)
	const claudeGroup = groups.find((group) => group.id === "domain:claude.ai")
	checkPersonalSources(
		"multiple valid registrations form one app group",
		Boolean(claudeGroup?.clientIds.includes(validClientId) && claudeGroup.clientIds.includes(secondClientId)),
	)
	await db.insert(sources).values({
		topicId: owner.topicId,
		kind: "ai_agent",
		personalSourcesUserId: owner.userId,
		personalSourcesIdentity: `oauth:${validClientId}`,
		config: { delivery: "oauth", clientId: validClientId, appDomain: "claude.ai" },
		status: "ready",
	})
	await revokeConnectedAiAgent({ userId: owner.userId, aiAgentId: "domain:claude.ai" })
	// a second sender's disconnected registration on this Topic belongs only to that sender
	await db.insert(sources).values({
		topicId: owner.topicId,
		kind: "ai_agent",
		personalSourcesUserId: other.userId,
		personalSourcesIdentity: "oauth:private-other-agent",
		config: { delivery: "oauth", clientId: "private-other-agent", appDomain: "other-agent.example" },
		status: "ready",
	})
	checkPersonalSources(
		"a Topic owner cannot discover another sender's agent history",
		!(await loadConnectedAiAgents(owner.userId)).some((aiAgent) => aiAgent.id === "domain:other-agent.example") &&
			(await loadConnectedAiAgents(other.userId)).some((aiAgent) => aiAgent.id === "domain:other-agent.example"),
	)
	checkPersonalSources(
		"group revocation immediately refuses every registration's sends",
		(await loadLiveAiAgent({ userId: owner.userId, clientId: validClientId })) === null &&
			(await loadLiveAiAgent({ userId: owner.userId, clientId: secondClientId })) === null,
	)
	checkPersonalSources(
		"group revocation preserves another user's grants",
		(await loadLiveAiAgent({ userId: other.userId, clientId: validClientId })) !== null,
	)
	checkPersonalSources(
		"retained Source history remains visible as disconnected",
		(await loadConnectedAiAgents(owner.userId)).some(
			(aiAgent) => aiAgent.id === "domain:claude.ai" && !aiAgent.isConnected,
		),
	)
}

// client registration metadata never uses the advertised name as its identity
async function seedAiAgentGrant(fixture: AiAgentFixture): Promise<string> {
	const clientId = `${fixture.userId}-${fixture.label}`
	await db.insert(oauthClients).values({
		clientId,
		userId: fixture.userId,
		name: "Claude",
		disabled: fixture.disabled ?? false,
		redirectUris: [`${fixture.redirectOrigin ?? "https://claude.ai"}/callback`],
	})
	await insertGrant({ ...fixture, clientId })
	return clientId
}

// no real token is generated or sent, and account deletion cascades all fixture grants
async function insertGrant(
	fixture: (AiAgentFixture & { clientId: string }) | { userId: string; clientId: string },
): Promise<void> {
	const options = fixture as AiAgentFixture & { clientId: string }
	const resource = options.wrongResource ? "https://wrong.example/mcp" : `${appUrl()}/mcp`
	await db.insert(oauthConsents).values({
		userId: options.consentUserId ?? options.userId,
		clientId: options.clientId,
		resources: [resource],
		scopes: ["openid", "offline_access"],
		createdAt: new Date(),
	})
	await db.insert(oauthRefreshTokens).values({
		userId: options.grantUserId ?? options.userId,
		clientId: options.clientId,
		token: crypto.randomUUID(),
		resources: [resource],
		scopes: ["openid", "offline_access"],
		expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 3_600_000)),
		revoked: options.revoked ? new Date() : null,
		rotatedAt: options.rotated ? new Date() : null,
	})
}
