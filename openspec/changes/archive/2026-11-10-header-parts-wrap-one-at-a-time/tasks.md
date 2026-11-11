## 1. The header's grid

- [x] 1.1 `apps/web/src/lib/styleClasses.ts`: the header grid and the cells of the avatar, the title, the counts, and
      the description, each dropping to its own full-width row at its own width
- [x] 1.2 `apps/web/src/components/team/TeamHeader.tsx` and `apps/web/src/components/account/ProfileHeader.tsx` place
      their parts in those cells
- [x] 1.3 Both requirements say which part drops first
- [x] 1.4 In the browser at 390, 700, 900, and 1280 wide: a team page drops its description, then its counts, then its
      heading, and a Café drops its summary line, then its name
