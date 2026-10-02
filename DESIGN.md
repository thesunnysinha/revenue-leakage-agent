# LedgerLens Design Guide

This document is the design source of truth for the LedgerLens test application. It describes the product's own visual language and interaction patterns; external design references are inspiration only and must not replace LedgerLens branding or behavior.

## Product

LedgerLens is a financial operations workspace for investigating revenue leakage. It lets an analyst ask questions in chat, inspect the billing evidence and agent tool activity behind each answer, review proposed corrections, and approve sandbox changes.

The interface should feel calm, careful, and auditable. Prefer clear evidence and status over decoration. The product is a working investigation tool, not a marketing landing page or a generic assistant chat.

## Design principles

1. **Evidence before conclusions.** Make the plan, invoice, and tool records behind a finding easy to inspect. Keep claims and their evidence close together.
2. **Human control for financial changes.** Separate a proposed action from an applied action. Show what will change and require a deliberate approval for writes.
3. **Readable activity.** Tool calls, durations, and outcomes should be understandable to an operator; raw JSON is secondary detail.
4. **Quiet visual hierarchy.** Use forest green for LedgerLens identity and primary actions, warm neutral surfaces for the workspace, and semantic colors only for statuses.
5. **Stable workspace.** Keep navigation and the message composer predictable while the conversation or records scroll independently.

## Visual identity

### Color tokens

| Token | Value | Use |
|---|---|---|
| `canvas` | `#FBFCFA` | Main app background |
| `surface` | `#FFFFFF` | Cards, menus, tables, dialogs |
| `surface-subtle` | `#F4F6F2` | Navigation rail and quiet grouping |
| `surface-hover` | `#EDF1EB` | Hover and selected navigation |
| `ink` | `#1B2926` | Main text and headings |
| `body` | `#59675E` | Explanatory text |
| `muted` | `#819087` | Secondary labels and timestamps |
| `line` | `#E6EAE6` | Dividers and understated borders |
| `brand` | `#316D5A` | Primary action, active state, LedgerLens mark |
| `brand-hover` | `#285B45` | Hover/pressed primary action |
| `brand-soft` | `#EDF3EB` | Non-interactive brand tint |
| `success` | `#5F8066` | Completed/approved status text |
| `warning` | `#987139` | Pending approval or attention status |
| `danger` | `#A45544` | Failed or destructive status text |
| `danger-soft` | `#FFF0ED` | Error status background |

Use semantic colors in small labels, icons, or soft status fills. Never rely on color alone to communicate state; include readable text such as “Awaiting approval” or “Failed”. Keep money and identifiers high contrast and easy to scan.

### Typography

Use the existing system sans-serif stack (`Avenir Next`, `Segoe UI`, Arial, sans-serif) with a system monospace stack for IDs, tool names, and tabular values. Do not add proprietary font dependencies.

| Role | Desktop guidance | Treatment |
|---|---:|---|
| Page title | 26–30 px | Medium weight, tight tracking |
| Section title | 14–18 px | Semibold |
| Message body | 14–16 px | Regular, line height 1.6–1.75 |
| Supporting copy | 12–14 px | Muted, comfortable contrast |
| Metadata / tool label | 11–12 px | Muted; use monospace only for technical values |
| Financial amount | 14–18 px | Tabular numerals, semibold when emphasized |

Scale titles down on narrow screens while keeping body text comfortably readable. Avoid tiny text for data tables, approvals, and activity labels.

### Shape, spacing, and elevation

- Use a 4 px spacing base. Common gaps are 8, 12, 16, 24, and 32 px.
- Use 6–10 px corners for compact controls and data cards; reserve 12–16 px corners for larger surfaces and dialogs.
- Prefer a subtle 1 px border to a shadow. Use shadows only for floating menus or dialogs that need separation.
- Keep content aligned to a consistent grid. Avoid oversized empty hero areas in operational views.
- Primary buttons should have a clear label, a minimum 40 px height, and a visible focus state. Destructive or write actions must not look like ordinary navigation.

## Application structure

### Workspace shell

- The navigation rail contains the LedgerLens mark, new-chat action, saved chats, and workspace views (billing data and activity log).
- The main area contains a compact top bar and the selected workspace view.
- At desktop widths, the rail stays visually distinct with the subtle sage surface and divider.
- On small screens, the rail becomes a compact navigation strip or drawer. Preserve access to chat history, billing data, activity, and logout.
- Keep the main content at a readable maximum width. Tables may scroll horizontally inside their own region rather than widening the page.

### Chat and assistant responses

- User and assistant messages must be visually distinct without oversized bubbles that constrain long financial explanations.
- Render assistant Markdown as real headings, lists, emphasis, and inline code; never show literal Markdown markers.
- Break long investigations into a short finding summary, evidence, and next step. Keep amounts, plan IDs, invoice IDs, dates, and statuses easy to scan.
- Show the tools actually triggered for that turn. Each activity item should include the tool name, a plain-language purpose, status, and duration when available.
- Keep verbose tool arguments and results behind an expandable detail area. Do not expose secrets or internal credentials in activity details.
- During work, show a changing or tool-specific activity indicator when possible. Use a generic “Working…” fallback only when no current step is known; avoid suggesting a billing review for unrelated prompts.
- The composer remains anchored to the bottom of the conversation pane. The conversation scrolls independently, and the composer must remain visible when the viewport is short or the response is long.
- Support keyboard submission, multiline input where appropriate, disabled/loading states, and clear error recovery.

### Evidence and tool activity

Present activity in execution order so an analyst can follow how the answer was produced. Use a compact timeline or disclosure list, not a wall of logs. Show a success, failure, or waiting state with text and an icon. Tool result previews should prioritize relevant records and financial fields; provide a raw-detail disclosure for debugging.

Use consistent terms across the app: **Tool activity** for agent execution, **Evidence** for source billing records, **Sandbox action** for a proposed or applied change, and **Approval** for the human decision gate.

### Human approval

An approval card must make the decision understandable without requiring the user to inspect logs. It should state:

- the action type and target record/customer;
- the proposed amount and currency, if applicable;
- the reason and supporting evidence;
- the sandbox effect that will occur if approved;
- clear **Approve** and **Reject** actions.

Keep the graph paused until an explicit decision is received. Disable duplicate decisions while the request is being submitted. Afterward, show the decision and resulting action in the conversation and activity log. Never visually imply that a proposal has been applied before the backend confirms it.

### Billing data and activity views

- Billing data views should use clear page titles, concise context, readable summary cards, and filterable tables.
- Align financial values consistently and use tabular numerals. Include currency labels; do not rely on symbols when ambiguity is possible.
- Make read-only status explicit where records cannot be edited from the view.
- Activity log entries should show event type, target, result/status, and time. Keep technical payloads collapsed by default.
- Empty, loading, and error states should explain what is happening and offer a useful next step where possible.

## Responsive behavior

| Range | Guidance |
|---|---|
| Wide desktop, >1200 px | Full rail and comfortable content width; use side-by-side panels only when each remains readable. |
| Tablet, 621–1200 px | Narrow the rail or allow it to collapse; preserve clear table and chat regions. |
| Mobile, ≤620 px | Compact navigation, single-column content, full-width composer, touch-friendly controls, and locally scrollable tables. |

On every size, keep the primary task visible, prevent horizontal overflow in the overall page, and ensure the composer and approval controls remain reachable. Respect safe areas and dynamic viewport height on mobile.

## Accessibility and interaction states

- Meet WCAG AA contrast for text and controls.
- Provide visible keyboard focus, semantic headings, accessible names for icon-only buttons, and logical tab order.
- Use native buttons and form controls where practical. Announce asynchronous results and approval outcomes to assistive technology.
- Distinguish hover, focus, active, disabled, loading, success, warning, and error states.
- Respect `prefers-reduced-motion`; animation must not carry essential information.
- Do not use color as the only indicator of risk, success, or failure.

## Writing style

Use direct, neutral language. Prefer “Invoice I-104 is unpaid” over vague claims such as “We found an issue.” Separate verified facts from inferred explanations. Label proposed amounts and actions as proposals until approved. Use dates and currency codes when ambiguity is possible.

## Do and avoid

### Do

- Keep the sage and forest-green LedgerLens identity already used in the app.
- Make tool activity and evidence available alongside the answer that used them.
- Make pending approval visually distinct and describe its exact effect.
- Keep long content readable, scannable, and accessible on mobile.
- Reuse existing components and CSS tokens before introducing new styles.

### Avoid

- Replacing LedgerLens colors or wordmark with a third-party brand system.
- Adding decorative marketing heroes or crypto-trading motifs to operational screens.
- Showing the same generic loader for every prompt regardless of actual agent activity.
- Hiding an approval requirement in assistant prose or making reject/approve controls ambiguous.
- Rendering raw Markdown, unbounded JSON, or low-contrast microcopy as the default experience.

## Implementation notes

- Keep shared app colors and global typography in `services/frontend/app/globals.css`.
- Keep chat-specific structure and component styling near `services/frontend/components/Chat.tsx` and `services/frontend/components/Chat.module.css`.
- Keep billing and activity view styles in `services/frontend/components/WorkspaceViews.module.css`.
- Before changing Next.js-specific code, follow the version-specific guidance in `services/frontend/AGENTS.md`.
- Update this document when the product's established identity or interaction patterns change.
