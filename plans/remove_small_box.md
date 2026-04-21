## Remove Pill Styling From Archive "My Concerns History" Category Text

### Summary

- Scope the change to the inbox view’s sent tab (내 고민 내역) in src/App.tsx, which is the only place on that screen rendering the right-aligned category pill for each history card.
- Keep the item card container, layout, icon row, category text content, and data logic intact.
- Change only the category <span> classes so it renders as plain text instead of a highlighted rounded badge.

### Implementation Changes

- In the myWorries.map(...) card row under activeTab === 'sent', keep this JSX expression unchanged:
    - {(worry.categories || [worry.category]).join(', ')}
- Replace the current badge classes:
    - ml-auto text-[10px] text-[#E9EDC9] font-bold bg-[#FAEDCD] px-2 py-0.5 rounded-full
- With a plain-text-only class list that preserves right alignment without pill styling:
    - ml-auto text-[10px] font-bold text-[#8B8B6B]
- Do not change the parent card wrapper:
    - w-full text-left p-6 bg-white rounded-2xl border border-[#E9EDC9] relative group
- Do not touch other badge/tag usages such as the home feed category chip or any shared/global styling.

### Public Interfaces / Types

- No public API, prop, schema, or TypeScript type changes.
- No data or rendering logic changes beyond CSS class removal on that one <span>.

### Test Plan

- Rebuild with npm run build after the edit.
- Verify in the Archive > My concerns history screen that:
    - Each card still renders.
    - The category text still appears on the right side of the top row.
    - The category no longer has background color, padding, or rounded-pill appearance.
    - No other inbox tabs or other screens changed visually.
- Baseline check already completed: npm run build passes on SHA e88f251511dbe7680ef7c36aaf536e98368a0ffc.

### Assumptions

- “Archive > My concerns history” corresponds to the inbox screen’s sent tab labeled 내 고민 내역.
- A neutral readable text color is preferred once the badge background is removed, so text-[#8B8B6B] is the default instead of keeping the very light #E9EDC9.
- Existing unrelated worktree change in .gitignore is not part of this task and should remain untouched.