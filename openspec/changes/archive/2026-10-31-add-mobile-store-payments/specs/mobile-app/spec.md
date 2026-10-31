# Spec Delta

## MODIFIED Requirements

### Requirement: Builds and values stay in Doppler and EAS

`app.config.ts` SHALL name the app CarlNotes, with the iOS bundle identifier and Android package `com.carlnotes.app`
and the URL scheme `carlnotes`, and SHALL link the app to the existing Expo project with owner `carlnotes`, slug
`carlnotes`, and `extra.eas.projectId` `7b874ce7-cb2a-4d50-a8d7-fb89e078b247`, written in the config so no `eas init`
is needed. The icon and splash SHALL come from the existing favicon art. `app.config.ts` SHALL also declare the
associated domain for `carlnotes.com`, the Android intent filters for the app link paths with automatic verification,
and the encryption declaration the dependency audit supports. `eas.json` SHALL have development, preview, and
production profiles (a development client for simulators and devices, an internal preview build, and the store
build), with EAS Update's runtime version policy set, the remote app version source with the production build
number incrementing on each build, and a submit profile per store whose credentials come from Doppler. Doppler SHALL
stay the one home of every value, its dev config for development and prd for production, and a script under
`scripts/` SHALL sync the mobile values from Doppler into EAS environments, so no value is typed into the EAS
dashboard. The design SHALL name every value the app reads, mark which ship in the bundle as public, and keep
anything secret out of the bundle. The purchase processor's public SDK keys for each store SHALL be among the public
values the sync moves, and its secret key and webhook authorization SHALL stay server-side in Doppler. The EAS
commands, submit included, SHALL get root scripts in the same style as `dev:mobile`.

#### Scenario: The value sync fills an EAS environment

- **WHEN** the sync script runs for the production environment
- **THEN** the mobile values move from Doppler's prd config into the EAS production environment without anyone typing
  them into the dashboard

#### Scenario: A secret stays out of the bundle

- **WHEN** the exported JavaScript bundles are searched for the Sentry auth token
- **THEN** the token appears nowhere, because only public values ship in the bundle

#### Scenario: The config declares the app links and the encryption use

- **WHEN** the native projects are generated from `app.config.ts`
- **THEN** the iOS entitlements name the associated domain, the Android manifest has a verified intent filter that lists
  every app link path, and the Info.plist declares the encryption use

#### Scenario: A production build takes a remote number

- **WHEN** a production build runs
- **THEN** its build number comes from EAS and is one higher than the previous production build's

#### Scenario: The purchase processor's keys

- **WHEN** the sync script runs and the exported bundles are searched
- **THEN** the two public SDK keys reach EAS as plaintext and appear in the bundle, and the processor's secret key and
  webhook authorization appear nowhere in it
