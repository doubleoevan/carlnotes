// the grader calibration eval's promptfoo provider. the provider returns each case's fixed output and calls no model
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"

// the variables that a case gives the provider. the fixed output, and the eval and the verdict that the report prints
export type GraderCalibrationVariables = { evalName: string; fixedOutput: string; isPassExpected: boolean }

// the provider under every case. its output is the case's fixed output, unchanged
export const fixedOutputProvider: ApiProvider = { id: () => "fixed-output", callApi: returnCaseFixedOutput }

// return one case's fixed output at no cost
async function returnCaseFixedOutput(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	// read the case's variables, and return the fixed output unchanged
	const graderCalibrationVariables = context?.vars as GraderCalibrationVariables
	return { output: graderCalibrationVariables.fixedOutput, cost: 0 }
}
