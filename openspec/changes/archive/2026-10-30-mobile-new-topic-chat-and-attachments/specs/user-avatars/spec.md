# Spec Delta

## MODIFIED Requirements

### Requirement: The provider photo is private until the user opts in

The provider photo SHALL NOT be published for a user who has not opted in. Resolving a provider photo sends a hash of
the user's email address to a third party, and does so on behalf of whoever is viewing the page, so it SHALL NOT happen
as a side effect of having signed up.

The opt-in SHALL be a single unchecked checkbox on the account page, beside the other avatar controls, so one screen
holds every choice about how a user appears. It SHALL NOT be shown at signup, where the decision in front of the user is
authentication, and SHALL NOT interrupt creating or editing a Topic, where it is friction inside an unrelated task.

Better Auth's `user.image`, written when a provider returns a photo at sign-in, SHALL stay private. It SHALL render only
in account pages and SHALL NOT become a public avatar.

A sign-up through any provider SHALL record the generated avatar as the user's source, whether or not the provider
returned a photo. A user whose source is already the provider photo SHALL keep it until they turn the opt-in off.

Opting out SHALL return the user to the initials and delete any stored object the previous source left behind.

#### Scenario: Signing in with a provider publishes nothing

- **WHEN** a user signs in with a provider that returns a photo
- **THEN** their public avatar is unchanged and the photo renders only in account pages

#### Scenario: The opt-in sits with the avatar controls

- **WHEN** a user opens their account page
- **THEN** a single unchecked checkbox offers to publish their provider photo

#### Scenario: A viewer never triggers an un-opted request

- **WHEN** a visitor views the profile of a user who has not opted in
- **THEN** their provider photo is not served

#### Scenario: Opting out returns the initials

- **WHEN** a user who opted in opts out
- **THEN** their avatar resolves to the initials again

#### Scenario: A new OAuth sign-up starts on the initials

- **WHEN** a user signs up with Google or Apple and the provider returns a photo
- **THEN** their avatar source is the generated avatar, their profile shows the initials, and the account page's
  opt-in is unchecked on web and mobile

## ADDED Requirements

### Requirement: The app's avatar upload is a resized re-encode with every input choice

The mobile user and Team avatar pickers SHALL offer Photo library, Take photo, and Files limited to images. They SHALL
keep the user avatar's tap-to-show camera overlay. Every choice SHALL resize the image to at most 512 pixels on its
longest edge. PNG, WebP, and GIF sources are re-encoded as PNG to keep transparency, and every other source as JPEG
with no EXIF metadata. The app SHALL upload that re-encode alone, as multipart, to the existing routes.

#### Scenario: A leader takes a Team photo

- **WHEN** a Team leader chooses Take photo for the Team avatar
- **THEN** the upload is a JPEG of at most 512 pixels on its longest edge, and the Team avatar updates

#### Scenario: A transparent logo from Files

- **WHEN** a user chooses a transparent PNG from Files for their avatar
- **THEN** the upload is a PNG of at most 512 pixels whose transparent pixels stay transparent

#### Scenario: An unreadable image

- **WHEN** the picked file cannot be decoded
- **THEN** "That image couldn't be read. Try a JPEG or PNG." shows and nothing uploads
