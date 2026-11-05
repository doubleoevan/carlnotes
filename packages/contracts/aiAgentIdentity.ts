// app-domain labels describe a registration, never a self-reported client name
import { isPersonalSourcesPublicUrl } from "./personalSourcesUrls"

// known exact hosts share a label and group only through this explicit mapping
const KNOWN_AI_AGENT_DOMAINS: Record<string, { domain: string; label: string }> = {
	"claude.ai": { domain: "claude.ai", label: "Claude" },
	"chatgpt.com": { domain: "chatgpt.com", label: "ChatGPT" },
	"chat.openai.com": { domain: "chatgpt.com", label: "ChatGPT" },
}
export type AiAgentIdentity = { id: string; domain: string | null; label: string }

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

// only a public HTTPS origin can supply a domain identity
function toRegisteredHttpsHost(uri: string): string | null {
	if (!isPersonalSourcesPublicUrl(uri)) {
		return null
	}
	const parsedUrl = new URL(uri)
	return parsedUrl.protocol === "https:" && !parsedUrl.port ? parsedUrl.hostname.toLowerCase().replace(/\.$/, "") : null
}
