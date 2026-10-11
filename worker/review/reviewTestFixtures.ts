// the review test fixtures: the stand-in Resource that the ranking and dedupe tests read only the id of
import type { rankBySimilarity } from "./filter"

/**
 * Returns a stand-in Resource for the ranking and dedupe test cases, which read only its id.
 */
export function toTestResource(id: string): Parameters<typeof rankBySimilarity>[0][number]["resource"] {
	return { id } as Parameters<typeof rankBySimilarity>[0][number]["resource"]
}
