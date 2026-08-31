# UI plan — heka-sso-web-ui on the new design system

Plan for moving the test RP's UI onto the Partisia-SSI-2.0 design system (see [DESIGN-TOKENS.md](DESIGN-TOKENS.md)) and making it presentable for the wallet-login demo ([heka-sso-service/docs/DEMO.md](../../heka-sso-service/docs/DEMO.md)), while staying visually consistent with `heka-identity-service-web-ui`.

Status: **in progress** — proposed 2026-08-31; **Phase A done** 2026-08-31 (`design-tokens.scss` in place, `variables/` removed, svgr wired, icons copied, favicon/title updated).

## 0. Where we are

| Area | Today |
|---|---|
| Stack | React 19, Vite 6, `react-aria-components`, SCSS modules. No router, no state library (by design — INTEGRATION.md §"Test RP UI"). |
| Styles | `src/styles/` = verbatim copy of identity-service's `reset.scss`, `variables/*`, `mixins.scss` (P2.9 rule: "re-copy to sync, never edit"). Warm-brown palette (`#2e2721`). |
| Components | One `Button` (`filled` / `outlined` only). |
| Screens | All in `App.tsx`: top bar + centered main; states **Signing in…** (plain text) → **Dashboard** (claims table card + raw-token `<details>`) / **Sign-in failed** card / **Signed out** card. |
| Auth | `AuthSession` contract bridged from Keycloak (`react-oidc-context`) or Auth0. Unauthenticated visit auto-redirects to the IdP. `kc_idp_hint` is **not** sent (known doc/code mismatch, P2.9 note). |
| Demo chain | RP → Keycloak stock login page ("Sign in with wallet" button) → bridge login page (DC API / QR) → wallet → RP dashboard → Sign out → bridge logout confirm → Keycloak login page. |

What the audience actually sees in the demo is **three UIs in a row**: this app, Keycloak's pages, and the bridge's login/logout pages. Consistency has to be judged across that chain, not just inside this repo. Keycloak's pages get a custom theme built with **Keycloakify** (§2.5, Phase K); the bridge pages follow via Phase E1.

## 1. Goals and boundaries

Goals

1. Adopt the new tokens (graphite palette, Inter scale, pixel system) and the new shell (Figma: 1280×720 canvas, 288 px left column, 8 px inset, white rounded body).
2. Mirror `heka-identity-service-web-ui`'s structure and components so the two apps read as one product: same layout skeleton, same Button/Grid/Logo/Loader pixels, same table/card treatment.
3. Make every state the demo passes through look intentional — no unstyled "Signing in…" flash, no raw JSON as the first thing on screen.
4. Stay a thin RP: presentation only.

Hard boundaries (unchanged from INTEGRATION.md)

- No wallet or bridge logic; no direct calls to heka-sso-service or heka-identity-service.
- The `AuthSession` contract and the state machine in `App.tsx` (auto-redirect, callback guards, `SIGNED_OUT_KEY`) stay as they are. New screens are rendered *from* those states, not new states.
- No routing / state library unless a screen genuinely needs it (it doesn't — see §3).
- Shared pixels, not semantics: components are **copied** from identity-service-web-ui and trimmed, never imported across repos.

Assumption stated up front: the Figma "Web UI" page is the design for `heka-identity-service-web-ui`; there is no dedicated RP mockup. This app therefore takes the **shell, tokens and component pixels** from Figma and identity-service, and composes its own three or four screens from them. Where identity-service still carries the old palette, **the tokens win** (this app moves first; identity-service and the bridge page follow — §6).

## 2. Target design

### 2.1 Tokens — one SCSS constants file

All CSS constants live in **`src/styles/design-tokens.scss`**, written once from DESIGN-TOKENS.md and reused by every component. It replaces the four copied `variables/*.scss` files as this app's source of truth (they were verbatim copies of identity-service and now carry the wrong palette). `reset.scss` and `mixins.scss` remain verbatim copies; `mixins.scss` is re-pointed at the new constants where it references a variable (`outline`, `border`).

One `:root` block, sections in the order of DESIGN-TOKENS.md, every name traceable to a row there (inferred values carry a `// inferred, DESIGN-TOKENS §7.x` comment so they're easy to revisit):

```scss
// src/styles/design-tokens.scss — the only place CSS constants are defined.
// Source: docs/DESIGN-TOKENS.md. Change the doc first, then this file.
:root {
  // 1. Color — primary
  --color-primary: #262629;
  --color-primary-hover: #202023;                     // inferred, DESIGN-TOKENS §7.1
  --color-primary-pressed: #1b1b1d;                   // inferred, DESIGN-TOKENS §7.1
  --color-primary-opacity-6: rgb(116 116 123 / 8%);
  --color-primary-opacity-9: rgb(116 116 123 / 12%);  // inferred, DESIGN-TOKENS §7.1
  --color-primary-opacity-12: rgb(116 116 123 / 16%); // inferred, DESIGN-TOKENS §7.1
  --color-primary-branded-2: #fff;

  // 1. Color — on surface (text / icons / dividers)
  --color-dark-high-emphasis, -medium-emphasis, -disabled, -divider, -outline-medium, -outline-high,
  --color-dark-opacity-05 / 08 / 10 / 30 / 33 / 36,
  --color-light-high-emphasis, -medium-emphasis, -disabled, -opacity-20,
  --color-text-on-surface

  // 1. Color — surface
  --color-surface-deep, --color-surface-2, --color-surface-4, --color-surface-grey-2, --color-backdrop

  // 1. Color — status
  --color-success: #1aa179;  --color-notification: #ef2727;  --color-error: var(--color-notification);
  --color-accent-purple: #6f42c1;

  // 2. Spacing — pixel system (16px unit; DESIGN-TOKENS §2 + §7.2)
  --space-unit … --space-xxxxxxxl, --space-form
  // 2. Spacing — layout geometry from the Figma shell (§2.2)
  --layout-sidebar-width: 288px;  --layout-header-panel-width: 288px;  --layout-content-width: 680px;
  --layout-body-inset: var(--space-xs);  --layout-content-padding: var(--space-xxxxl);

  // 3. Radius — aliases of the spacing scale (DESIGN-TOKENS §7.4)
  --radius-xs: 4px;  --radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;  --radius-xl: 24px;  --radius-xxl: 32px;

  // 4. Typography — Inter; sizes, line-heights and `font` shorthands for the 11 text styles (DESIGN-TOKENS §3 + §7.2)
  --inter-font-family, --font-size-*, --font-line-*, --font-label-s … --font-display

  // 5. Effects (DESIGN-TOKENS §4 + §7.2 + §7.5)
  --shadow-small, --shadow-medium, --shadow-large, --shadow-elevated, --shadow-card-hover, --outline-width
}
```

Rules for reuse:

- Component SCSS uses **only** `var(--…)` names from this file — no literal colors, px sizes, font sizes, or shadows in `*.module.scss`. Allowed literals: `0`, `1px` borders, `50%` radius, `100%`/`auto` sizes. Enforced by a grep check in Phase F (stylelint `declaration-property-value-disallowed-list` is the optional stricter version).
- Radii use `--radius-*`, not `--space-*`, so the two scales can diverge later without touching components.
- The Google Fonts `@import` and the `.text-*` utility classes stay in `index.scss` — the tokens file is pure constants.
- Adding a constant means adding a row to DESIGN-TOKENS.md first.

### 2.2 Shell (desktop ≥ 1024)

```
┌ surface-2 ──────────────────────────────────────────────────────────┐
│ ┌ sidebar 288 ┐ ┌ white body, radius 32, 8px inset ────────────────┐ │
│ │ Logo        │ │ ┌ header column 288 ┐ ┌ content 680 (pad 48) ──┐ │ │
│ │ nav items   │ │ │ H1 / illustration │ │ cards, tables, forms   │ │ │
│ │ …           │ │ │                   │ │                        │ │ │
│ │ user ▸ out  │ │ └───────────────────┘ └────────────────────────┘ │ │
│ └─────────────┘ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

This is identity-service's `AuthenticatedLayout` (sidebar `22.5 %` ≈ 288 px @ 1280, content `surface-deep` radius `--space-xxl`, `--space-xs` gutters) with Figma's measured widths. The unauthenticated variant (`UnauthenticatedLayout` / Figma "Sign in") drops the sidebar: one white body with a 288 px **header panel** (title + illustration) and the content column.

Below 1024 px the shell stacks — see §2.4.

### 2.3 Screens

| State (`App.tsx`) | Screen | Content |
|---|---|---|
| `isLoading` / redirecting | **Splash** | Unauthenticated shell, header panel "Signing you in", centered `Loader` (linear spinner) + "Redirecting to \<IdP\>…". Replaces the bare `<p>`. |
| `signedOut` landing, and first visit when auto-sign-in is off | **Welcome** | Unauthenticated shell. Header panel: "Sign in" + wallet illustration (identity-service `wallet-new.svg`). Content: product name, one-line pitch ("Sign in to \<App\> with a verifiable credential from your wallet"), primary **Sign in with wallet** button, muted line "via Keycloak / Auth0". Mirrors Figma "Sign in" body (title / fields block / divider / secondary action) minus the password fields. |
| `error` | **Sign-in failed** | Same shell; error card with `--color-notification` accent, message, **Try again** (filled) and **Back** (text). |
| `isAuthenticated` | **Dashboard** | Authenticated shell. Sidebar: logo, nav (`Dashboard` active; nothing else for now), footer with user name (`given_name family_name` or `sub`) and **Sign out** (text button + `logout.svg`). Content column, top→bottom: <br>1. **Page header** — H1 "Welcome, \<given_name\>", subtitle "Signed in with your wallet via Keycloak" (from `amr` contains `vc` → "with your wallet"; otherwise "via \<provider\>"). <br>2. **Identity card** — the presented attributes rendered as label/value rows: `given_name`, `family_name`, `email` (or "not shared"), `age_over_18` as a `--color-success` "Verified 18+" badge when `true`. Source: `vc_presented_attributes` first, top-level claims as fallback. <br>3. **Session card** — provider, `amr` chips, `sub`, `auth_time`/`exp` formatted. <br>4. **Developer** `<details>` — the raw ID-token JSON (kept per P2.9; collapsed, `surface-4` code block). |

Copy is English only; no i18n framework (identity-service has `react-i18next`, but a four-screen RP doesn't need it — keep strings in one `src/copy.ts` so they're easy to find).

### 2.4 Mobile (≤ 640) and tablet (640–1024)

Mobile is a **primary** surface, not a fallback: the demo's preferred path is same-device DC API — "Chrome on Android with a wallet installed" (DEMO.md §6) — where the Welcome screen, the Keycloak login page, the bridge page and the Dashboard are all viewed on the phone.

Breakpoints are the existing mixins: `mobile` ≤ 640, `tablet` 640–1024, `desktop` ≥ 1024 (identity-service's `Screen` hooks use the same numbers). Design widths to check: **360** (Figma mobile frames), **412** (typical Android), **768** (tablet portrait).

Stacked shell (< 1024, both variants):

```
┌ surface-2, inset 8 ───────────────┐
│ ┌ white body, radius 32 ────────┐ │
│ │ top row: Logo … [Sign out]    │ │   AppLayout only
│ │ TopPanel: title + small illus.│ │   AuthLayout only (identity-service `TopPanel`, 160×140 icon)
│ │ content, padding 16 (24 tablet)│ │
│ │ …                              │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

- Sidebar → a top row with the logo left and a **Sign out** text button (logout icon + label) right. No nav (one page), no bottom menu.
- Header panel → `TopPanel` (title as a row above the content with the illustration at reduced size), exactly as identity-service's `UnauthenticatedLayout` does on `MobileView`.
- Content padding `--space-md` on mobile, `--space-xl` on tablet (identity-service's values); body radius and 8 px inset are kept.
- Tablet = the stacked shell with tablet paddings; no third layout.

Per-screen behaviour:

| Screen | Mobile / tablet |
|---|---|
| Splash | TopPanel "Signing you in"; loader centered in the remaining height. |
| Welcome | TopPanel "Sign in" + wallet illustration; content column: product name (`headline-s`), pitch, **full-width** "Sign in with wallet" button, muted provider line. |
| Sign-in failed | Error card full width; buttons stacked full width (filled "Try again", then text "Back"). |
| Dashboard | Top row as above. Page header steps down one size (`headline-m` → `headline-s`). Cards full width, radius `--radius-lg`, padding `--space-md`. Key/value rows **stack** label (`label-m`, muted) over value (`body-m`); badges inline after the value. Developer `<details>`: the `<pre>` scrolls horizontally inside the card (`overflow-x: auto`), never the page. |

Rules that apply everywhere (app and Keycloak theme):

- Full-height shells use `100dvh` with the `--visual-viewport-height` fallback identity-service already uses — never bare `100vh` on mobile (address bar / keyboard).
- Tap targets ≥ 44 px (the platform `Button` is 48 px); primary actions full width on mobile.
- No hover-only affordances; react-aria `data-pressed` states carry the feedback.
- Long values (`sub`, emails, JSON) use the `long-text-full` mixin (wrap anywhere); the page body never scrolls horizontally.
- `padding: env(safe-area-inset-*)` on the outer shell.
- Form inputs (Keycloak profile pages) use `body-m` (16 px) so iOS doesn't zoom on focus; `autocomplete` attributes set.
- Type scale is unchanged from the tokens — only headings step down one size on mobile.

Caveat: the Figma 360-wide frames were not read (call budget), so mobile geometry follows identity-service, not the design. DESIGN-TOKENS.md's next-frames list now prioritises them.

### 2.5 Keycloak screens (Keycloakify)

Keycloak's own pages are themed with [Keycloakify](https://www.keycloakify.dev/) (v11, React + Vite, TypeScript) so the middle of the demo chain uses the same shell and tokens. The theme is a sibling project **`heka-keycloak-theme/`** at the repo root (own toolchain, like every other `heka-*` folder); its build output is a jar that the `heka-sso-service` dev compose mounts into Keycloak 26.3.

Design: the Keycloak **login page becomes the Figma "Sign in" screen** — `AuthLayout` shell (288 px header panel with title + wallet illustration, 360 px action column). Wallet-first: the `heka-sso` identity provider is rendered as the primary CTA **"Sign in with wallet"** (wallet icon), then a divider, then the username/password form (or nothing, when the realm has local login disabled). Every other Keycloak page inherits the same shell through the ejected `Template.tsx`.

Pages to eject and style explicitly (the ones the demo chain can hit):

| Keycloak page | When it appears | Treatment |
|---|---|---|
| `login.ftl` | Entry into the realm (unless bypassed by `kc_idp_hint`) | The "Sign in" screen above |
| `error.ftl`, `info.ftl`, `login-page-expired.ftl` | Wallet timeout / bridge error / back-button during the demo | Error card in `AuthLayout`; primary action "Back to sign in" |
| `login-update-profile.ftl`, `idp-review-user-profile.ftl` | First-broker-login "Review Profile" (the realm makes email optional, but the step can still fire) | Form styled with the platform `TextInput` pixels |
| `login-idp-link-confirm.ftl`, `login-idp-link-email.ftl` | A local user with the same email already exists | Confirmation card |
| `logout-confirm.ftl` | RP-initiated logout without `id_token_hint` | Confirmation card |

Everything else keeps Keycloakify's defaults inside our shell. `doUseDefaultCss={false}` — PatternFly/`keycloak.v2` CSS is dropped entirely; styling comes from a copy of `design-tokens.scss` + `reset.scss` + `mixins.scss` (shared pixels rule), with Inter bundled as `woff2` inside the jar so the login page never depends on a CDN. Text overrides (button labels, titles) via Keycloakify's `i18n` message overrides, English only. Account, admin and email themes: out of scope.

Relation to D1 (`kc_idp_hint`): once the theme exists, showing the Keycloak page is acceptable and even useful (it demonstrates the "choose how to sign in" moment). `VITE_KC_IDP_HINT` stays configurable; pick the default for the demo in D4 after seeing both.

## 3. Component inventory

Copied from `heka-identity-service-web-ui` and trimmed (no Redux/i18n/router deps):

| Component | Source | Notes |
|---|---|---|
| `Button` | `shared/ui/Button` | Extend the existing wrapper to the full variant set (`filled`, `outlined`, `tonal`, `text`) + `leftIcon`/`rightIcon` + `small`. Drop `elevated`, `shutter`, loader. |
| `Row` / `Column` | `shared/ui/Grid` | Flex helpers; identical. |
| `Logo` | `components/Logo` | react-aria `Button` wrapping an SVG. Asset: a neutral wordmark for now (Figma has "DSR Agency"/"DSR Wallet" logo blocks, 24 px app icon + wordmark — export when Figma calls are available; until then text wordmark in `--font-headline-s`). |
| `Loader` | `shared/ui/Loader` | `spinner.svg` / `linear-spinner.svg`. |
| `DesktopView` / `MobileView` hooks | `components/Screen` | Needs `react-responsive` (small dep) — or reimplement with `matchMedia`; the SCSS `mobile/tablet/desktop` mixins already carry the breakpoints. Prefer `matchMedia` to avoid the dep. |
| `HeaderPanel` | `components/Panel` (`BasicPanel`) | Title + illustration column. Background becomes `--color-primary-branded-2` (white) per Figma — check contrast; if it disappears against the body, use `--color-surface-2`. |
| `Card`, `KeyValueList`, `Badge` | new (pixels from `DashboardPage.module.scss` + Figma Card/Popup radii) | Card: `surface-deep`, radius `--space-md`, `--shadow-small`. Badge: `label-m`, radius `--space-xs`, success/neutral variants. |
| `AppLayout` / `AuthLayout` | `components/Layout` | Two shells from §2.2. |

Icons: copy only what's used (`logout.svg`, `user.svg`, `wallet-new.svg`, `spinner.svg`, `linear-spinner.svg`, `success.svg`, `arrow-back.svg`). Needs `vite-plugin-svgr` (identity-service imports SVGs as components).

## 4. Work breakdown

### Phase A — Foundation (tokens, tooling) · ~0.5 day · ✅ done 2026-08-31

Notes from doing it: the unused `.text-*` utility classes were dropped rather than moved to `index.scss`; the dashboard card's `max-width: 720px` became `var(--layout-content-width)` (680 px) so no px literal remains; `wallet-new.svg` is a 200 KB SVG with an embedded raster — replace with a vector export when Figma calls are available. A3 was done by reading the built CSS rather than in a browser (same values, no runtime needed).

- A1. **Create `src/styles/design-tokens.scss`** per §2.1: every constant from DESIGN-TOKENS.md (colors incl. §7 inferred values, spacing, layout geometry, radius aliases, typography, effects), sectioned and commented. `index.scss` imports it instead of `variables/*`; delete `src/styles/variables/`. Update the `index.scss` header comment (only `reset.scss`/`mixins.scss` are still copies).
- A2. Migrate existing consumers: grep every `var(--…)` in `App.module.scss`, `DashboardPage.module.scss`, `Button.module.scss`, `mixins.scss` and confirm each name exists in the new file (a missing custom property fails silently to `initial`). Switch `border-radius: var(--space-*)` to `--radius-*`.
- A3. Sanity check: `yarn build`, then in the browser compare `getComputedStyle(document.documentElement)` for a sample of names against the DESIGN-TOKENS tables (primary, surface-2, space-md, font-body-s, shadow-small).
- A4. Add `vite-plugin-svgr`, `src/assets/icons/*` (list in §3), `src/vite-env.d.ts` typing for `*.svg?react`.
- A5. `index.html`: title "Heka demo app" (or the product name agreed for the demo), favicon from the logo, drop `vite.svg`.
- A6. DESIGN-TOKENS.md: add an "Applied in `design-tokens.scss`" note at the top and tick §5's change list.

Phases B–D below build **only** on the constants from A1 — see the reuse rules in §2.1.

### Phase B — Shell and shared components · ~1 day · ✅ done 2026-08-31

Notes from doing it: `Screen` uses `matchMedia` + `useSyncExternalStore` (no `react-responsive`); a `stacked` mixin (`< 1024px`) was added locally to `mixins.scss`. The copied icons carry identity-service's brand fills, so `vite.config.ts` maps them to `currentColor` via svgr `replaceAttrValues` (SVG files stay verbatim). Header panel decision (risk 3): Figma binds `DSR Branded 2 = #fff` on the header column, so it sits flat on the white body with the illustration clipped bottom-left — no tinted box; recorded in DESIGN-TOKENS §6. Added `preview.html` + `src/dev/preview.tsx`: a dev-only entry (`?state=dashboard|splash|error|signed-out`) mounting `App` on a fake `AuthSession`, so screens can be checked without an IdP — not part of the production build. Verified with CDP viewport emulation (headless Edge clamps `--window-size` to ~500 px, so plain screenshots mislead at phone widths): no horizontal overflow at 360 / 768 / 1280 in any state. `copy.ts` and `claims.ts` were started here (shell strings, `displayName`); C extends them.

- B1. Copy/trim `Grid`, `Logo`, `Loader`, `Screen` (matchMedia variant), extend `Button`.
- B2. `AppLayout` (sidebar + body) and `AuthLayout` (header panel + content); desktop per §2.2, stacked shell below 1024 per §2.4 (top row, `TopPanel`, `100dvh` + `--visual-viewport-height`, safe-area padding).
- B3. `Card`, `KeyValueList`, `Badge`.
- B4. Replace `App.tsx`'s top bar/main with the layouts; state switch untouched.

### Phase C — Screens · ~1 day

- C1. `SplashPage`, `WelcomePage`, `SignInErrorPage` (three thin components sharing `AuthLayout`).
- C2. `DashboardPage` rebuilt per §2.3: claim selection/formatting in `src/claims.ts` (pure functions: pick presented attributes, derive display name, `amr` → label, timestamps).
- C3. `src/copy.ts` with all strings.
- C4. Mobile pass on every screen against the §2.4 table at 360 / 412 / 768 in devtools: stacked key/value rows, full-width buttons, heading step-down, no horizontal page scroll with a long `sub`/JSON.

### Phase D — Demo polish · ~0.5 day

- D1. **Optionally skip the IdP page**: send `kc_idp_hint=heka-sso` (Keycloak `extraQueryParams`) — reconciles the code with INTEGRATION.md U.2; Auth0 already has `VITE_AUTH0_CONNECTION`. Behind `VITE_KC_IDP_HINT` (default `heka-sso`, empty to disable). With the Phase K theme in place the page is branded, so the demo default is decided in D4 (§2.5).
- D2. `VITE_AUTO_SIGN_IN` (default `true` = today's behavior). `false` lands on **Welcome** first so the presenter clicks "Sign in with wallet" on-screen. `.env.example` + README documented; DEMO.md §5 gets the recommended demo values.
- D3. Sign-out returns to **Welcome** (already the case via `SIGNED_OUT_KEY`) — verify the copy reads as an end state ("You're signed out" + Sign in again).
- D4. Run the full DEMO.md loop twice: (a) **desktop + QR** at 1280×720 (Keycloak compose + bridge + wallet on the phone, and once with the dev stub); (b) **same-device DC API on a real Android phone** (Chrome + heka-wallet) — the whole chain on the phone screen, including the Keycloak page and the bridge page. Fix anything that wraps, overflows, flashes, or hides behind the keyboard/address bar. Capture screenshots of both runs into `docs/screenshots/` for the README.

### Phase K — Keycloak theme with Keycloakify · ~2 days

Depends on A1 (tokens) and B2/B3 (the `AuthLayout` shell and card pixels it mirrors). Can run in parallel with C/D.

- K1. **Scaffold** `heka-keycloak-theme/` from `keycloakify-starter` (Vite + React + TS; pin the React version the starter supports). `vite.config.ts`: `keycloakify({ themeName: 'heka', accountThemeImplementation: 'none' })`. Prerequisites on the build machine: Java + Maven (Keycloakify ≥ 10 packages the jar with Maven) — verify against the starter's README for the pinned version.
- K2. **Tokens**: copy `design-tokens.scss`, `reset.scss`, `mixins.scss` from this repo into `heka-keycloak-theme/src/styles/` (shared pixels rule; re-copy to sync). Bundle Inter `woff2` files locally; `@font-face` in the theme, no Google Fonts import.
- K3. **Shell**: eject `Template.tsx`; rebuild it as the `AuthLayout` from §2.2 with the §2.4 stacked variant below 1024 (this is the page the phone shows on the DC API path). `KcPage` with `doUseDefaultCss={false}`.
- K4. **Pages**: `npx keycloakify eject-page` for the pages in §2.5. `Login.tsx`: wallet-first layout — the `social.providers` entry with alias `heka-sso` rendered as the primary `Button` (filled, wallet icon), divider, then the credentials form (respect `realm.password` / `registrationAllowed` flags). Error/info/expired pages → error card; profile/link/logout pages → form/confirmation cards using the ported `TextInput`/`Button` pixels.
- K5. **Copy**: `i18n.ts` message overrides (page titles, "Sign in with wallet", error wording). English only.
- K6. **Visual iteration**: `npx keycloakify add-story` for each ejected page; Storybook is the fast loop (no Keycloak needed) — check 1280×720 and 360 wide, and the error/expired variants.
- K7. **Build & wiring** in `heka-sso-service`: `npx keycloakify build` → `dist_keycloak/*.jar` (use the variant Keycloakify emits for Keycloak 26). `docker-compose.dev.yml`: mount the jar at `/opt/keycloak/providers/heka-theme.jar:ro` and add the dev flags that disable theme caching (`--spi-theme-static-max-age=-1 --spi-theme-cache-themes=false --spi-theme-cache-templates=false`); `keycloak/realm-heka.json`: `"loginTheme": "heka"`. `npx keycloakify start-keycloak` is the alternative for local iteration against a throwaway Keycloak.
- K8. **Verify in the chain**: DEMO.md loop with `VITE_KC_IDP_HINT=` (empty) so the themed login page is shown — on desktop **and** on the Android phone (DC API path); force an error path (cancel in the wallet, let a request expire) to see `error.ftl` / `login-page-expired.ftl`; first-broker-login with a fresh user to see whether the review-profile page fires, and if it does, fill the form on the phone with the keyboard open. Fix, rebuild jar, re-run.
- K9. **Docs & CI**: `heka-keycloak-theme/README.md` (build, where the jar goes, how to re-sync tokens); DEMO.md §1 mentions the theme; a CI job that builds the jar and uploads it as an artifact (Java + Maven setup step).

### Phase E — Cross-app consistency (follow-ups, separate PRs) · not in this estimate

- E1. **Bridge login/logout pages** (`heka-sso-service/ui/src/styles/colors.scss`): apply the same tokens so the middle of the demo chain matches. The `--brand-*` layer already maps onto the tokens, so this is a file copy + visual check.
- E2. **identity-service-web-ui**: same tokens + rename of `--color-primary-hiero-branded-2`; its 6 hero backgrounds turn white, which needs a design decision (Figma header panels appear to be on the body surface, not a tinted block).
- E3. Auth0 Universal Login branding (the Auth0 demo path) — Auth0's own branding settings/page templates, not Keycloakify; only if the Auth0 path is demoed.

### Phase F — Verification · ~0.5 day

- `yarn lint`, `yarn build`, `tsc -b` clean.
- Token discipline: `grep -rnE "#[0-9a-f]{3,8}\b|rgba?\(|[0-9]+px" src --include=*.module.scss` returns nothing outside the allowed literals (§2.1); `grep -rhoE "var\(--[a-z0-9-]+\)" src | sort -u` is a subset of the names defined in `design-tokens.scss`.
- Manual matrix: Keycloak + Auth0 providers × {auto sign-in on/off} × {1280, 768, 412, 360}. Keyboard: Tab order through Welcome → button, Dashboard → sign out; visible focus ring (`outline` mixin).
- Mobile checks (§2.4): no horizontal page scroll at 360 with a long `sub` and the raw JSON open; tap targets ≥ 44 px; shells sized with `dvh`, not `vh`; safe-area padding present.
- No console errors/warnings in the browser during the loop.

Totals: **~4 days** for this repo (A–D, F; the mobile pass adds ~0.5 across C4/D4/F) + **~2 days** for the Keycloak theme (K, its own project) = **~6 developer-days**. E is tracked separately.

## 5. File-level changes

```
heka-sso-web-ui/
  index.html                          title, favicon
  vite.config.ts                      + svgr
  .env.example / README.md            + VITE_AUTO_SIGN_IN, VITE_KC_IDP_HINT
  src/
    App.tsx                           layouts around the unchanged state switch
    copy.ts                           strings
    claims.ts                         claim selection / formatting (pure)
    auth/KeycloakAuthProvider.tsx     extraQueryParams: { kc_idp_hint }
    styles/design-tokens.scss         ALL CSS constants, from DESIGN-TOKENS.md (A1)
    styles/index.scss                 imports design-tokens instead of variables/*
    styles/mixins.scss                re-pointed at the new constants
    styles/variables/                 deleted
    assets/icons/*.svg                copied icons + logo
    components/
      Button/                         full variant set + icons
      Grid/  Logo/  Loader/  Screen/  copied from identity-service
      Layout/AppLayout.tsx, AuthLayout.tsx, HeaderPanel.tsx
      Card/  KeyValueList/  Badge/
    pages/
      SplashPage.tsx  WelcomePage.tsx  SignInErrorPage.tsx  DashboardPage.tsx
  docs/
    DESIGN-TOKENS.md                  (exists)
    UI-PLAN.md                        (this file)
    screenshots/                      D4

heka-keycloak-theme/                  NEW sibling project (Phase K)
  package.json  vite.config.ts        keycloakify-starter, themeName 'heka'
  src/
    styles/                           design-tokens.scss, reset.scss, mixins.scss (copies) + fonts/
    login/KcPage.tsx  Template.tsx    shell = AuthLayout
    login/pages/                      Login, Error, Info, LoginPageExpired, LoginUpdateProfile,
                                      IdpReviewUserProfile, LoginIdpLinkConfirm, LoginIdpLinkEmail, LogoutConfirm
    login/i18n.ts                     copy overrides
  dist_keycloak/*.jar                 build output (gitignored)

heka-sso-service/
  docker-compose.dev.yml              mount theme jar into /opt/keycloak/providers, theme-cache dev flags
  keycloak/realm-heka.json            "loginTheme": "heka"
  docs/DEMO.md                        theme build step
```

## 6. Acceptance criteria

1. `src/styles/design-tokens.scss` exists, defines every constant listed in DESIGN-TOKENS.md, and is the only place CSS constants are defined; every component uses `var(--…)` from it — no hard-coded colors/sizes/shadows in component SCSS (the Phase F grep passes).
2. At 1280×720 the Dashboard matches the shell geometry in §2.2 (288 px sidebar, 32 px body radius, 48 px content padding) and the Welcome screen matches Figma "Sign in" proportions (288 px header panel, 360 px action column). At 360 px every screen follows the §2.4 table, and the same-device DC API run (D4 b) completes on a real phone without horizontal scrolling or content hidden behind the keyboard/address bar.
3. Side by side with identity-service-web-ui, Button/Logo/table/card pixels are identical except for the palette change.
4. Demo loop (DEMO.md §6) passes with `VITE_AUTO_SIGN_IN=false` + `kc_idp_hint`: Welcome → bridge login page → wallet → Dashboard shows name, "Verified 18+" badge, wallet `amr` chip → Sign out → Welcome. No stock Keycloak page appears.
5. With `VITE_AUTO_SIGN_IN=true` and `VITE_KC_IDP_HINT=` (empty) the app behaves exactly as today for existing integrations/tests.
6. README screenshots current; DESIGN-TOKENS.md gaps section updated with anything learned.
7. Keycloak: with `VITE_KC_IDP_HINT=` (empty) the realm's login page renders the themed "Sign in" screen with "Sign in with wallet" as the primary action; the error and page-expired pages render in the same shell; no PatternFly styles are loaded (network tab shows only the theme's assets). The jar builds reproducibly from `heka-keycloak-theme/` and the compose picks it up without manual admin-console steps.

## 7. Risks and open questions

| # | Item | Handling |
|---|---|---|
| 1 | Inferred tokens (hover/pressed, reds) are not Figma-confirmed | Ship with §7 values; they're one-line edits in `colors.scss` when the designer confirms. |
| 2 | Logo/wordmark asset not exportable (Figma call budget) | Text wordmark now; swap the SVG later — `Logo` is a one-file change. |
| 3 | White header panel (`DSR Branded 2 = #fff`) may vanish against the white body | Decide at B2 with a screenshot: white-on-white with a divider, or `surface-2` panel. Record the choice in DESIGN-TOKENS.md. |
| 4 | `kc_idp_hint` changes the sign-in path for anyone relying on the stock page | Env-configurable, default `heka-sso` matches the documented intent (U.2); note in README. |
| 5 | Palette divergence from identity-service until E2 lands | Accepted for the demo; E1 (bridge page) should land in the same demo window since it's on-screen for longest. |
| 6 | `age_over_18` may arrive as string `"true"` (Keycloak attribute importer) | `claims.ts` normalises `true` / `"true"`; covered by a unit test if a test runner is added (none today — vitest is a cheap add, optional). |
| 7 | Auth0 path claims are namespaced custom claims | `claims.ts` reads both plain and namespaced keys (`https://…/vc_presented_attributes`); verify once in F. |
| 8 | Keycloakify toolchain: needs Java + Maven for the jar; React/Vite versions pinned by the starter may differ from this repo's | Keep the theme a separate project with its own lockfile; don't try to share `node_modules` or components — only the three style files are copied. |
| 9 | Keycloak caches themes; a rebuilt jar may not show up in dev | The K7 `--spi-theme-*` flags in `start-dev`; restart the container after replacing the jar. |
| 10 | Three copies of `design-tokens.scss` (this repo, bridge `ui/`, theme) can drift | Single source is this repo's file; the others say so in their header. A checksum-compare script in CI is a cheap follow-up. |
| 11 | Ejected Keycloak pages shadow upstream fixes for those pages | Eject only the §2.5 list; keep the rest on Keycloakify defaults so upgrades stay easy. |
| 12 | Mobile geometry is inferred from identity-service, not from the Figma 360 frames | Build to §2.4; when Figma calls are available, read the 360-wide frames first (DESIGN-TOKENS.md gaps §3) and adjust paddings/radius in `design-tokens.scss` — components don't change. |
