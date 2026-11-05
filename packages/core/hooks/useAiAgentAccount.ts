import {
	fetchAiAgentApiKeys,
	fetchConnectedAiAgents,
	sendCreateAiAgentApiKey,
	sendRevokeAiAgent,
	sendRevokeAiAgentApiKey,
} from "@carlnotes/client/aiAgentClient"
import type { AiAgentApiKey, ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

// secrets stay in this mounted account instance and never enter the query cache
export type AiAgentAccountState = {
	aiAgents: ConnectedAiAgent[]
	keys: AiAgentApiKey[]
	canCreate: boolean
	isLoading: boolean
	hasError: boolean
	isPending: boolean
	error: string | null
	secret: string | null
	createKey: (label: string) => Promise<void>
	dismissSecret: () => void
	retry: () => void
	revokeAiAgent: (aiAgentId: string) => Promise<void>
	revokeKey: (keyId: string) => Promise<void>
}

/**
 * Loads AI Agent metadata and serializes account actions without retaining created secrets after unmount.
 */
export function useAiAgentAccount(userId: string): AiAgentAccountState {
	// keep private metadata out of persisted or inactive query caches
	const aiAgents = useQuery({
		queryKey: ["personalSources-ai-agents", userId],
		queryFn: fetchConnectedAiAgents,
		gcTime: 0,
	})
	const keys = useQuery({ queryKey: ["personalSources-keys", userId], queryFn: fetchAiAgentApiKeys, gcTime: 0 })
	const [secret, setSecret] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isPending, setIsPending] = useState(false)
	const lifecycle = useRef({ isMounted: false, isPending: false })
	useEffect(() => {
		lifecycle.current.isMounted = true
		return () => {
			lifecycle.current.isMounted = false
		}
	}, [])

	// ignore replies from a removed account section and prevent duplicate mutations
	const mutate = async (action: () => Promise<void>): Promise<void> => {
		if (lifecycle.current.isPending) {
			return
		}
		lifecycle.current.isPending = true
		setIsPending(true)
		setError(null)
		try {
			await action()
			if (lifecycle.current.isMounted) {
				await Promise.all([aiAgents.refetch(), keys.refetch()])
			}
		} catch {
			if (lifecycle.current.isMounted) {
				setError("That change did not finish. Refresh the list before trying again.")
			}
		} finally {
			lifecycle.current.isPending = false
			if (lifecycle.current.isMounted) {
				setIsPending(false)
			}
		}
	}

	// reveal a creation response only in the account instance that requested it
	const createKey = (label: string): Promise<void> =>
		mutate(async () => {
			const createdKey = await sendCreateAiAgentApiKey(label)
			if (lifecycle.current.isMounted) {
				setSecret(createdKey.secret)
			}
		})
	return {
		aiAgents: aiAgents.data?.aiAgents ?? [],
		keys: keys.data?.keys ?? [],
		canCreate: keys.data?.canCreate ?? false,
		isLoading: aiAgents.isPending || keys.isPending,
		hasError: aiAgents.isError || keys.isError,
		isPending,
		error,
		secret,
		createKey,
		dismissSecret: (): void => setSecret(null),
		retry: (): void => {
			void aiAgents.refetch()
			void keys.refetch()
		},
		revokeAiAgent: (aiAgentId: string): Promise<void> => mutate(() => sendRevokeAiAgent(aiAgentId)),
		revokeKey: (keyId: string): Promise<void> =>
			mutate(async () => {
				await sendRevokeAiAgentApiKey(keyId)
				setSecret(null)
			}),
	}
}
