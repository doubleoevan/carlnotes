## 1. The header wraps at phone width

- [x] 1.1 `apps/web/src/components/account/ProfileHeader.tsx`: the row wraps, and the identity takes the whole width
      below the avatar until `sm`
- [x] 1.2 `apps/web/src/components/team/TeamHeader.tsx`: the same
- [x] 1.3 `apps/mobile/src/components/account/ProfileHeader.tsx` and `apps/mobile/app/teams/[teamId].tsx`: the
      identity always takes the whole width, which is what the web does at that width
- [x] 1.4 Both requirements say where the name sits at each width
- [x] 1.5 In the browser at 390 and 1280 wide: a team page and a Café, with the counts on one line on the phone
