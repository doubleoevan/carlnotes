import { toCtaPrompt } from "@carlnotes/core/lib/signupPrompts"
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
