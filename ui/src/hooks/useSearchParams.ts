import { useLocation } from "@tanstack/react-router"

/**
 * The page's query string as URLSearchParams.
 */
export function useSearchParams(): URLSearchParams {
	return new URLSearchParams(useLocation().searchStr)
}
