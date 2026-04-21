# Hide Current Delete UI While Preserving Internal Delete Logic

## Summary

Repository state is confirmed at SHA 35f0fb2368bb0d918009cfa5ed53217d39e48923. The delete UI is concentrated in src/App.tsx:1. The first
patch should be as narrow as possible: remove only the four rendered delete button surfaces and their rendered Trash2 icons, remove the
now-unused Trash2 import, and leave all surrounding classes and internal delete logic untouched unless a concrete visible UI defect forces
a minimal follow-up class change.

## Section 1: Findings at SHA 35f0fb2368bb0d918009cfa5ed53217d39e48923

User-visible delete surface to remove now:

- src/App.tsx:958: Home feed worry cards render a delete <button> containing Trash2.
- src/App.tsx:1055: Inbox received reply cards render a nested delete <button> containing Trash2.
- src/App.tsx:1101: Inbox given reply cards render a nested delete <button> containing Trash2.
- src/App.tsx:1143: Inbox sent worry cards render a nested delete <button> containing Trash2.

Internal delete capability to preserve:

- src/App.tsx:658: deleteLetter(e, letterId) must remain unchanged.
- src/App.tsx:8: deleteDoc must remain unchanged because the preserved handler still uses it.
- The existing confirmation/error strings inside deleteLetter must remain unchanged.

Repo-wide static findings:

- The repo-wide scan found the rendered delete button JSX, Trash2, and deleteLetter call sites only in src/App.tsx.
- The scan found delete text in firestore.rules:1, but that is backend rule text, not product UI.
- No other tracked source file showed user-facing delete/trash buttons, labels, or tooltip-like delete text in the static sweep performed.

Files involved:

- src/App.tsx:1

## Section 2: File-by-file low-level plan

### src/App.tsx

Edit import block:

- Remove Trash2 from the lucide-react import list at src/App.tsx:28 after all rendered Trash2 usages are removed.
- Keep deleteDoc unchanged in the Firestore import list at src/App.tsx:8.

Preserve internal delete logic:

- Keep deleteLetter unchanged at src/App.tsx:658.
- Keep the existing confirmation/error strings unchanged.
- Do not refactor, remove, or clean up the internal delete logic.

Remove only the visible delete UI:

- In the feedWorries.map block at src/App.tsx:957, remove only the nested delete <button> block at lines 959-964.
- In the inboxReplies.map block at src/App.tsx:1055, remove only the nested delete <button> block at lines 1068-1073.
- In the myGivenReplies.map block at src/App.tsx:1101, remove only the nested delete <button> block at lines 1110-1115.
- In the myWorries.map block at src/App.tsx:1143, remove only the nested delete <button> block at lines 1145-1150.

Surrounding classes:

- Leave group, relative, absolute, spacing, and wrapper classes unchanged by default in this patch.
- Only change a surrounding non-button class if deleting the button creates a clearly visible UI defect that cannot be avoided otherwise.
- If any such non-button class change is required, keep it minimal and document exactly why it was necessary.

What must remain unchanged:

- Card click navigation.
- Read/unread behavior.
- Reply flow.
- Notification flow.
- Feed/inbox data loading.
- Detail views.
- Internal delete handler logic and strings.
- Surrounding wrapper/layout classes unless a concrete visible defect forces a minimal adjustment.

## Section 3: Implementation summary

Files changed:

- src/App.tsx

Required removal:

- Feed worry rendered delete <button>.
- Inbox received rendered delete <button>.
- Inbox given rendered delete <button>.
- Inbox sent rendered delete <button>.
- All rendered Trash2 usages tied to those buttons.
- Trash2 import once those rendered usages are gone.

Required preservation:

- deleteLetter(e, letterId)
- deleteDoc used by that handler
- Existing confirmation/error strings and implementation inside the handler

Not part of this patch:

- No backend changes.
- No redesign.
- No refactor of internal delete logic.
- No proactive cleanup of surrounding classes.
- No comments or documentation-only edits.

## Section 4: Verification

Repo-wide checks:

- Search all tracked source/config files for Trash2 and confirm no rendered JSX still references Trash2.
- Search repo-wide for the four current delete UI entrypoints and confirm no rendered JSX still contains those four delete <button>
blocks.
- Search repo-wide for deleteLetter call sites and confirm no rendered JSX or visible control still calls deleteLetter.
- Search repo-wide for user-facing delete/trash-related text and attributes, including 삭제, trash, delete, remove, aria-label, and
title=, and confirm no current UI surface exposes delete controls, labels, or tooltips.
- Distinguish non-UI matches such as backend rule text from product-surface UI matches.

src/App.tsx-specific checks:

- Confirm no rendered JSX still references Trash2.
- Confirm no rendered JSX still contains the four delete <button> blocks from feed, inbox received, inbox given, and inbox sent.
- Confirm no rendered JSX or visible control still calls deleteLetter.
- Confirm internal delete logic remains preserved and unchanged:
deleteLetter unchanged, deleteDoc unchanged and still used by that handler, existing confirmation/error strings unchanged.
- Inspect the affected cards for visible breakage after button removal.
- If no surrounding class changes were needed, report that explicitly.
- If any non-button class was changed, justify each such change as strictly necessary to fix a concrete visible defect.
- Confirm normal card click behavior remains wired for received/given cards and the feed reply CTA remains wired.

Environment note:

- A full npm run lint check was previously blocked by the sandbox before execution (bwrap: loopback: Failed RTM_NEWADDR: Operation not
permitted). If that remains blocked during implementation, verification will rely on the repo-wide static searches above plus direct
inspection of the edited JSX blocks.
