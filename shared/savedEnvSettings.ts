// the environment settings that a test changes and puts back, shared by the api and worker tests

/**
 * Saves the named settings' values and returns the call that puts each one back, deleting a setting the run never had.
 */
export function saveEnvSettings(settingNames: string[]): () => void {
	// each setting's value before the test changes it
	const savedSettings = settingNames.map((settingName) => ({ settingName, savedValue: Bun.env[settingName] }))
	return () => {
		for (const { settingName, savedValue } of savedSettings) {
			restoreEnvSetting(settingName, savedValue)
		}
	}
}

// put one value back. assigning undefined would store the text "undefined", so an unset setting is deleted
function restoreEnvSetting(settingName: string, savedValue: string | undefined): void {
	if (savedValue === undefined) {
		delete Bun.env[settingName]
		return
	}
	Bun.env[settingName] = savedValue
}
