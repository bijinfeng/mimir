# Navigation implementation evidence

Approved scope: workspace HTML v2, user “实施吧”. Navigation-only ownership: NavSidebar, NavSidebar.style, nav/AccountRow, nav/menu-items and their existing tests. Shared knowledge-base form/server work and recent-note fetching are handled separately.

## Implemented contracts

- Conversation history distinguishes initial loading, actual empty, initial error/retry and cached refresh failure. Cached items remain navigable after refresh failure.
- At most 12 conversations: if the current conversation exists in the returned API list beyond the first 12, show the first 11 and the current item. Unknown IDs are not fabricated. Full titles are available on pointer hover and keyboard menu focus.
- Account session queries have independent loading/error/retry while the separate settings action remains usable. Runtime mode remains server-defined: unknown config exposes neither cloud email nor signout; local mode exposes neither email nor signout; known cloud mode retains both.
- Signout uses the existing unsaved guard (manual cancel/discard/save; auto has no discard), then the existing signOutAndLeave API. Busy/error/single-flight state belongs to NavSidebar so switching rail/Drawer or route selection cannot reset a pending request. Failure retains the working context and offers inline retry; settings remains usable.
- Theme cascade remains controlled. Choosing any value including the current value closes both layers synchronously; Escape closes the child first and returns focus to its parent, then closes the main menu and returns focus to the account button. Outside-click closing does not steal focus from the new target.
- Account menu actions are 44px under the shared narrow breakpoint or coarse pointer. Main menu width is bounded at224px in touch/narrow mode and212px otherwise, overriding Dropdown's trigger-width stretch through semantic root minWidth:0. Child menu remains136px with very narrow viewport edge fallback. Narrow menus align to the account trigger's left edge, keeping the136px cascade within390px instead of inheriting the wide trigger's right alignment. Browser geometry verification belongs to the main session.
- Only one account menu mounts while a narrow Drawer is open, avoiding duplicate account/theme portals.
- A committed knowledge-base rename updates scope to the new canonical path plus any nested suffix while preserving the current note ID. This synchronization intentionally does not run the unsaved leave guard: the content has not been left, and cancellation after the already-committed rename would preserve an invalid old scope. User-initiated navigation continues to use the guard.

## Verification

- `pnpm --filter @mimir/renderer test src/components/NavSidebar.test.tsx src/components/nav/menu-items.test.ts`: 2 files,33 tests passed (2026-10-18; includes dirty-note rename, signout across Drawer remount, session/config recovery and keyboard layers).
- Scoped oxlint on the6 owned source/test files: passed without diagnostics after the final touch geometry fix.
- `pnpm --filter @mimir/renderer exec tsc --noEmit`: passed after the final geometry fix.
- Browser: performed centrally by the main session, not represented by unit tests or the frozen proposal HTML.

A dirty-note rename integration test exposed row-menu Portal click propagation into the navigation row, causing an unintended unsaved-leave dialog. The FolderSection owner fixed both menu propagation and the row's DOM-boundary exclusion; the integration test now passes and retains a regression assertion against that extra dialog.
