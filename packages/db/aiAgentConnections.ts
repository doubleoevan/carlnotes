// live MCP connections derive from the existing OAuth client, consent, and refresh-grant tables
import { toAiAgentIdentity } from "@carlnotes/contracts/aiAgentIdentity"
import type { ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { appUrl } from "@carlnotes/server/appUrl"
import { and, arrayContains, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { sources } from "./schema/topics"
import { oauthClients, oauthConsents, oauthRefreshTokens, users } from "./schema/users"

// selected registration metadata contains no client secret or token
const aiAgentClientColumns = {
	clientId: oauthClients.clientId,
	clientDiscoveryId: oauthClients.clientDiscoveryId,
	redirectUris: oauthClients.redirectUris,
}

/**
 * Resolves a concrete client's current send grant without trusting its advertised name.
 */
export async function loadLiveAiAgent({
	userId,
	clientId,
	transaction = db,
}: {
	userId: string
	clientId: string
	transaction?: DbHandle
}): Promise<ConnectedAiAgent | null> {
	const registrations = await loadLiveAiAgentRegistrations(transaction, userId, clientId)
	const registration = registrations[0]
	return registration
		? {
				...toAiAgentIdentity(registration),
				clientIds: [clientId],
				isConnected: true,
				consentCreatedAt: registration.consentCreatedAt?.toISOString() ?? null,
			}
		: null
}

/**
 * Lists grouped live grants and disconnected registrations retained in the owner's Source history.
 */
export async function loadConnectedAiAgents(userId: string): Promise<ConnectedAiAgent[]> {
	const registrations = await loadLiveAiAgentRegistrations(db, userId)
	const byIdentity = new Map<string, ConnectedAiAgent>()
	for (const registration of registrations) {
		const identity = toAiAgentIdentity(registration)
		const existingAiAgent = byIdentity.get(identity.id)
		const clientIds = [...new Set([...(existingAiAgent?.clientIds ?? []), registration.clientId])]
		byIdentity.set(identity.id, {
			...identity,
			clientIds,
			isConnected: true,
			consentCreatedAt: latestConsentTime(existingAiAgent?.consentCreatedAt ?? null, registration.consentCreatedAt),
		})
	}

	// retained Source configuration names a disconnected client even after its OAuth rows are removed
	const history = await db
		.select({ config: sources.config })
		.from(sources)
		.where(and(eq(sources.personalSourcesUserId, userId), eq(sources.kind, "ai_agent")))
	for (const { config } of history) {
		appendDisconnectedAiAgent(byIdentity, config)
	}
	return [...byIdentity.values()].sort((aiAgent, otherAiAgent) => aiAgent.label.localeCompare(otherAiAgent.label))
}

/**
 * Revokes this user's whole app group under the same lock that accepts its sends.
 */
export async function revokeConnectedAiAgent({
	userId,
	aiAgentId,
}: {
	userId: string
	aiAgentId: string
}): Promise<void> {
	await db.transaction(async (transaction) => {
		// serialize every group grant with confirmation and credential revocation
		await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update")
		const clientRows = await transaction
			.selectDistinct(aiAgentClientColumns)
			.from(oauthClients)
			.leftJoin(oauthConsents, and(eq(oauthConsents.clientId, oauthClients.clientId), eq(oauthConsents.userId, userId)))
			.leftJoin(
				oauthRefreshTokens,
				and(eq(oauthRefreshTokens.clientId, oauthClients.clientId), eq(oauthRefreshTokens.userId, userId)),
			)
			.where(or(isNotNull(oauthConsents.id), isNotNull(oauthRefreshTokens.id)))
		const clientIds = clientRows
			.filter((client) => toAiAgentIdentity(client).id === aiAgentId)
			.map((client) => client.clientId)
		if (clientIds.length === 0) {
			return
		}

		// issued JWT reads keep their existing expiry, while refresh and new send authority end
		await transaction
			.update(oauthRefreshTokens)
			.set({ revoked: new Date() })
			.where(and(eq(oauthRefreshTokens.userId, userId), inArray(oauthRefreshTokens.clientId, clientIds)))
		await transaction
			.delete(oauthConsents)
			.where(and(eq(oauthConsents.userId, userId), inArray(oauthConsents.clientId, clientIds)))
	})
}

// every row proves current consent and a matching unrotated unexpired refresh grant for this resource
async function loadLiveAiAgentRegistrations(
	transaction: DbHandle,
	userId: string,
	clientId?: string,
): Promise<
	{ clientId: string; clientDiscoveryId: string | null; redirectUris: string[]; consentCreatedAt: Date | null }[]
> {
	const resource = `${appUrl()}/mcp`
	return transaction
		.selectDistinct({ ...aiAgentClientColumns, consentCreatedAt: oauthConsents.createdAt })
		.from(oauthClients)
		.innerJoin(oauthConsents, and(eq(oauthConsents.clientId, oauthClients.clientId), eq(oauthConsents.userId, userId)))
		.innerJoin(
			oauthRefreshTokens,
			and(eq(oauthRefreshTokens.clientId, oauthClients.clientId), eq(oauthRefreshTokens.userId, userId)),
		)
		.where(
			and(
				clientId ? eq(oauthClients.clientId, clientId) : undefined,
				sql`${oauthClients.disabled} is not true`,
				arrayContains(oauthConsents.resources, [resource]),
				arrayContains(oauthRefreshTokens.resources, [resource]),
				isNull(oauthRefreshTokens.revoked),
				isNull(oauthRefreshTokens.rotatedAt),
				gt(oauthRefreshTokens.expiresAt, sql`clock_timestamp()`),
			),
		)
}

// history labels were derived from the authenticated registration at confirmation time
function appendDisconnectedAiAgent(byIdentity: Map<string, ConnectedAiAgent>, config: Record<string, unknown>): void {
	if (
		config.delivery !== "oauth" ||
		typeof config.clientId !== "string" ||
		(config.appDomain !== null && typeof config.appDomain !== "string")
	) {
		return
	}
	const identity =
		config.appDomain === null
			? { id: `client:${config.clientId}`, domain: null, label: "Local client" }
			: toAiAgentIdentity({ clientId: `https://${config.appDomain}/`, clientDiscoveryId: "cimd", redirectUris: [] })
	const existing = byIdentity.get(identity.id)
	if (existing) {
		if (!existing.clientIds.includes(config.clientId)) {
			existing.clientIds.push(config.clientId)
		}
	} else {
		byIdentity.set(identity.id, {
			...identity,
			clientIds: [config.clientId],
			isConnected: false,
			consentCreatedAt: null,
		})
	}
}

// several registrations in a domain still retain the latest reconnect for the one-time nudge
function latestConsentTime(previous: string | null, current: Date | null): string | null {
	const next = current?.toISOString() ?? null
	return previous && (!next || previous > next) ? previous : next
}
