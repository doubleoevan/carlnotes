// the registered name of each MCP client, read once per client id and kept for the life of the process
import { db } from "@carlnotes/db"
import { oauthClients } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"

// the registered name of each client that has one
const clientNamesByClientId = new Map<string, string>()

/**
 * Returns the registered name of the client with this id, or null for an unregistered client or one that registered
 * with no name.
 */
export async function loadOAuthClientName(clientId: string): Promise<string | null> {
	const cachedClientName = clientNamesByClientId.get(clientId)
	if (cachedClientName) {
		return cachedClientName
	}

	// read the registration once, and keep its name. a client with no name is read again next time
	const [oauthClient] = await db
		.select({ name: oauthClients.name })
		.from(oauthClients)
		.where(eq(oauthClients.clientId, clientId))
	if (oauthClient?.name) {
		clientNamesByClientId.set(clientId, oauthClient.name)
	}
	return oauthClient?.name ?? null
}
