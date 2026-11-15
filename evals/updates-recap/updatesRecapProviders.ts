// the updates recap eval's promptfoo provider, which runs the recap writer under test

import { writeUpdatesRecap } from "@carlnotes/pipeline/updatesRecap"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { UpdatesRecapCase } from "./updatesRecapCases"

// the variables that a case gives the writer
export type UpdatesRecapVariables = Pick<UpdatesRecapCase, "topicNames" | "findingTitles">

// the writer under test. its output is the recap
export const updatesRecapWriter: ApiProvider = {
	id: () => "updates-recap-writer",
	callApi: writeCaseRecap,
}

// write one case's recap through the app's own writer
async function writeCaseRecap(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	const updatesRecapVariables = context?.vars as UpdatesRecapVariables
	const { topicNames, findingTitles } = updatesRecapVariables
	return { output: await writeUpdatesRecap({ topicNames, findingTitles }) }
}
