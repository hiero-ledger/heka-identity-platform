# Design tokens — heka-sso-web-ui

Design tokens extracted from the Figma mockups for the SSO web UI.

- **Source:** [Partisia-SSI-2.0 → page "Web UI"](https://www.figma.com/design/Jn8WMeHR43XHNfwXVaKJjb/Partisia-SSI-2.0?node-id=19932-3467) (file key `Jn8WMeHR43XHNfwXVaKJjb`, page node `19932:3467`)
- **Extracted:** 2026-08-31 via Figma MCP `get_variable_defs`
- **Frames sampled:** `Sign in` (20024:10162), `Configuration` (21040:9390), `Issue credential – Step 1 of 5` (19964:4997)
- **Applied in code:** [`src/styles/design-tokens.scss`](../src/styles/design-tokens.scss) (UI-PLAN.md Phase A, 2026-08-31) — every table below, including the §7 inferred values, is defined there; the file's section order mirrors this document. Change the doc first, then the file.

> **Coverage note.** The Figma MCP allows a View seat on the Pro plan only 6 read calls per month, so only three screens were sampled. Tokens below are the union of variables bound on those screens. Variables that exist in the Figma library but are not used on those three screens (e.g. `space-lg`, `label-s`, `subtitle-s`, `headline-s`, `display`, hover/pressed primaries, error/warning colors) are **not confirmed** from Figma. §7 fills them in by inference from `heka-identity-service-web-ui`, which was built against the same token system; each inferred value carries a confidence level. Re-sample after a seat upgrade or with a designer export.

## 1. Color

Figma reports colors as `#RRGGBBAA`; the alpha column is the rounded percentage.

### Primary

| Figma variable | Value | Alpha | CSS variable (existing / proposed) |
|---|---|---|---|
| `Primary/primary` | `#262629` | — | `--color-primary` |
| `Primary/primary-opacity-6` | `#74747b14` → `rgb(116 116 123 / 8%)` | 8% | `--color-primary-opacity-6` |
| `Primary/dark-outline-medium` | `#00000061` → `rgb(0 0 0 / 38%)` | 38% | `--color-dark-outline-medium` |
| `Primary/dark-divider` | `#0000001a` → `rgb(0 0 0 / 10%)` | 10% | `--color-dark-divider` *(new; same value as `--color-dark-opacity-10`)* |
| `Primary/DSR Branded 2` | `#ffffff` | — | `--color-primary-branded-2` *(new)* |

### On surface (text / icons)

| Figma variable | Value | Alpha | CSS variable |
|---|---|---|---|
| `On Surface/dark-high-emphasis` | `#000000e5` → `rgb(0 0 0 / 90%)` | 90% | `--color-dark-high-emphasis` |
| `On Surface/dark-medium-emphasis` | `#000000a6` → `rgb(0 0 0 / 65%)` | 65% | `--color-dark-medium-emphasis` |
| `On Surface/dark-disabled` | `#00000061` → `rgb(0 0 0 / 38%)` | 38% | `--color-dark-disabled` |
| `On Surface/light-high-emphasis` | `#ffffffe5` → `rgb(255 255 255 / 90%)` | 90% | `--color-light-high-emphasis` |
| `On Surface/light-disabled` | `#ffffff61` → `rgb(255 255 255 / 38%)` | 38% | `--color-light-disabled` |
| `On Surface/text-on-surface` | `#333333` | — | `--color-text-on-surface` |

### Surface

| Figma variable | Value | CSS variable |
|---|---|---|
| `Surface/surface-deep` | `#ffffff` | `--color-surface-deep` |
| `Surface/surface-2` | `#f4f4f4` | `--color-surface-2` |
| `Surface/surface-4` | `#ebebed` | `--color-surface-4` |

### Status / accent (seen on `Configuration`)

| Figma variable | Value | CSS variable (proposed) |
|---|---|---|
| `green-600` | `#1aa179` | `--color-success` |
| `purple_600` | `#6f42c1` | `--color-accent-purple` |
| *(not a variable)* | `#f18d00` | `--color-accent-nav` — menu icon accent. Baked into the icon artwork (identity-service `dashboard-outline.svg`; sibling nav icons use `#f1b500` / `#f16400`), visible on the Figma `Menu` component; not bound to a Figma variable |

These are raw palette names rather than semantic variables in Figma; confirm intended semantics with design before naming them.

## 2. Spacing (`Pixel system/*`)

Base unit 16px. Values confirmed on the sampled frames:

| Figma variable | px | CSS variable |
|---|---|---|
| `space-none` | 0 | `--space-none` |
| `space-xxxs` | 4 | `--space-xxxs` |
| `space-xxs` | 6 | `--space-xxs` |
| `space-xs` | 8 | `--space-xs` |
| `space-sm` | 12 | `--space-sm` |
| `space-md` | 16 | `--space-md` |
| `space-xl` | 24 | `--space-xl` |
| `space-xxl` | 32 | `--space-xxl` |
| `space-xxxl` | 40 | `--space-xxxl` |
| `space-xxxxl` | 48 | `--space-xxxxl` |

Not observed but present in the existing scale: `space-xxxxs` (2), `space-lg` (20), `space-xxxxxl` (72), `space-xxxxxxl` (96), `space-xxxxxxxl` (120).

## 3. Typography

Family: **Inter** (all styles). `size / line-height` in px, letter-spacing 0.

| Figma text style | Weight | Size / Line | CSS variable |
|---|---|---|---|
| `label-m` | 400 Regular | 12 / 16 | `--font-label-m` |
| `label-l` | 500 Medium | 15 / 24 | `--font-label-l` |
| `body-s` | 400 Regular | 14 / 20 | `--font-body-s` |
| `body-m` | 400 Regular | 16 / 24 | `--font-body-m` |
| `subtitle-m` | 600 Semi Bold | 16 / 24 | `--font-subtitle-m` |
| `headline-m` | 600 Semi Bold | 24 / 32 | `--font-headline-m` |
| `headline-l` | 800 Extra Bold | 34 / 40 | `--font-headline-l` |

Not observed on sampled frames: `label-s`, `subtitle-s`, `headline-s`, `display`.

## 4. Effects (shadows)

| Figma style | Value | CSS variable |
|---|---|---|
| `shadow-small` | `0 0 8px rgb(0 0 0 / 7%), 0 2px 4px rgb(0 0 0 / 7%), 0 1px 2px rgb(0 0 0 / 7%)` | `--shadow-small` |
| `large` | `0 6px 13px rgb(74 74 79 / 8%), 0 23px 23px rgb(74 74 79 / 7%), 0 52px 31px rgb(74 74 79 / 4%), 0 93px 37px rgb(74 74 79 / 1%), 0 145px 41px rgb(74 74 79 / 0%), inset 0 0.5px 1px rgb(74 74 79 / 10%)` | `--shadow-elevated` *(new)* |

`large` (used on `Issue credential – Step 1`) is a tinted, five-layer elevation with an inner highlight. Its Figma name is `$large`, not `$shadow-large`, so it is treated as a **separate** style from the existing `shadow-small/medium/large` family rather than a replacement for `--shadow-large`. `shadow-medium` and `shadow-large` were not observed on the sampled frames (inferred in §7).

## 5. Diff against current `src/styles/variables/*`

The SCSS variables in this repo were copied verbatim from `heka-identity-service-web-ui` (warm brown palette). The SSO mockups use a **neutral graphite** palette. Values that must change:

| CSS variable | Current | Figma | Note |
|---|---|---|---|
| `--color-primary` | `#2e2721` | `#262629` | hue shift; `-hover` / `-pressed` derivatives (`#27211c`, `#201b17`) need new values — not in sampled frames |
| `--color-primary-opacity-6` | `rgb(157 116 82 / 8%)` | `rgb(116 116 123 / 8%)` | `-opacity-9` / `-opacity-12` need re-derivation on the new base (`rgb(116 116 123 / 12%)`, `/ 16%`) |
| `--color-surface-2` | `#f7f4f1` | `#f4f4f4` | |
| `--color-surface-4` | `#f1ece7` | `#ebebed` | |
| `--color-primary-hiero-branded-2` | `#b81a56` | *(n/a)* | Figma has `DSR Branded 2 = #ffffff` instead; rename to `--color-primary-branded-2` |

Unchanged (values match Figma): all `--color-dark-*` / `--color-light-*` emphasis and disabled tokens, `--color-text-on-surface`, `--color-surface-deep`, `--color-dark-outline-medium`, the spacing scale, all seven observed text styles, `--shadow-small`.

New tokens to add: `--color-dark-divider`, `--color-success` (`#1aa179`), `--color-accent-purple` (`#6f42c1`), `--color-primary-branded-2`, `--shadow-elevated`.

## 5a. Motion (proposed — no motion tokens in Figma)

| CSS variable | Value | Use |
|---|---|---|
| `--motion-duration-enter` | `180ms` | shell/screen fade-in when a screen mounts (identity-service uses a 200 ms transform transition) |
| `--motion-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | standard ease-out |

Both are disabled under `prefers-reduced-motion: reduce`.

## 6. Layout facts from the mockups (from page metadata)

- Desktop canvas: **1280 × 720**; mobile variants: **360** wide.
- Shell: left `Menu` **288px** wide, full height; right panel 992px with an 8px inset `Body`.
- Inside `Body`: a 288px `Header` column and a 680px content column with 48px padding.
- `Header` column on `Sign in`: H1 at (48, 48); illustration at (48, 280), 434 × 360, overflowing (clipped by) the column. The column's fill is the `DSR Branded 2` token (`#fff`), i.e. it sits flat on the body surface rather than as a tinted box — identity-service's branded `BasicPanel` background does **not** carry over. In code: `--layout-illustration-size` 434px (the Figma width) / `--layout-illustration-size-mobile` 160px. Asset: `src/assets/wallet.webp` = identity-service's `public/wallet.png` (1024² with transparent margins) cropped to its opaque box (823 × 676 — the same 1.22 aspect as Figma's 434 × 360 placement) and saved as WebP (~98 KB vs 700 KB); with the crop, Figma's offsets apply verbatim. The authenticated shell's header column (Figma "Issue credential") uses `many-wallets.webp` the same way (source `many-wallets.png` 1024², opaque box 831 × 837, WebP ~97 KB) at 434 px, offsets 32 px left / 16 px bottom — measured from the frame image, not Figma metadata.
- Screen inventory: Sign in, Create account, Registration, Password, Profile, Configuration, Issue credential (5 steps + offer/received), Verify credential (4 steps + request/verified), Create schema, Create credential definition, Edit/View/Save-as-template, Confirmation, Demo.

## 7. Inferred tokens (from `heka-identity-service-web-ui`)

### Method

`heka-identity-service-web-ui/src/app/styles/variables/*` was built against the same Figma token system (identical variable names: `Pixel system/space-*`, `On Surface/*`, `Surface/*`, `$label-m`, `$shadow-small`, …). Of everything Figma confirmed on the three sampled frames, **every neutral/structural token matched identity-service exactly** — all 7 text styles, all 10 spacing steps, all 8 black/white alpha colors, `shadow-small`. Only brand-tinted values changed (primary, the primary-opacity base, `surface-2/4`, the branded slot).

Rule used below:

- **Neutral / structural tokens → inherit as-is.** Confidence: **high**.
- **Brand-tinted derivatives → re-derive from the confirmed SSO base using the same ratios identity-service used.** Confidence: **medium**.
- **Semantic colors with no SSO evidence → inherit with a flag.** Confidence: **low**.

### 7.1 Derived brand tokens (medium)

Derivation check on identity-service: `primary-hover = primary × 0.85` per RGB channel (`#2e2721 → #27211c`, channel ratios 0.848 / 0.846 / 0.848) and `primary-pressed = primary × 0.70` (`→ #201b17`, ratios 0.696 / 0.692 / 0.697). The opacity trio steps alpha 8 → 12 → 16 % on one tinted base. Applying the same rules to the confirmed SSO values:

| CSS variable | Inferred value | Derivation |
|---|---|---|
| `--color-primary-hover` | `#202023` | `#262629` × 0.85 |
| `--color-primary-pressed` | `#1b1b1d` | `#262629` × 0.70 |
| `--color-primary-opacity-9` | `rgb(116 116 123 / 12%)` | confirmed `opacity-6` base, +4 % alpha |
| `--color-primary-opacity-12` | `rgb(116 116 123 / 16%)` | confirmed `opacity-6` base, +8 % alpha |
| `--color-primary-branded-2` | `#ffffff` | confirmed; replaces `--color-primary-hiero-branded-2`. In identity-service that slot paints hero backgrounds (`Panel`, `Home`, `CredentialOffer`, `VerificationRequest`) — on SSO those blocks become white, so check contrast against `surface-2` when porting them |

### 7.2 Inherited unchanged (high)

| Group | Tokens |
|---|---|
| Neutral alphas | `--color-dark-opacity-05/08/10/30/33/36`, `--color-light-opacity-20`, `--color-light-medium-emphasis`, `--color-dark-outline-high` (65 %) |
| Surfaces | `--color-surface-grey-2 #edeff1` (already neutral-cool; only used as the default `border()` mixin color) |
| Spacing | `--space-xxxxs` 2, `--space-lg` 20, `--space-xxxxxl` 72, `--space-xxxxxxl` 96, `--space-xxxxxxxl` 120, and the layout constants (`--space-form` 336, `--space-template-card-*`, `--space-card-logo`, …) |
| Typography | `label-s` 400 11/16 · `subtitle-s` 500 14/20 · `headline-s` 600 20/28 · `display` 300 56/64, letter-spacing −1 % |
| Effects | `--shadow-medium` (3 neutral layers @ 7 %), `--shadow-large` (3 neutral layers @ 7 %), `--outline-width` 2px; focus ring = `--color-primary` solid 2px, offset 2px (`outline` mixin) |

### 7.3 Semantic / status colors

| CSS variable | Value | Confidence | Basis |
|---|---|---|---|
| `--color-success` | `#1aa179` | high | Figma `green-600` on `Configuration`. Supersedes the hard-coded `#2e7d32` in identity-service `AgeVerificationDemo` |
| `--color-notification` | `#ef2727` | low | identity-service value, 21 usages (badges, error text). Not present on sampled frames |
| `--color-error` | `= --color-notification` | low | identity-service also hard-codes `#c62828` for error backgrounds; propose collapsing onto one red until Figma confirms |
| `--color-accent-purple` | `#6f42c1` | high (value) / low (semantics) | Figma `purple_600` on `Configuration`; role unknown |

### 7.4 Radius conventions (high — usage survey, 70 sites)

Neither Figma nor identity-service defines radius variables; radii reuse the spacing scale. Conventions observed in identity-service:

| Use | Token | px |
|---|---|---|
| Checkbox | `--space-xxxs` | 4 |
| Small buttons, chips, toasts, color swatches, inline list items | `--space-xs` | 8 |
| Buttons, text inputs, selects, textareas, nav-menu items | `--space-sm` | 12 |
| Cards, panels, popup menus, schema/template tiles, QR block | `--space-md` | 16 |
| Hero blocks, large panels | `--space-xl` | 24 |
| Layout shells, modals, registration cards | `--space-xxl` | 32 |
| Avatars, stepper dots | `50%` | — |

Optional aliases if a radius scale is wanted: `--radius-xs/sm/md/lg/xl` = 4 / 8 / 12 / 16 / 32.

### 7.5 Ad-hoc values in identity-service worth tokenising

| Value | Where | Proposed token |
|---|---|---|
| `rgb(0 0 0 / 50%)` | `Panel` modal backdrop | `--color-backdrop` |
| `0 4px 6px rgb(0 0 0 / 10%)` | `Panel`, `Schema`, `Template` card hover | `--shadow-card-hover` |
| `0 8px 20px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 6%)` | `Template` drag state | `--shadow-card-drag` |

## Gaps / follow-ups

1. **Still unconfirmed by Figma:** hover/pressed primaries and opacity-9/12 (§7.1), the red(s) (§7.3), the role of `purple_600`, whether SSO mockups use the same radius conventions (§7.4), and where `$large` (`--shadow-elevated`) vs `shadow-large` is meant to apply.
2. **Rate limit:** View seat on Figma Pro = 6 MCP calls/month (Full/Dev seat = 200/day). To confirm the above, either upgrade the seat or get a variables export (Figma → Variables → Export / Tokens Studio JSON).
3. **Next frames to sample** when calls are available — mobile first, since the same-device demo path runs on a phone (UI-PLAN.md §2.4): the 360-wide `Issue credential – Step 1 of 5` (20065:6651), `Configuration` (22169:8754) and `Demo` (23826:9520) for mobile paddings/radius/type step-down; then `Confirmation` (21182:28537) for error/notification red, a `Popup` (21164:28350) for elevation/radius, `Profile` (21106:23536), `Create schema` (21040:6939).
4. `src/styles/index.scss` says variables are kept in sync with identity-service by re-copying. The palettes have diverged, so `colors.scss` needs to become an SSO-owned file (or an override layer loaded after the copy); `pixel-system.scss`, `typography.scss`, `global.scss` can stay shared.
