// running another program from a UI test step: for its output, or with its output shown

/**
 * Returns a command's output, throwing an error with the command's own message if the command fails.
 */
export function runCommand(command: string[]): string {
	const commandResult = Bun.spawnSync(command)
	if (commandResult.exitCode !== 0) {
		throw new Error(`${command.slice(0, 3).join(" ")} failed: ${commandResult.stderr.toString().trim()}`)
	}
	return commandResult.stdout.toString()
}

/**
 * Runs a command with its output shown, and returns its exit code.
 */
export function runVisibleCommand(command: string[]): number {
	return Bun.spawnSync(command, { stdio: ["inherit", "inherit", "inherit"] }).exitCode
}
