# Spec Delta

## MODIFIED Requirements

### Requirement: The app renders the Nightshift theme through Uniwind

`apps/mobile/global.css` SHALL import `tailwindcss`, `uniwind`, and the Nightshift Uniwind theme, and the Metro config
SHALL wrap everything in `withUniwindConfig` as its outermost wrapper. The app SHALL follow the system appearance
between Latte and Dark roast until the user chooses a palette, SHALL remember a chosen palette on the device, and SHALL
offer "System appearance" while a palette is saved, which forgets the palette and follows the device again.

#### Scenario: The system appearance switches the palette

- **WHEN** the device switches from light to dark appearance while the app is open and no palette is saved
- **THEN** every utility re-resolves from Latte to Dark roast without a reload

#### Scenario: A utility reads the Nightshift token

- **WHEN** a mobile component renders `text-muted-foreground`
- **THEN** the text draws in the `mutedForeground` value of the current mode

#### Scenario: The user returns to the system appearance

- **WHEN** a user with Dark mode saved chooses "System appearance" in the menu
- **THEN** the app follows the device's appearance at once and after a relaunch, and the menu hides the item until a
  palette is chosen again
