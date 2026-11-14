// app-domain labels describe a registration, never a self-reported client name. the MCP consent page warns about a
// redirect host that is not a known AI app's
import { z } from "zod"
import { isPersonalSourcesPublicUrl } from "./personalSourcesUrls"

// known exact hosts share a label and group only through this explicit mapping
const KNOWN_AI_AGENT_DOMAINS: Record<string, { domain: string; label: string }> = {
	"claude.ai": { domain: "claude.ai", label: "Claude" },
	"chatgpt.com": { domain: "chatgpt.com", label: "ChatGPT" },
	"chat.openai.com": { domain: "chatgpt.com", label: "ChatGPT" },
}
export type AiAgentIdentity = { id: string; domain: string | null; label: string }

// the hosts an MCP consent's answer may return to with no warning: each known AI agent's hosts, and the other hosts of
// the AI apps the Add to AI dialog lists
const KNOWN_REDIRECT_HOSTS = new Set([
	...Object.keys(KNOWN_AI_AGENT_DOMAINS),
	"claude.com",
	"gemini.google.com",
	"grok.com",
	"perplexity.ai",
	"cursor.com",
	"vscode.dev",
	"insiders.vscode.dev",
])

// the query of the MCP client route: the redirect address of the authorize request the consent page shows
export const mcpConsentClientQuery = z.object({ redirect_uri: z.string().max(2000).optional() })

/**
 * The MCP client a consent page asks about: its registered name, and the host its answer returns to if CarlNotes
 * does not know that host.
 */
export const mcpConsentClient = z.object({ name: z.string(), unknownRedirectHost: z.string().nullable() })
export type McpConsentClient = z.infer<typeof mcpConsentClient>

/**
 * Names a client from validated discovery or an unambiguous registered HTTPS redirect host.
 */
export function toAiAgentIdentity({
	clientId,
	clientDiscoveryId,
	redirectUris,
}: {
	clientId: string
	clientDiscoveryId: string | null
	redirectUris: string[]
}): AiAgentIdentity {
	// metadata-document discovery establishes the client-id URL as its registration origin
	const discoveryHost = clientDiscoveryId === "cimd" ? toRegisteredHttpsHost(clientId) : null
	const redirectHosts = redirectUris.map(toRegisteredHttpsHost)
	const hasOneRedirectHost =
		redirectHosts.length > 0 && redirectHosts.every((host) => host !== null && host === redirectHosts[0])
	const hostname = discoveryHost ?? (hasOneRedirectHost ? redirectHosts[0] : null)
	if (!hostname) {
		return { id: `client:${clientId}`, domain: null, label: "Local client" }
	}

	// an unknown hostname remains visible without borrowing an asserted vendor name
	const knownAiAgent = KNOWN_AI_AGENT_DOMAINS[hostname]
	return {
		id: `domain:${knownAiAgent?.domain ?? hostname}`,
		domain: knownAiAgent?.domain ?? hostname,
		label: knownAiAgent?.label ?? hostname,
	}
}

/**
 * Returns the host of a redirect address if CarlNotes does not know it. A known AI app's host, a loopback address,
 * an app's own scheme, and an address that names no host return null.
 */
export function toUnknownRedirectHost(redirectUri: string): string | null {
	// a known AI app's own https address, with or without www
	const registeredHost = toRegisteredHttpsHost(redirectUri)
	if (registeredHost && KNOWN_REDIRECT_HOSTS.has(registeredHost.replace(/^www\./, ""))) {
		return null
	}

	try {
		// an app's own scheme and a loopback address both return to the user's own device
		const { protocol, hostname } = new URL(redirectUri)
		const host = hostname.toLowerCase().replace(/\.$/, "")
		const isLoopback = host === "localhost" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host)
		return !/^https?:$/.test(protocol) || isLoopback ? null : host
	} catch {
		// an address that cannot be read names no host
		return null
	}
}

// only a public HTTPS origin can supply a domain identity
function toRegisteredHttpsHost(uri: string): string | null {
	if (!isPersonalSourcesPublicUrl(uri)) {
		return null
	}
	const parsedUrl = new URL(uri)
	return parsedUrl.protocol === "https:" && !parsedUrl.port ? parsedUrl.hostname.toLowerCase().replace(/\.$/, "") : null
}
