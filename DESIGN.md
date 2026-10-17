---
name: ClaimBridge
description: The Citator. Paper and navy ink, with every precedent wearing a drawn citator signal.
colors:
  paper: "#ffffff"
  wash: "#f4f6fa"
  wash-2: "#eaeef5"
  ink: "#14213d"
  ink-hover: "#1f2f52"
  ink-2: "#3a4763"
  ink-3: "#5e6984"
  rule: "#d8dde6"
  rule-2: "#b9c1cf"
  link: "#1f5fad"
  link-wash: "#e3ecf9"
  selection: "#cfdcf3"
  neg: "#b3261e"
  neg-wash: "#fbeceb"
  neg-border: "#e3b4b1"
  caution: "#c99a06"
  caution-ink: "#7a5c00"
  caution-wash: "#fbf4dc"
  pos: "#2f7d4f"
  pos-wash: "#e9f4ee"
  neutral: "#8a93a6"
  rail: "#14213d"
  rail-ink: "#c9d1e2"
  rail-ink-muted: "#93a0bb"
  rail-hover: "#1e2d4f"
  rail-rule: "#2a3a5c"
  rail-live: "#58c08a"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(44px, 6.4vw, 84px)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(28px, 3.2vw, 40px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  lede:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.625
  case-text:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"kern\", \"liga\""
  ui:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  meta:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
rounded:
  hairline: "2px"
  control: "3px"
  dot: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
  section: "48px"
  band: "80px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-primary-landing:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.neg}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-danger-hover:
    backgroundColor: "{colors.neg-wash}"
  button-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "32px"
  cite:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.hairline}"
    padding: "1px 6px"
  cite-active:
    backgroundColor: "{colors.link-wash}"
    textColor: "{colors.link}"
  rail-item:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  rail-item-hover:
    backgroundColor: "{colors.rail-hover}"
    textColor: "{colors.paper}"
  rail-item-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  ledger-cell:
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
    padding: "0 12px"
    height: "36px"
  ledger-cell-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  tag-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "0 6px"
---

# Design System: ClaimBridge

## Overview

**Creative North Star: "The Citator"**

ClaimBridge is drawn as a legal citator: the research tool a lawyer opens to ask "is this still good law?". Every precedent the agents consider wears a drawn citator signal (a red stop sign for refused, a yellow triangle for distinguished, a green diamond for followed, a grey ring for not relevant), and the signal always travels with its word. The surfaces are white paper and a pale blue-grey wash, the authority colour is navy ink, and all structure is drawn with 1px rules, the way a case reporter rules its columns. There are no cards, no shadows and no gradients.

Two registers share one world. The console (Operate) is dense: 13px Public Sans UI, ruled tables, a navy rail, and serif only where the content is case text. The landing page (Persuade) is the same world at reading scale: a large Source Serif 4 display, a citator card for one claim, and reporter-style ruled columns. Hierarchy comes from type voice and rule weight (navy ink rules for major boundaries, grey rules between rows), not from boxes.

Motion is authored and scarce. A signal is stamped once when it arrives (a scale-in with an expo ease), and a status cell turns over like a filed card (a two-frame flip with no easing). Liveness is shown as a steady dot, never a pulse. Both motions are switched off under `prefers-reduced-motion`.

**Key Characteristics:**
- Paper white and pale wash surfaces, navy ink text and authority, 1px rules for all structure.
- Four citator signals drawn as SVG, each a distinct shape, always paired with a word.
- Three type voices: Source Serif 4 for case text and headings, Public Sans for UI, JetBrains Mono for identifiers.
- Flat: no shadows, no card chrome, corners at 3px or less.
- Two authored motions only: the stamp and the turn.

## Colors

A paper-and-ink palette with three signal hues borrowed from legal citators, each held to the meaning of its flag.

### Primary
- **Reporter Navy** (`ink`): the voice of authority. Body text, headings, the primary button, the console rail, the claim node in the evidence graph, and the heavy section rules under every section head. Its hover step is **Pressed Navy** (`ink-hover`).
- **Docket Blue** (`link`): links, the focus ring, the caret, active citations, and a worker that is working right now. Its pale step **Citation Highlight** (`link-wash`) fills an active citation chip and a hovered graph node. **Highlight Blue** (`selection`) is the text-selection colour.

### Signal colours
- **Overruled Red** (`neg`): negative treatment and failure. Refused (superseded or contradicted) precedents, claims sent to a person, killed workers, missing evidence, error text, and the danger button. **Red Slip** (`neg-wash`) is its pale fill (missing-evidence nodes, danger hover); **Red Margin** (`neg-border`) is the danger button's resting border.
- **Caution Yellow** (`caution`): distinguished precedents and limited (stale) memory. It is a fill and a stroke only; text in this role uses **Caution Ink** (`caution-ink`) so it stays legible on paper. **Yellow Slip** (`caution-wash`) is its pale fill.
- **Good-Law Green** (`pos`): followed precedents, good-law memory, idle healthy workers, viable dispositions, and the diamond in the wordmark. **Green Slip** (`pos-wash`) is its pale fill.
- **Not-Relevant Grey** (`neutral`): the ring signal for look-alike precedents and candidates under review.

### Neutral
- **Paper** (`paper`): the page, buttons at rest, the active rail item.
- **Wash** (`wash`): bands on the landing page, the synthetic-data banner, hovered rows and controls, citation chips at rest, loading skeletons. **Wash 2** (`wash-2`) is the unfilled segment of a step track.
- **Ink 2** (`ink-2`): secondary prose and ledes. **Ink 3** (`ink-3`): metadata, column heads, placeholders, timestamps.
- **Rule** (`rule`): the 1px hairline between rows and columns. **Rule 2** (`rule-2`): control borders, table-head underlines, neutral graph edges, the dashed empty state, scrollbar thumbs.

### The rail
- **Rail** (`rail`, the same navy as ink) carries the console navigation. **Rail Ink** (`rail-ink`) is its text, **Rail Ink Muted** (`rail-ink-muted`) its captions and counts, **Rail Hover** (`rail-hover`) a hovered item, **Rail Rule** (`rail-rule`) its footer rule, and **Rail Live Green** (`rail-live`) the steady "Live from the graph" dot, lifted from good-law green so it reads on navy.

### Named Rules
**The Never Colour Alone Rule.** A treatment, status or disposition is always shape plus colour plus word: a drawn signal with its label, a dot with its state name. If the colour were removed, the meaning must survive.

**The Flag Means One Thing Rule.** Red, yellow and green belong to the citator. Red is negative (refused, failed, missing, destructive), yellow is caution, green is good law and health. None of them is decoration, brand colour or emphasis.

**The Paper and Ink Rule.** Surfaces are paper or wash; nothing else fills a large area except the navy rail, the citator card's caption bar, the landing footer and the claim node. No gradients.

## Typography

**Display Font:** Source Serif 4 (with Georgia, serif)
**Body Font:** Public Sans (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** A book serif for the law and a civic sans for the tool. The serif carries everything a caseworker reads as an argument (headings, holdings, precedent statements, grounds, policy text); the sans carries everything they operate; mono marks every identifier the graph wrote.

### Hierarchy
- **Display** (600, clamp(44px, 6.4vw, 84px), 0.98, -0.03em): the landing headline only, held to about 13ch.
- **Headline** (600, clamp(28px, 3.2vw, 40px), 1.1, -0.02em): landing section heads, 24 to 28ch.
- **Page title** (600, 32px, 1.1, -0.015em): the console page heading (Docket, Memory, Agents, Evaluation). The case page runs one step larger (34px, 1.08) with the denial as a 22px regular sub-line.
- **Title** (600, 19px, 1.25, -0.005em): every section head, set over a navy rule. Also the wordmark and the status group heads in Memory (a Treatment set at title size).
- **Lede** (serif 400, 19px, 1.625): the landing's one-line mechanism, about 48ch.
- **Case text** (serif 400, 15 to 16px, 1.375): precedent statements, grounds, holdings summaries and quoted policy text, 70 to 75ch.
- **Body** (sans 400, 14px, 1.5, kerning and ligatures on): the page default. Console UI runs at **UI** (13 to 13.5px, 500 on controls) and **Meta** (12.5px) for metadata and asides.
- **Label** (sans 600, 11.5px, 0.06em, uppercase): column heads of tables, the evidence graph and side-by-side comparisons, and inline category tags (plan item kinds, "learned live").
- **Mono** (400, 11 to 12.5px, -0.01em): claim IDs, Finding IDs, clause and node codes, counts in the rail.

### Named Rules
**The Three Voices Rule.** Serif for what is read as law, sans for what is operated, mono for what the graph named. A Finding ID is never set in serif; a precedent statement is never set in sans.

**The Tabular Figures Rule.** Every count, percentage, date and duration uses tabular figures (`.tabular`), so numbers in a column line up.

## Layout

The console is a fixed navy rail (232px, sticky full height, from 1024px up) beside a single scrolling main column capped at 1280px, with 32px side gutters (16px on phones). Below 1024px the rail becomes a 48px top bar with a menu button that opens the rail as a 260px drawer over a navy scrim. A one-line synthetic-data banner on the wash sits above every console page.

The landing is capped at 1240px with 20px gutters (32px from 640px up). Its first viewport is two columns from 1024px (the text column and a citator card of at most 560px), stacked below. Sections are full-bleed bands separated by navy rules, with 80px vertical padding (56px for the wash band).

Rhythm: section heads take 48px above and 12px below; rows are 12px tall in padding; cells pad 20px inside the citator card and 16 to 20px in ruled columns. Prose is capped by measure (48 to 80ch), never by box. Tables scroll sideways rather than squeezing; on phones the docket collapses each row into its claim cell, and the evidence graph scrolls with a hint.

**The No Tile Row Rule.** Counts are a single ruled line of cells (the stage ledger), never a row of KPI tiles or cards.

**The Ruled Ledger Rule.** Structure is drawn with 1px rules: navy for a section or band boundary, Rule grey between rows and columns. A grid of items is a set of ruled columns, not a grid of boxes.

## Elevation & Depth

The system is flat. There is no `box-shadow` anywhere in the build. Depth is conveyed by tone and rule weight: the navy rail and caption bars sit forward, wash bands sit back, a heavy navy rule marks a boundary that matters, and hover answers with a wash fill. The only overlay is the mobile navigation drawer over a 40% navy scrim. In the evidence graph, focus is shown by dimming everything unrelated (edges to 25%, nodes to 35%) rather than lifting the focused node.

**The Flat Paper Rule.** Nothing casts a shadow. When something needs to stand forward, it gets a rule or a navy fill.

## Shapes

Corners are almost square. Controls (buttons, selects, inputs, rail items) take a 3px radius; citation chips, graph nodes and the focus ring take 2px; tags and table cells take none. Fully round shapes are reserved for status dots (6px) and the busy spinner. The citator signals are the system's only expressive shapes: an octagon with a bar, a triangle with an exclamation, a diamond with a plus and a ring with a centre dot, all drawn on a 16-unit grid with white counter-marks. The empty state uses a dashed Rule 2 border; missing-evidence edges use a dashed red stroke.

## Components

### Buttons
Quiet and square, sized for a dense console.
- **Shape:** gently squared corners (3px), 32px tall, 12px side padding, 13px medium Public Sans, 150ms colour transition. A compact 28px height is used inside table rows and worker columns.
- **Primary:** navy ink fill with white text; hover to Pressed Navy; disabled falls to Ink 3. Used once per view for the main act ("File claims", "Approve").
- **Secondary (default):** paper with a Rule 2 border; hover darkens the border to ink and fills with wash.
- **Danger:** paper with red text and a Red Margin border; hover fills Red Slip and the border turns red. The shipped screens use its inline text-only form ("Kill" in worker rows: red text, 2px radius, Red Slip on hover).
- **Ghost:** text only in Ink 2; hover fills wash ("Clear filters").
- **Busy:** a 12px ring spinner in the current colour, and the button disables itself with `aria-busy`.
- **Landing scale:** the same primary and secondary at 44px tall, 20px padding, 14.5px text, with a trailing arrow icon.

### Inputs / Fields
- **Style:** paper fill, 1px Rule 2 border, 3px radius, 32px tall, 13px text, Ink 3 placeholders; the search field carries a 14px search icon inset at 10px.
- **Focus:** hover darkens the border to ink; keyboard focus draws the global 2px Docket Blue outline at 2px offset. The caret is Docket Blue.

### Navigation
- **Console rail:** navy, 232px. The wordmark (inverted) and a "Caseworker console" caption head it. Items are 40px tall, 13.5px, with a 16px line icon at 1.75 stroke; hover fills Rail Hover with white text; the current page is a paper item with semibold ink text. Counts sit right-aligned in mono (claims awaiting review, limited or contradicted precedents, live workers). The footer, over a Rail Rule, shows a steady live dot and a small definition list of the policy world in force, the Supervisor state and the LLM in use.
- **Landing header:** the wordmark left; text links in Ink 2 that darken on hover; a primary "Open the console" button.

### Citator Signal (signature)
The SignalMark is the system. Four SVG shapes on a 16-unit grid, filled with their signal colour and marked in white: negative (octagon and bar), caution (triangle and exclamation), positive (diamond and plus), neutral (grey ring and dot). It renders at 12 to 15px inline, 13px in the docket's precedent strip, 18 to 22px beside a holding or in the landing's fates, and 44px on the citator card. **Treatment** pairs the mark with its label in the matching text colour (caution uses Caution Ink, neutral uses Ink 3) at medium weight. Labels come from one vocabulary: Followed, Superseded, Contradicted, Distinguished, Not relevant, Under review for verdicts; Good law, Limited, Contradicted for memory; Viable, Needs evidence, No basis for dispositions. A signal that arrives on screen is stamped once (`stamp`: scale 1.35 to 1, fade in, 520ms, expo ease).

### Citator Card (signature, landing)
A ruled figure with a 1px ink border: a navy caption bar with the claim ID in mono and the service in Rail Ink; a three-cell ruled fact row with serif values; the refused precedent with a 44px stamped signal, its treatment, the precedent statement in serif and the reason in sans; a two-column comparison of plain RAG and ClaimBridge, each ending in a Treatment; and a wash figcaption stating that the result is real and the data synthetic.

### Docket Table
A full-width ruled table: Label column heads over a Rule 2 underline, rows separated by Rule and filled with wash on hover. The claim cell leads in mono and links to the case. **Step track:** five 5px segments with 3px gaps, ink when done, Docket Blue when a worker holds the step, wash-2 when pending and red when sent to a person, with the status word beneath it turning over (`turn`: rotateX flip, 240ms, two steps, no easing) each time it changes. **Precedent strip:** a row of 13px signals with a tally line ("2 refused · 1 followed"). Above the table, the **stage ledger** is one ruled line of 36px cells (count in semibold tabular, label beside it); the active cell is a navy fill with white text.

### Cite Chip
A 2px-radius chip in 11px mono on wash with a Rule border. Hover or focus highlights it and the graph node it names: the chip turns Citation Highlight with a Docket Blue border and text, and the matching precedent row fills a lighter blue.

### Section Head
A serif 19px title over a 1px navy rule, with an optional 12.5px Ink 3 aside right-aligned on the same baseline. It always takes more space above (48px) than below (12px); only the first head of a column sits flush.

### Evidence Graph
An SVG in four labelled columns (Claim, Policy & evidence, Precedents considered, Grounds). Nodes are 2px-radius rectangles: the claim in navy with white text, precedents stroked in their signal colour with the signal drawn inside, missing evidence filled Red Slip. Edges take their signal colour (1.5px, or 1px Rule 2 when neutral); missing evidence is dashed red. Only the in-column "supersedes" link is labelled. A legend of short rule swatches sits beneath.

### Empty and Error States
Empty is a dashed Rule 2 box with a 17px serif line and a 13px Ink 3 instruction under 52ch. Errors are a 12.5px red line with `role="alert"`, never a toast.

## Do's and Don'ts

### Do:
- **Do** pair every signal colour with its drawn shape and its word, using the labels in `web/lib/vocab.ts`.
- **Do** draw structure with 1px rules: navy (`ink`) under section heads and at band edges, `rule` between rows.
- **Do** set precedent statements, grounds and holdings in Source Serif 4, and every claim, Finding, clause and node ID in JetBrains Mono.
- **Do** keep controls at 32px with a 3px radius, and keep a single primary (navy) button per view.
- **Do** use tabular figures for every number in a column.
- **Do** keep the stamp and the turn as the only authored motions, and switch them off under `prefers-reduced-motion`.
- **Do** keep the synthetic-data and human-approval statement visible on every console page and in the landing footer.

### Don't:
- **Don't** convey a treatment, status or disposition by colour alone, or as a coloured pill.
- **Don't** add box shadows, card chrome or gradients; stand things forward with a rule or a navy fill.
- **Don't** build a row of KPI tiles; counts go in one ruled ledger line.
- **Don't** use red, yellow or green for decoration, branding or emphasis.
- **Don't** set yellow (`caution`) as text on paper; use `caution-ink`.
- **Don't** pulse a liveness indicator; a live state is a steady dot.
- **Don't** round anything beyond 3px except status dots.
- **Don't** add a fourth typeface.
