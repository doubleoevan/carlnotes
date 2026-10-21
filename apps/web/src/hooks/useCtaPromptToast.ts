import { useEffect } from "react"
import { toast } from "sonner"
import { useSearchParams } from "./useSearchParams"

/**
 * Toasts the prompt that the page's cta search param names, if the prompts have one. The id keeps it one toast.
 */
export function useCtaPromptToast(prompts: Readonly<Record<string, string>>, toastId: string): void {
	const ctaParam = useSearchParams().get("cta")

	// toast once the page has the param, and again only if the param changes
	useEffect(() => {
		const ctaPrompt = toCtaPrompt(prompts, ctaParam)
		if (ctaPrompt) {
			toast(ctaPrompt, { id: toastId })
		}
	}, [prompts, ctaParam, toastId])
}

/**
 * Returns the prompt that a call to action names, or null for one the prompts do not have.
 */
export function toCtaPrompt(prompts: Readonly<Record<string, string>>, cta: string | null): string | null {
	return cta !== null && Object.hasOwn(prompts, cta) ? (prompts[cta] ?? null) : null
}
