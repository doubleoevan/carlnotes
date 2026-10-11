// the environment helper the tests share: put a setting back the way it was. only tests import it

/**
 * Puts an environment setting back to the value it had, deleting it if it was unset.
 */
export function restoreEnv(name: string, value: string | undefined): void {
	// delete an unset setting. assigning undefined stores the text "undefined"
	if (value === undefined) {
		delete Bun.env[name]
		return
	}
	Bun.env[name] = value
}
