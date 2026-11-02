## ADDED Requirements

### Requirement: Class names merge only through Nightshift's class merge

Every workspace SHALL merge class names through `cn` from `@carlnotes/nightshift/classNames`, the class merge that
knows the `shadow-raised` utility. Biome SHALL fail an import from `clsx`, `tailwind-merge`, or a package named `cn`
in every file except `packages/nightshift/classNames.ts`, with a message that names the Nightshift import.

#### Scenario: A direct tailwind-merge import fails

- **WHEN** a file in `apps/web` imports `twMerge` from `tailwind-merge`
- **THEN** `bunx biome check .` exits non-zero, naming the file and pointing to `@carlnotes/nightshift/classNames`

#### Scenario: The Nightshift class merge passes

- **WHEN** a file imports `cn` from `@carlnotes/nightshift/classNames`
- **THEN** Biome reports nothing for that import

#### Scenario: A shadcn component's cn package import fails

- **WHEN** the shadcn CLI writes a component that imports `cn` from the `cn` package
- **THEN** Biome fails the import until it moves to `@carlnotes/nightshift/classNames`
