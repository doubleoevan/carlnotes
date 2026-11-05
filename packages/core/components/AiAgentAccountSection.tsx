import { authClient } from "@carlnotes/client/authClient"
import { useAiAgentAccount } from "../hooks/useAiAgentAccount"
import { AiAgentAccountCard, type AiAgentAccountElements } from "./AiAgentAccountCard"

type AiAgentAccountSectionProps = { elements: AiAgentAccountElements; onCopy: (text: string) => Promise<boolean> }

/**
 * Resets connection controls and one-time secrets whenever the signed-in account changes.
 */
export function AiAgentAccountSection(props: AiAgentAccountSectionProps) {
	const { data: session } = authClient().useSession()
	return session ? <AccountInstance key={session.user.id} userId={session.user.id} {...props} /> : null
}

// keep late mutation replies inside the account that initiated them
function AccountInstance({ userId, ...props }: AiAgentAccountSectionProps & { userId: string }) {
	const account = useAiAgentAccount(userId)
	return <AiAgentAccountCard {...props} account={account} />
}
