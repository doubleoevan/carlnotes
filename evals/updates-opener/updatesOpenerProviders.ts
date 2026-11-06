// the updates opener eval's promptfoo provider, which runs the opener writer under test

import { writeUpdatesOpener } from "@carlnotes/pipeline/updatesOpener"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { UpdatesOpenerCase } from "./updatesOpenerCases"

// the variables that a case gives the writer
export type UpdatesOpenerVariables = Pick<UpdatesOpenerCase, "topicNames" | "findingTitles">

// the writer under test. its output is the opener
export const updatesOpenerWriter: ApiProvider = {
	id: () => "updates-opener-writer",
	callApi: writeCaseOpener,
}

// write one case's opener through the app's own writer
async function writeCaseOpener(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	const updatesOpenerVariables = context?.vars as UpdatesOpenerVariables
	const { topicNames, findingTitles } = updatesOpenerVariables
	return { output: await writeUpdatesOpener({ topicNames, findingTitles }) }
}
