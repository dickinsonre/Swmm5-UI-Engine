---
name: Radix Dialog Escape vs nested custom menus
description: Escape closes the whole Radix Dialog before React handlers run when a custom context menu is nested inside
---

Rule: a custom (non-Radix) context menu rendered inside a Radix `DialogContent` cannot intercept Escape with React `onKeyDown` + `stopPropagation` — Radix listens for Escape on `document` in the capture phase, so the whole dialog closes first.

**Why:** discovered while adding Shift+F10 keyboard access to the Table View context menu; Escape dismissed the entire dialog instead of just the menu.

**How to apply:** use the `onEscapeKeyDown` prop on `DialogContent` and call `e.preventDefault()` when the nested menu is open (then close only the menu).
