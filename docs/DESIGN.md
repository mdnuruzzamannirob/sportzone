# SportZone — UI/UX design specification

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 23 October 2026

**Product reference:** [PRD](./PRD.md)\
**Technical reference:** [Architecture](./ARCHITECTURE.md)\
**Applications:** Customer storefront (Next.js) and administration portal (React + Vite)\
**Market / currency:** Bangladesh / BDT

This document owns the visual system, page composition, navigation, interactions, responsive behavior, and accessible UI states for SportZone. Detailed HTTP/data contracts and test/operating procedures are documented separately in [API](./API.md), [Database](./DATABASE.md), [Testing](./TESTING.md), and [Operations](./OPERATIONS.md). The [PRD](./PRD.md) defines product scope and business rules; [Architecture](./ARCHITECTURE.md) defines technical boundaries. The interface uses the native HeroUI v3 default design system in both themes. Brand assets and policy content remain operator-supplied; no unapproved business claims are assumed.

---

**Contents**

- [1. Design overview](#1-design-overview)
- [2. Design system](#2-design-system)
- [3. Responsive design](#3-responsive-design)
- [4. Application layouts](#4-application-layouts)
- [5. Navigation & information architecture](#5-navigation--information-architecture)
- [6. UI components](#6-ui-components)
- [7. Storefront page specifications](#7-storefront-page-specifications)
- [8. Admin portal page specifications](#8-admin-portal-page-specifications)
- [9. Forms & validation](#9-forms--validation)
- [10. Interaction & state design](#10-interaction--state-design)
- [11. Critical user flows](#11-critical-user-flows)
- [12. Accessibility](#12-accessibility)
- [13. Content & visual assets](#13-content--visual-assets)
- [14. Design quality & consistency](#14-design-quality--consistency)

---

## 1. Design overview

### 1.1 Experience goals

- Make product discovery, variant selection, and checkout straightforward on mobile devices.
- Show prices, availability, delivery charges, deadlines, payment status, and refund status without ambiguity.
- Keep guest checkout usable without requiring account creation.
- Make administrative decisions explicit, auditable, and difficult to trigger accidentally.
- Provide consistent feedback for slow networks, expired sessions, payment uncertainty, and invalid operations.
- Target **WCAG 2.2 AA** and current stable Chrome, Firefox, Edge, Brave, and Safari, as required by PRD §12.7.

### 1.2 Design principles

1. **Clarity over decoration.** Emphasize product information and next actions.
2. **One primary action per context.** Secondary actions remain available but visually subordinate.
3. **Never imply success before confirmation.** The backend determines order, payment, stock, and refund outcomes.
4. **Preserve user input.** Validation errors and network failures should not discard completed form fields.
5. **Consistent patterns.** Use shared components for repeated interactions within each application.
6. **Mobile-first, accessible by default.** Touch, keyboard, screen-reader, and reduced-motion use are supported.
7. **Theme parity.** Light and dark modes preserve the same information, actions, status meanings, and accessibility.

### 1.3 Experience boundaries

The storefront serves guests and registered customers; the admin portal serves the single authorized administrator role. The design does not include multi-vendor features, live courier tracking, loyalty programs, advanced campaign builders, or other features excluded by the PRD. Backend validation and state transitions remain authoritative. Hide inactive channels, but follow PRD §3.3 for the three-channel launch gate; hiding a required method does not mean the release is accepted.

---

## 2. Design system

### 2.1 Visual direction

Both frontends use the native HeroUI v3 default design system: colors, system fonts, spacing, radii,
sizes, shadows, variants, focus and motion. Each app owns its `components/ui/` boundary and theme entry.
A single local preview supports Admin/Storefront and Light/Dark inspection; Testing §7.5 owns verification.

Keep native styles except explicit owner-approved refinements. The current refinements are accent-colored, underline-free Link/Breadcrumb hover; a flexible native file picker surface; invalid RadioGroup controls matching checkbox danger colors; single-line disclosure labels with truncation; and contrast-corrected primary/danger filled buttons. Filled actions deepen the native hue through local button variables, including hover/pressed states; the global native palette stays intact. Do not copy the documentation website’s chrome. App-owned UI modules are the customization boundary; features, routes, layouts and commerce/management compositions consume those modules instead of importing HeroUI directly. Keep native generic/compound APIs intact. No new shared runtime UI package is introduced.

### 2.2 Light and dark color system

Use HeroUI native semantic variables and Tailwind utilities (`background`, `foreground`, `surface`, `muted`, `accent`, `default`, `border`, `success`, `warning`, `danger`). Do not maintain a second palette, hard-code a brand hex, redefine native color variables, or add aliases for the retired SportZone colors.

Each app owns `src/components/ui/theme.css` as its single theme/style entry. Global application styles only import it. Future authorized color/font/style changes begin in that app’s UI directory. The default theme is the pinned package implementation, not a separately copied token table.

Preserve one browser-local Light/Dark/System preference, bootstrap before hydration and subscription cleanup. Resolve System to the actual OS light/dark value and apply `data-theme` so native HeroUI CSS works without custom dark palette rules. Switching appearance preserves drafts and navigation. Do not introduce a second theme store/provider just to use HeroUI.

### 2.3 Typography

Use HeroUI/Tailwind’s default system sans stack and native typography. No custom webfonts, font downloads, heading font family or app-defined type scale. Semantic headings and readable content remain required. Bangla uses the operating system’s available fallback fonts. Currency, quantities and identifiers use `tabular-nums`; integer-poisha financial authority is unchanged.

### 2.4 Spacing, dimensions, and surfaces

Keep HeroUI’s native component size, radius, padding, border, elevation and variant behavior. Layout utilities may compose screens without styling library internals. Do not force one height across sm/md/lg or override component styles globally. Product imagery may retain app-owned aspect ratios; all real input/error/pending/disabled behavior remains explicit.

### 2.5 Core visual rules

All native primitives and app navigation adapters are exposed through each app’s `components/ui/`. Small behavior compositions (field labels/errors, pending submit labels and focus-preserving dialogs) remain there; they do not replace native styling. Generic compound primitives use a thin facade to preserve native types/statics, avoiding fragile clones of the library API. The approved import-boundary check enforces this convention.

A single local `showcase.html` renders the actual app UI boundary, with Admin/Storefront and Light/Dark controls, all currently used component families and supported visual variant axes. Switching apps reloads its selected CSS entry so future per-app customization cannot leak across previews. Keep this development preview outside production routes and builds.

**Accessibility remains a release requirement:** PRD §12.7 and this document §12 continue to target WCAG 2.2 AA. Stock HeroUI palette contrast findings already observed in the reference are tracked findings, not automatic acceptance or a waived gate. Preserve real accessibility checks and report actual results. The owner’s default-theme choice authorizes reversible visual implementation; it does not prove release accessibility or accept a milestone.

---

## 3. Responsive design

### 3.1 Breakpoints and layout behavior

Use mobile-first styles; these widths are layout guidance, not device detection.

| Viewport | Layout behavior |
| --- | --- |
| Under 640px | Single-column content, compact navigation, stacked forms, full-width primary actions |
| 640–767px | Wider cards and selective two-column content where readable |
| 768–1023px | Tablet grids, expanded filters where space permits, compact admin navigation |
| 1024–1279px | Desktop navigation, multi-column catalog and admin layouts |
| 1280px and above | Centered max-width storefront; full admin workspace with readable line lengths |

### 3.2 Storefront responsive patterns

- **Header:** Desktop logo, category navigation, search, account, wishlist, and cart. Mobile uses logo, accessible menu, search access, and cart; other links appear in the menu. Keep the search control easy to reach.
- **Catalog:** Two product columns on typical mobile widths when cards remain legible; otherwise one. Increase to three or four columns on wider viewports. Filters open in a dismissible mobile drawer; desktop filters can occupy a sidebar.
- **Product details:** Gallery above purchase details on mobile; side-by-side on desktop. Variant choices and quantity controls remain visible and touch-friendly.
- **Cart and checkout:** Single-column on mobile, with the order summary positioned after the relevant form content or in a collapsible summary. On desktop, show the summary in a separate column; never hide final charges behind a collapsed state at order submission.
- **Tables:** Customer-facing order lists use cards on narrow screens; avoid horizontal scrolling for primary information.

### 3.3 Admin responsive patterns

- Desktop uses a persistent sidebar and content workspace. Smaller screens use a keyboard-accessible, dismissible navigation drawer.
- Dense tables can scroll horizontally inside their own region with column labels retained; show essential status and actions first. On mobile, use row summaries/cards for workflows that require frequent phone use.
- Forms stack to one column on narrow screens; use two columns only when fields remain understandable.
- Dialogs fit within the viewport; complex workflows may use full-screen mobile dialogs with clear back/cancel actions.

### 3.4 Responsive quality rules

No page-level horizontal overflow at common viewport sizes. Maintain visible focus, usable touch targets, readable errors, and stable layout during image loading and asynchronous updates.

---

## 4. Application layouts

### 4.1 Storefront shell

```text
Utility/contact information (when configured)
Header: logo | navigation/search | account | wishlist | cart
Main content: page heading/breadcrumbs → page-specific sections
Footer: contact | customer support | shipping | returns/refunds | privacy | terms
```

Use one consistent header/footer across public pages, with a simplified distraction-free checkout header if necessary; policy/help access must remain available. Render a promotional banner only from approved storeSettings.homepageBanner content, independently of the logo. Missing content is an honest empty state; banner capability remains required by FR-03 and is not waived by withholding unapproved content. It is not a persistent blocking overlay. The header must not cover page headings or keyboard focus targets. Provide the Light / Dark / System control in the accessible account or appearance menu (also available to guests).

### 4.2 Customer account shell

Authenticated account pages share a title, account navigation, and main content region. Desktop may use a left-side navigation; mobile uses a compact navigation list or tabs that do not hide available destinations. Highlight the current section. A signed-out or expired session redirects to login with a safe return destination and preserves non-sensitive in-progress work where possible.

### 4.3 Admin shell

```text
Sidebar: dashboard | catalog | inventory | orders | customers
         payments | coupons | reviews | returns | refunds
         delivery settings | reports | store settings
Top bar: page context | administrator account/logout
Main: page title/actions → filters/summary → content → pagination
```

Provide the Light / Dark / System control in the administrator account/appearance menu. Group related destinations without creating extra permission levels. Show current section and contextual actions. Keep the administrator's session and access separate from customer sessions. Complaint handling is available from the order/customer context where relevant; a standalone complaint screen is not required by the PRD.

**Admin shell behavior:** [Admin shell](../admin/src/components/layout/admin-shell.tsx) uses a persistent sidebar from 1024px and a HeroUI left Drawer below that breakpoint. The five groups and 14 destinations share one navigation source. Selected items use native default/accent semantic tokens. Drawer navigation, Escape/Close and desktop transitions dismiss the overlay; the body scrolls vertically. Page title/actions and Appearance are reusable compositions. Render protected management content only after server-confirmed admin identity; signed-out, expired and denied states must not expose management data. Navigation availability does not establish completion of its destination workflows. Lazy administration loading exposes a live status; route render/chunk failures show a safe alert and Reload page action without exception details.

### 4.4 Shared layout states

All shells must handle navigation loading, expired sessions, missing permissions, offline/network errors, and not-found routes without displaying stale sensitive data.

---

## 5. Navigation & information architecture

### 5.1 Storefront sitemap

```mermaid
flowchart TD
    Home[Home] --> Catalog[Products / Categories]
    Catalog --> Product[Product Details]
    Home --> Search[Search Results]
    Search --> Product
    Product --> Cart[Cart]
    Cart --> Checkout[Checkout]
    Checkout --> Payment[Hosted Payment / COD]
    Payment --> Result[Payment Result / Order Confirmation]
    Home --> Account[Customer Account]
    Account --> Profile[Profile / Addresses]
    Account --> Orders[My Orders / Order Details]
    Account --> Wishlist[Wishlist / My Reviews]
    Orders --> Returns[Returns / Refund Details]
    Home --> Lookup[Guest Order Lookup]
    Lookup --> GuestDetail[Verified Guest Order Details]
    Home --> Policies[Contact / Policies]
```

This is a navigation map, not an assertion that every page is accessible without authentication or verification.

### 5.2 Admin sitemap

The authenticated admin shell exposes these navigation groups. Group labels organize the interface; they do not create additional roles or permissions.

| Navigation group | Destinations |
| --- | --- |
| Overview | Dashboard, Reports |
| Catalog and shopping | Products/Add/Edit, Categories, Inventory, Coupons, Reviews |
| Orders and payments | Orders/Details, Payments |
| Customers and after-sales | Customers, Returns, Refunds; complaints in order/customer context |
| Configuration | Delivery Settings, Store Settings; account logout, appearance and recovery entry points |

### 5.3 Navigation conventions

- Use predictable page titles and breadcrumbs on nested catalog, order, and admin detail pages.
- Keep search query, filters, sort, and page number in the URL when appropriate so results can be revisited or shared.
- Use descriptive URLs for products and categories. An invalid or inactive product link shows a safe unavailable/not-found state, not a broken purchase action.
- Use back navigation without losing search/filter context when returning from product details.
- Route guards improve navigation but never replace backend authorization.

---

## 6. UI components

### 6.1 Shared component inventory

| Component | Variants / essential behavior |
| --- | --- |
| Button | Primary, secondary, text, destructive; loading, disabled, focus states |
| Link | External/internal, visible focus and descriptive destination |
| Text input / textarea | Label, hint, required, invalid, disabled; preserve input on error |
| Select / combobox | Keyboard-operable; supports long district/area lists |
| Checkbox / radio | Clear selection, label click targets, grouped payment options |
| Quantity selector | Minus/plus and direct value; respects min/max and stock feedback |
| Product card | Image, title, BDT price, optional sale price/rating, availability, action |
| Price display | Regular/sale hierarchy, discount indication when applicable |
| Variant selector | Selected, unavailable, invalid, and loading states |
| Badge | Order/payment/return/refund status with explicit text |
| Alert / inline message | Success, warning, error, information; actionable next step |
| Toast | Brief noncritical feedback; must not be the only confirmation of an important action |
| Modal / confirmation | Focus trap, descriptive title, cancel/confirm, focus restoration |
| Drawer | Mobile navigation and catalog filters; dismissible with Escape |
| Tabs / accordion | Semantic state, keyboard support, visible labels |
| Breadcrumbs | Nested navigation, last item current page |
| Pagination | Current page, previous/next, bounded accessible controls |
| Skeleton / spinner | Announce loading where appropriate; avoid layout shifts |
| Empty state | Explanation and relevant recovery action |
| File upload | File constraints, preview, removal, upload/error progress |
| Data table | Header associations, sort/filter states, row actions, pagination |
| Status timeline | Ordered milestones with current state and timestamps when available |

### 6.2 Product and commerce components

- **Product cards:** Show image, name, current price, prior price only when a genuine sale exists, approved rating summary if available, and an availability cue. Do not promise stock from cached data.
- **Variant controls:** Show attributes as labeled choices; disable invalid combinations; announce availability updates. Require a valid selection before adding to cart.
- **Cart line:** Thumbnail, name, variant/SKU description, unit price, quantity, line total, remove action, and price/stock change warnings.
- **Order summary:** Subtotal, product discounts, coupon discount, delivery charge, total payable, and payment method. Display confirmed server-calculated values before final submission.
- **Payment method choice:** Show COD and only gateway channels currently enabled. Use the provider's recognizable channel labels without implying unavailable activation.

**Implementation:** Storefront [commerce components](../storefront/src/components/commerce/product-card.tsx) follow the state contracts below. Price/line/summary amounts are supplied by the consuming feature/API; quantity controls and variant options express requests/eligibility without reserving stock. Status text remains explicit; payment, funding and fulfillment are never inferred from a monetary total. These components do not populate unavailable catalog/cart pages with synthetic products.

| Module                  | Contract                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price.tsx`             | Display exact nonnegative integer poisha through the existing formatter; show regular-price comparison only when regular is higher; no discount percentage calculation |
| `product-card.tsx`      | Name/link, controlled image/fallback, supplied prices, availability text and approved rating summary when valid; optional action is outside the product link           |
| `product-image.tsx`     | Next Image with explicit dimensions/sizes, source-keyed failure recovery and an honest missing-image state                                                             |
| `variant-selector.tsx`  | Controlled complete-variant options with backend-supplied eligibility; disabled choices, loading/error/empty states and selection/stock announcements                  |
| `cart-line.tsx`         | Supplied estimated unit/line amounts, variant/SKU, bounded quantity requests, pending/removal, stock/price warnings and no-reservation notice                          |
| `status-badge.tsx`      | Textual status/availability using neutral surfaces and semantic foregrounds; caller maps verified backend states to labels/tones                                       |
| `order-summary.tsx`     | Regular subtotal, product/coupon discounts, delivery and supplied final total, labelled estimate/quote/order; payment method is separate from payment outcome          |
| `commerce-skeleton.tsx` | Product, cart-line and summary layouts with one loading announcement and hidden decorative placeholders                                                                |

- `ProductCard` receives only an approved public rating summary; omit it when unavailable. Pass an approved local/allowed remote image source and descriptive alt text. Next.js remote-host configuration belongs to the media/catalog feature. Key image replacements by source; do not keep a failed old image state for a replacement asset.
- Variant options represent complete valid combinations from the owning feature/API. A selected ID must still be eligible before a consuming Add to cart action can run. The primitive does not perform inventory arithmetic or grant purchase permission.
- Product-card actions may include a feature-owned wishlist/cart action, but they must enforce its pending/eligibility state and server checks. No purchase action is built in by default. Do not nest buttons in the product link.
- Cart `maxQuantity` is a backend/feature-supplied integer limit (zero disables edits); quantity changes are requests, never reservations. Keep the server-supplied estimated line amount visible until a replacement arrives; do not multiply quantity and unit amount to establish checkout truth. A reduced stock limit preserves the requested quantity and displays recovery guidance.
- Adapt `SummaryAmounts` from CheckoutQuote or the immutable order pricing snapshot. `kind="quote"` does not prove quote freshness, reserve stock or complete payment. The consuming checkout feature owns expiry/consent validation and authoritative submission. Display payment/fulfillment/refund statuses separately; never infer Paid from a total or receipt amount.
- Example catalog data belongs only in tests/previews. Existing public unavailable pages stay unchanged until their feature tasks integrate real data.

### 6.3 Administrative components

- **Management tables:** Search/filter toolbar, visible row status, bulk selection only where an actual bulk operation exists, and contextual row actions.
- **Detail panels:** Show immutable historical values separately from editable current configuration.
- **Status change controls:** Present only backend-eligible next actions, with confirmation and reason fields when needed; still handle backend rejection.
- **Financial actions:** Show source transaction, eligible amount, pending commitments, intended payout method, and confirmation before submission. Never mark payout complete from an optimistic UI update.
- **Audit context:** Display available actor, timestamp, and action details for sensitive changes without exposing secrets.

Implementation foundation: admin table/filter/pagination, file upload and guarded confirmation compositions are defined in the administrative contracts below. Feature integrations supply authoritative rows, upload policy and eligible actions; these primitives do not grant administrator access or execute business operations.

| Module               | Contract                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-table.tsx`     | HeroUI table with stable row IDs, header associations, controlled sort requests, textual loading/error/empty states, retry and retained-result notice; a labelled focusable region contains horizontal overflow |
| `list-controls.tsx`  | Controlled search draft, explicit apply/clear and optional feature filters; HeroUI previous/next pagination uses supplied PageMeta values without deriving counts from rows                                     |
| `file-upload.tsx`    | HeroUI file input with explicit MIME/byte constraints, linked errors, selected-file summary, raster preview with object-URL cleanup, progress, removal and retry                                                |
| `guarded-action.tsx` | Confirmation dialog with descriptive context, optional required reason, changing eligibility, pending dismissal/submission guards and retained rejection feedback                                               |

- Tables display caller-supplied rows in their original order; sort/filter/page events are requests to the owning feature. Keep essential status/actions in the first columns. Use concise labelled row-action buttons, not whole-row click-only navigation. No bulk selection exists until a real approved bulk operation needs it. Use mobile summaries for workflows requiring frequent phone use.
- Keep filter drafts and applied query state in the feature; applying or clearing resets the API page where appropriate. Pass pending state to disable conflicting controls. Pagination accepts API page metadata, including an empty result or a page made stale by concurrent deletion; recover an out-of-range page in the feature rather than inventing a new count.
- Upload `acceptedTypes` are explicit exact MIME strings, with a positive integer `maxBytes` from the approved environment media policy. The browser checks these for usability only; the backend must validate bytes, scanning, authorization and attachment lifecycle. A locally selected file is not uploaded. Set `state="uploaded"` only from a verified server response. Keep the selected File in the parent on errors; retry must respect the owning upload operation and uncertain provider outcomes. Only JPEG/PNG/WebP receive local previews; object URLs are revoked on replacement/unmount. No private URL or secret enters this primitive.
- Guarded actions receive backend-eligible state and feature-owned reason/context. Context must identify the target, historical facts and applicable amount/source/commitment before high-impact confirmation. Keep reason state outside the dialog. The feature owns authorization, CSRF, If-Match, idempotency and request lifecycle; set pending immediately, retain ambiguous outcomes, and only show success/close after authoritative confirmation. The primitive never grants permission, initiates financial effects or converts a click into a successful status.
- `FormDialog` supplies focus containment, Escape/cancel and trigger focus restoration. Pending actions lock dismissal; the feature must settle pending/error state and provide recovery. Multiple action instances have distinct reason-field IDs. Optional `isOpen`/`onOpenChange` lets the feature close the dialog after a verified result; the confirmation callback itself never closes it.

### 6.4 Component state contract

Every interactive component must define: default, hover (where applicable), focus-visible, active/selected, disabled, pending/loading, validation error, and successful completion states **in both themes**. Disabled actions that matter to users should include an explanation nearby.

**Implementation:** Both apps provide HeroUI field/form/feedback/overlay compositions in `src/components/ui/`; usage and state ownership follow this section. Appearance selects, connectivity notices and storefront loading feedback consume these primitives. Parent editors retain controlled drafts across overlay dismissal; pending panels block Escape/backdrop/Cancel until the caller settles. Field errors and linked summaries use explicit accessible associations; summary focus is requested only after a failed submission.

### 6.5 App-owned UI boundary and component APIs

Architecture §§4–5 own placement. Both apps consume native HeroUI through their own components/ui;
no app imports the other app's runtime components. Preserve compound/generic APIs, default themes
and system fonts, router-aware Link adapters and keyboard/focus/input-retention behavior. Theme CSS
owns styling entry points; global styles forward to it. Do not add duplicate component implementations,
custom palettes/font skins or empty providers. Component filenames/exports below describe existing
facades until the owning refactor updates consumers and tests; they do not create public HTTP DTOs.

| Module         | Exports                                                     | Responsibility                                                                                                             |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`   | `Button`                                                    | All native variants/sizes; disabled/pending handling and optional visible pending text                            |
| `fields.tsx`   | `TextInput`, `SelectField`, `CheckboxField`, `RadioChoices` | HeroUI labels, helper/error associations and controlled/uncontrolled input support; `TextInput multiline` renders TextArea |
| `form.tsx`     | `Form`, `FormErrorSummary`                                  | Prevent navigation/repeated pending submissions; link safe field errors and focus the summary after a failed submit        |
| `feedback.tsx` | `Notice`, `LoadingState`, `EmptyState`                      | Persistent textual feedback, announcement roles, decorative progress/skeletons and caller-supplied recovery actions        |
| `overlays.tsx` | `FormDialog`, `FormDrawer`                                  | Titled modal/drawer with description, Escape/Cancel, focus restoration, scrollable body and a pending dismissal lock       |
| `link.tsx`     | `Link`                                                      | HeroUI styling/behavior with Next.js `href` or React Router `to`; use the appropriate app adapter                          |

### 6.6 Fields and validation

- Give text/select fields unique stable IDs and visible labels. Provide `name` when the value belongs in form submission. Required fields include visible text and programmatic required state.
- Pass safe, user-facing `error` text to the field; HeroUI associates it with the input. Native/custom validation remains available on TextInput through the underlying TextField props. Domain rules and server validation remain owned by the feature and API contract.
- Use `TextInput multiline` for notes, and use `SelectField` for a list of labelled options with optional disabled entries. Do not encode permission or business eligibility solely through disabled controls.
- `Form` prevents default navigation and ignores submissions while `isPending` is true. The caller owns request lifecycle, field errors, result handling, retries and backend idempotency. Changing a button to pending is not backend duplicate protection.
- `FormErrorSummary` accepts `{ fieldId, message }` entries. Pass a `focusKey` counter and increment it after each failed submission. Ordinary keystrokes must not increment it. Each link focuses the corresponding field; do not send raw exception details to this component.
- Keep values when validation or requests fail. Explicitly clear only after an authoritative success or a user-requested reset. Avoid retaining sensitive drafts beyond their required UI lifetime.

### 6.7 Feedback and pending actions

`Notice` accepts `info`, `success`, `warning` or `error`. Errors use an assertive alert; other feedback uses a polite status. Important confirmations remain on the page. A success notice is appropriate only after the owning operation verifies success. Pass a recovery action only when that retry is safe.

Pending Buttons keep their accessible progress text and block activation through HeroUI. Forms also guard submit events, including keyboard submissions. Explain significant disabled actions nearby. A danger variant supplies presentation only; destructive/financial confirmation and authorization remain feature responsibilities.

`LoadingState` provides one polite status with decorative Spinner/Skeleton content. `EmptyState` provides a title, explanation and optional recovery action; show it only after a successful empty result, not while loading or after an error.

### 6.8 Dialogs and drawers

- Render the parent editor outside the overlay. Keep draft values in that parent and pass controlled field values into the panel, so unmounting/reopening the overlay preserves the intended draft. Uncontrolled fields inside an unmounted panel are not retained automatically.
- Supply descriptive `title`, `triggerLabel` and optional `description`. Place the form fields in `children` and caller-owned actions in `actions`. If an action is outside its form, explicitly associate it through the form ID or use an explicit handler.
- Panels restore focus to their trigger on ordinary dismissal. HeroUI owns modal focus containment and keyboard behavior. The body scrolls within the viewport; the drawer permits vertical touch panning.
- While `isPending`, Escape, backdrop dismissal and Cancel are disabled. The caller must settle pending state and show a verified result/error; the panel does not start, retry or complete an operation itself. Never leave a panel permanently locked after a failed request.
- Optional `isOpen`/`onOpenChange` support caller-controlled lifecycle. Do not add a public preview route or synthetic authenticated session to demonstrate a foundation component.

### 6.9 Native control refinements

Link and Breadcrumb hover use the native accent token without underlines. Invalid RadioGroup controls use danger colors, including selected controls. Disclosure triggers keep their indicator on one line; wrap a potentially long title in a span so it truncates with ellipsis. Both app UI theme entries explicitly scan their own source so the single preview includes real app layout utilities.

Admin `components/ui/file-input.tsx` centralizes a native, keyboard-accessible file picker behind a modern upload surface. It forwards native input props (including accept/capture/disabled/ref) and accepts `prompt` and wrapper `className`; `management/FileUpload` still owns file-policy checks, progress, selected file state, retries and object-URL cleanup. The surface does not claim drag-and-drop support. App fields/feedback/management preview specimens have independent labelled sections and mobile reflow. No production routes or upload APIs are added.

Verification is governed by Testing §7.5. DOM checks, browser interaction and owner visual
acceptance remain distinct; component examples and synthetic previews do not prove feature integration.

---

## 7. Storefront page specifications

### 7.1 Discovery and shopping

| Page | Layout and required content | Key interactions / states |
| --- | --- | --- |
| **Home** | Hero/banner, category links, featured, new, and discounted products; search; contact/support access | Responsive sections; configured promotions only; loading/empty sections |
| **Products** | Heading, search context, result count, filters, sort, paginated product grid | Search by name/keywords; price/availability filters; newest/price sorts; reset; empty results |
| **Category** | Category title, optional image, subcategory navigation, same catalog controls | Inactive category excluded; preserve category context |
| **Product Details** | Breadcrumbs; image gallery; name, rating, description, regular/sale price, variant/stock, quantity, cart/wishlist actions, return eligibility, related products, reviews | Change variant updates stock/price; invalid selection, out-of-stock, add-to-cart feedback; gallery keyboard controls |
| **Cart** | Cart lines, quantity/remove, estimated subtotal, checkout action | Guest persistence; account merge after login; stock/price change warnings; empty state; no stock reservation |
| **Wishlist** | Saved product grid/list, availability, remove and add-to-cart | Requires login; unavailable product remains clearly marked; empty state |
| **Reviews (on product)** | Average/count, approved review list, verified-purchase labels; eligible review form | 1–5 stars, written review, moderation status; edit own review when permitted; sign-in/eligibility messages |

**Catalog layout:** On desktop, place filters beside the grid; on mobile, use a filter drawer with Apply and Clear controls. Search, sort, and filters must be operable without a mouse. Pagination retains query state. Product card links must not contain nested interactive buttons.

**Product detail layout:** On mobile, gallery precedes product information and purchase controls. On desktop, gallery and purchase details form two columns; descriptions and reviews follow. Price and stock changes after variant selection must be announced without excessive screen-reader chatter.

### 7.2 Authentication and account

| Page | Layout and required content | Key interactions / states |
| --- | --- | --- |
| **Login** | Email, password, submit, forgot-password link, registration link | Invalid credentials, rate-limit feedback, session creation |
| **Register** | Name, email, password, confirmation where needed, submit, login link | Duplicate email, field errors, successful account creation |
| **Forgot Password** | Email entry, submission confirmation | Neutral response that does not reveal account existence |
| **Reset Password** | New password, confirmation, token validity feedback | Expired/used token and recovery link |
| **My Account** | Overview and links to profile, addresses, orders, wishlist, reviews, returns/refunds | Authentication required; loading/empty states |
| **Profile** | Name, phone, email, password-change actions | Email change verification; inline success/error feedback |
| **Addresses** | Address cards/list, default address, add/edit/delete form | District/area validation; deletion confirmation; historical orders unaffected |
| **My Orders** | Paginated order cards/list with number, date, total, fulfillment and payment statuses | Open details, empty history, filter if supported by API |
| **Order Details** | Immutable purchased items, price breakdown, delivery snapshot, payment status, fulfillment timeline, delivery estimate/deadline | Eligible cancellation/return links; delay/failed-delivery notice, revised estimate when confirmed, contact/support action, and refund links |
| **My Reviews** | Submitted reviews, product context, moderation state, edit action | Ineligible edit or missing review state |

Account pages must not expose another customer's records. If a session expires, show a clear reauthentication path without leaking private data.

#### Identity interface behavior

Customer routes `/login`, `/register`, `/forgot-password`, `/reset-password`, `/account` and `/account/email-change` use native app-owned HeroUI forms and real Express identity APIs. Administrator `/login`, `/forgot-password`, `/reset-password` and `/app/*` use the separate administrator namespace; there is no admin signup. Show email verification state accurately; expose verification actions only when the corresponding backend capability is available. Addresses use currently supported district/area values with authoritative save-time coverage rejection; delivery option discovery remains the delivery feature contract.

Private/auth storefront routes are noindex/no-store; no account data or proof enters SSR shared caches. Fragment proofs are captured once in memory, removed from the location and only submitted explicitly in a JSON body. Failed forms preserve inputs; pending guards stop double submission, errors/status are accessible, and password fields clear after confirmed success. Session checks and reauthentication hide denied/expired private views. Admin navigation is presentation only and only renders a signed-in identity after the server session response; unimplemented management features stay honestly unavailable.

### 7.3 Checkout, payment, and guest access

| Page | Layout and required content | Key interactions / states |
| --- | --- | --- |
| **Checkout** | Contact details, delivery address/district/area, optional notes, delivery charge and deadline, coupon field, payment method, order summary, terms acceptance, final action | Guest or signed-in; saved address selection; revalidate stock, prices, coupon, and delivery; duplicate-submit prevention |
| **Payment Result** | Verification-in-progress, confirmed paid, failed, cancelled, or pending/unresolved result | Never trust browser redirect alone; show refresh/check-status path; do not encourage duplicate payment while status is uncertain |
| **Order Confirmation** | Order number, summary, payment/fulfillment status, next steps, receipt of submitted order | COD shown as unpaid until collection; pending online payment not mislabeled as paid |
| **Order Lookup** | Order number + checkout email; request verification link/code; verified order view | Rate-limited, time-limited proof; scoped cancellation, return, and refund tracking only when eligible |

**Checkout composition:** Keep contact/address first, then delivery area and charge, coupon, payment choice, and final summary. On desktop, a persistent summary column may be used; on mobile, show a compact summary during entry and the full total before the final action. A rejected checkout retains entered details and identifies the exact item or field requiring attention. Final confirmation submits the server-issued quote reference internally, as specified in API §11.1. Changed or expired quotes display current terms for explicit confirmation using plain-language feedback. Never automatically approve or resubmit a refreshed quote. Keep the same idempotency key during uncertain replay of an already submitted operation.

**Payment messaging:** Distinguish *order submitted*, *payment pending verification*, *payment confirmed*, *payment failed*, and *payment cancelled*. For a late verified payment with unavailable stock/coupon capacity, show **Payment received — fulfillment under review**, not a false order confirmation. Do not display provider transaction secrets.

### 7.4 After-sales and informational pages

| Page | Layout and required content | Key interactions / states |
| --- | --- | --- |
| **Return Request** | Eligible order items/quantities, reason, optional evidence upload, policy summary, submit | Show applicable request deadline (standard baseline: 7 calendar days after delivery), eligibility exceptions, and inspection for physical returns only; shortage claims skip shipment/receipt/inspection; block duplicate active claims and invalid quantities |
| **My Returns** | Return list, item context, current status, dates and decisions | Distinguish approved return from approved refund; show deadline and next required action where applicable |
| **Refund Details** | Refund amount, method, status, associated items/transaction, timestamps | Show approval date and target (normally 7 business days after approval), provider delay/overdue message when applicable; completion only after confirmed payout |
| **Contact** | Store-provided contact details and basic complaint submission/channel; anonymous contact name/email required | Submission feedback and reference when available; no invented live chat |
| **Shipping Policy** | Store-approved delivery coverage, charges approach, deadlines, exceptions | Accessible readable content; operator-supplied policy |
| **Return & Refund Policy** | Eligibility, return window, refund methods/timing, consumer-rights statement | Store-approved content; link from checkout and after-sales screens |
| **Privacy Policy** | Approved privacy and data-use content | Accessible headings and links |
| **Terms & Conditions** | Approved terms, checkout-related policies | Explicit acceptance at checkout |
| **Not Found / Error** | Clear explanation, home/catalog navigation, retry where useful | Do not expose stack traces or private data |

**Deadline presentation:** Show a return-request deadline only when delivery date and applicable policy make it reliable; explain legally protected exceptions without implying that the standard window eliminates statutory rights. Refund targets begin at **refund approval**, not request submission. Read approvedAt and the authoritative timing projection from the API; under_review/awaiting_approval has no invented date. Display the approved business-calendar/policy basis and safe item/status timeline; do not calculate targets from a browser holiday guess. If the target is missed, display the latest verified status and support path; never imply payout has completed.

**Legal/operational content:** Delivery commitments and policy wording must reflect the store's approved configuration and applicable law. The UI must not hard-code an unconditional 14-day delivery promise or represent store policy drafts as verified legal rules.

---

## 8. Admin portal page specifications

### 8.1 Dashboard and catalog

**Administrator recovery screens:** The admin login links to a dedicated recovery request and reset screen using the admin session context. Show neutral request confirmation, new-password fields, expired/used-link guidance, rate-limit feedback, and return to admin login. Customer recovery must never create administrator access.

| Page | Layout and required content | Primary actions / safeguards |
| --- | --- | --- |
| **Admin Login** | Email, password, recovery, login feedback | No public admin registration; rate-limit and session-expiry messaging |
| **Dashboard** | KPI cards, recent orders, low-stock and pending-return summaries | Distinguish paid collections, outstanding COD, refunds, and net collected revenue; no misleading revenue aggregation |
| **Products** | Searchable/filterable table with name, SKU/variants, price, category, visibility, stock | Add, edit, deactivate; show active/inactive state |
| **Add/Edit Product** | General details, categories, images, pricing, variants/SKUs, featured and visibility settings | Field validation, duplicate slug/SKU feedback, image preview, unsaved-change warning |
| **Categories** | Category/subcategory hierarchy, status, image, edit controls | Prevent deletion with dependent products without reassignment |
| **Inventory** | Variant/SKU table with physical, reserved, committed, available, threshold and movements | Record reasoned adjustments; protect against negative available stock; inspect returned items before restocking |

**Metric labels:** Use PRD FR-22 definitions. Display the selected period, date basis, Asia/Dhaka timezone, balance cutoff, and separate overpayment/payment-correction amounts. Do not label net collections as profit.

The dashboard must not treat uncollected COD as paid revenue. Charts are optional only when they accurately represent the PRD's basic reporting data; metric cards and tables are sufficient.

### 8.2 Orders, customers, and payments

| Page | Layout and required content | Primary actions / safeguards |
| --- | --- | --- |
| **Orders** | Search by order number, status filters, date, customer, totals, payment/fulfillment badges | Open order; paginate; no unsupported state jumps |
| **Order Details** | Order snapshot, items, totals, delivery deadline, payment attempts/status, fulfillment history, cancellation and complaint context | Confirm COD, update allowed fulfillment states, record shipment/collection; for delayed or failed delivery show reason, customer-contact record, revised estimate and retry/resolution action when eligible |
| **Customers** | Searchable customer list, status, account/order overview | View history, suspend/reactivate with confirmation; minimize sensitive details |
| **Payments** | Transaction references, method, amount, status, attempts, reconciliation flags, linked order/refunds | Review uncertain/risky transactions; record verified COD collection; do not manually mark unverified gateway payment as paid |
| **Reports** | Basic date-filtered order/collection/refund summaries and activity history | Separate GMV, discounts, collections, refunds, and net collections; show date range and metric definitions |

### 8.3 Promotions, moderation, and after-sales

| Page | Layout and required content | Primary actions / safeguards |
| --- | --- | --- |
| **Coupons** | Code, type/value, validity, minimum eligible amount, limits, status, redemption history | Create/edit/deactivate; validate overlapping/invalid settings and usage limits |
| **Reviews** | Review text/rating, product, verified-purchase flag, moderation status | Approve/reject/hide with reason; never rewrite customer rating as their own |
| **Returns** | Request list and detail with items, quantities, reason, evidence, history | Review physical-return or shortage claim; physical returns use receipt/inspection/restocking, while shortage claims skip those steps; distinguish decisions from payout |
| **Refunds** | Refund list and detail with original collection, eligible balance, amounts, attempts, payout method/status | Approve/reject, initiate supported payout, verify manual transfer, investigate failure; require confirmation |
| **Delivery Settings** | Zones, district/area coverage, active status, charges | Add/edit/deactivate; warn that changes affect future orders only |
| **Store Settings** | Branding/contact, store address, low-stock threshold, policies, support/complaint contact | Validate changes; show saved/unsaved state; published policy content must be approved |

**Operational complaints:** Show basic complaint records, status, and resolution in the relevant order/customer support context. Do not introduce a complex ticketing product.

### 8.4 Admin detail and action rules

- Place primary actions in a consistent page-header area; keep destructive/irreversible actions visually separate.
- Show relevant history, actor, and timestamp before a high-impact financial or fulfillment action.
- Require an explicit confirmation step for refunds, stock adjustments, account suspension, order cancellation, and irreversible status changes.
- A successful button click is not a successful transaction: update status only after authoritative API confirmation.
- Surface validation conflicts and concurrent changes without silently overwriting records.

---

## 9. Forms & validation

### 9.1 Form anatomy

Each field has a visible label, optional helper text, clear required indication, and an error message associated programmatically with the field. Placeholder text is supplementary, not a replacement for a label. Group related fields under meaningful headings.

### 9.2 Validation and submission

- Validate obvious format constraints on blur or submission; avoid disruptive errors while the user is still typing.
- Always display backend validation errors beside the relevant field, plus a concise summary for multi-field failures.
- Focus the first invalid field or error summary after a failed submission; preserve all valid inputs.
- Disable repeat submission while a request is pending, but provide a visible progress label and a safe retry path.
- Validate Bangladesh phone numbers, email, required delivery fields, SKU uniqueness, quantities, and currency fields using backend-compatible rules.
- For password recovery, use neutral messaging that does not reveal whether an account exists.
- For upload forms, show supported type/size constraints from the implementation and allow removal/retry.

### 9.3 Sensitive and financial forms

Checkout always shows the final backend-calculated payable amount before confirmation. Coupon failures explain invalid, expired, ineligible, or exhausted conditions without revealing internal configuration. Refund forms show eligible balance and remaining quantity; manual refund forms require evidence/confirmation as specified by the PRD. Never collect payment card credentials in SportZone forms; online payment uses SSLCOMMERZ hosted checkout.

---

## 10. Interaction & state design

### 10.1 Global UI states

| State | Required UI behavior |
| --- | --- |
| Initial loading | Skeleton or progress indicator without misleading empty results |
| Empty | State-specific explanation and next valid action |
| Validation error | Field-level message and retained input |
| API/network error | Safe explanation, retry when idempotent, no false success |
| Unauthorized | Reauthentication path; remove private data from view |
| Forbidden | Explain lack of access without exposing protected information |
| Conflict / stale data | Refresh authoritative values; preserve user intent when safe |
| Success | Confirm saved outcome with persistent page state for important operations |
| Pending external operation | Clearly distinguish waiting from completed; provide status-check path |
| Disabled/ineligible | Explain why action cannot proceed and when it may become available |

### 10.2 Commerce-specific states

- **Price or stock changed:** Identify affected cart lines, show current values, and require confirmation before checkout.
- **Coupon rejected or expired:** Keep entered code visible with reason and allow correction/removal.
- **Delivery area unavailable:** Block checkout with a clear supported-area message; retain address input.
- **Payment pending/unknown:** Show a non-final status and link to the order; do not create an automatic second attempt.
- **Paid after cancellation:** Preserve the Cancelled order label and show payment received with correction/refund under review; never imply that the order reopened.
- **COD placed:** Show Order Pending Confirmation and Payment Due on Collection until the separate administrator and collection actions occur.
- **Final failed delivery:** Show the recorded non-delivery closure and eligible refund status; administrative views require custody/disposition and inspected recovery details.
- **Duplicate payment confirmed:** Show collection under review and direct customer to order/payment status; do not claim duplicate fulfillment.
- **Reservation expired:** Explain that availability must be rechecked; do not promise stock.
- **Cancellation requested:** Show request pending administrator review; retain the current fulfillment state until approval. Pending/Confirmed requests require review, and Processing also requires dispatch verification.
- **Order status changed concurrently:** Reload status and show eligible actions only.
- **Physical return approved but not inspected:** Show the next return/receipt step; do not display its refund as approved.
- **Shortage claim approved:** Show the approved missing quantity and separate refund-review status; never request shipment, receipt, or inspection of missing goods.
- **Refund processing or failed:** Show investigation/retry status; do not show completed until payout verification.
- **Delayed or failed delivery:** Show a persistent status notice, last confirmed estimate and customer support path. Admin sees reason, contact history and allowed retry/resolution actions.
- **Return/refund deadlines:** Display only policy- and event-backed dates; label calendar days versus business days and provide overdue support messaging.

### 10.3 Feedback timing

Use inline validation for fields, toasts for reversible low-risk changes, and persistent banners/timelines for orders, payments, refunds, and failures. Avoid automatic dismissal of messages needed to make a decision. Long-running operations should show progress without promising an exact completion time.

---

## 11. Critical user flows

### 11.1 Checkout and payment experience

```mermaid
flowchart TD
    Cart[Review Cart] --> Checkout[Contact, Address, Delivery, Coupon]
    Checkout --> Validate{Server validation}
    Validate -->|Changes needed| Fix[Show specific issues and retain input]
    Fix --> Checkout
    Validate -->|Valid| Method{Payment method}
    Method -->|COD| COD[Order pending admin confirmation, payment due on collection]
    Method -->|Enabled online channel| Gateway[SSLCOMMERZ hosted checkout]
    Gateway --> Verify[Show verification / pending result]
    Verify --> Status{Verified backend outcome}
    Status -->|Paid, allocated, risk cleared| Confirm[Show confirmed payment and order status]
    Status -->|Paid after order cancellation| Correction[Cancelled order, payment correction in progress]
    Status -->|Failed or cancelled| Retry[Show outcome and safe retry option]
    Status -->|Pending or under review| Pending[Show status-check and support path]
    Status -->|Paid, risk review pending or allocation unavailable| Hold[Payment received, fulfillment under review]
```

The UI cannot treat the provider redirect as proof of payment. A late verified payment with insufficient allocation is shown as an exception requiring resolution, not an ordinary fulfilled order.

### 11.2 Order cancellation and after-sales

```mermaid
flowchart TD
    Order[Order Details] --> Eligible{Eligible action?}
    Eligible -->|Before shipment| Cancel[Request cancellation]
    Eligible -->|Delivered and eligible| Return[Request return for selected items]
    Eligible -->|No| View[Show status and available support path]
    Cancel --> CancelReview{Cancellation approved?}
    CancelReview -->|No| Reason[Show decision and support path]
    CancelReview -->|Approved, no verified collection| Cancelled[Cancelled, no refund currently due]
    CancelReview -->|Approved, payment collected| RefundReview[Refund review]
    Cancelled -.->|Payment subsequently verified| Late[Keep cancelled and open payment correction]
    Late --> RefundReview
    Return --> Review{Return eligibility approved?}
    Review -->|No| Reason
    Review -->|Yes, physical return| Receive[Await product receipt]
    Receive --> Inspect[Inspect returned items]
    Review -->|Approved shortage, no goods to return| RefundReview
    Inspect -->|Eligible refund| RefundReview
    Inspect -->|Not eligible| Reason
    RefundReview --> Decision{Refund decision}
    Decision -->|Approved| Payout[Show refund processing]
    Decision -->|Rejected| Rejected[Show rejection reason and support]
    Decision -->|Under review| ReviewPending[Show pending review or investigation]
    Payout -->|Payout confirmed| Complete[Show refund completed]
    Payout -->|Pending or failed| Investigate[Show investigation / authorized retry]
```

For unpaid online cancellation, stop further payment initiation and keep uncertain provider attempts under reconciliation. If a collection is verified later, preserve Cancelled fulfillment and show correction/refund under review; do not reopen the order.

For missing items or short-delivered quantities, offer a claim reason and quantity selection without requiring a return shipment. Show Requested, Under Review, Approved/Rejected, and Completed claim states with the refund tracked separately. Do not ask the customer to confirm receipt or inspection of missing goods.

Cancellation, return, and refund are distinct processes. An approved return does not mean a refund has been paid. Some cancellation/payment-correction refunds do not involve physical returns.

### 11.3 Authentication and verified guest access

```mermaid
flowchart TD
    Entry[Account or order entry] --> Path{User intent}
    Path -->|Sign in or register| Auth[Customer authentication]
    Auth --> Account[Customer account and own orders]
    Path -->|Shop without account| GuestCart[Guest cart and checkout]
    GuestCart --> GuestOrder[Guest order confirmation]
    Path -->|Look up guest order| Lookup[Order number and checkout email]
    GuestOrder -.->|Later, if needed| Lookup
    Lookup --> Proof[Email verification link or code]
    Proof --> Valid{Verification valid?}
    Valid -->|No| Retry[Safe retry or expiry guidance]
    Valid -->|Yes| Scoped[Verified order details]
    Scoped --> Action{Action currently eligible?}
    Action -->|Yes| Allowed[Cancellation, return or refund tracking]
    Action -->|No| ViewOnly[View status and support options]
```

`Order lookup → Enter order number and checkout email → Receive time-limited proof → Verify → View scoped order → Perform only currently eligible actions.`

The guest must not see account-only navigation as if authenticated. Verification failure, expired proof, and rate limiting require clear recovery instructions without exposing order existence to unauthorized users.

### 11.4 Product selection and cart

```mermaid
flowchart TD
    Browse[Browse or search catalog] --> Detail[Open product details]
    Detail --> Variant[Select available variant and quantity]
    Variant --> Check{Selection valid?}
    Check -->|No| Fix[Show availability or selection guidance]
    Fix --> Variant
    Check -->|Yes| Add[Add to cart]
    Add --> Cart[Review cart and quantities]
    Cart --> Change{Change or proceed?}
    Change -->|Update or remove| Refresh[Show updated cart and server feedback]
    Refresh --> Cart
    Change -->|Checkout| Recheck[Revalidate price, stock and delivery]
    Recheck -->|Changes needed| Cart
    Recheck -->|Valid| Checkout[Continue checkout]
```

Cart quantities and product availability remain subject to backend validation at checkout. Adding an item to the cart does not reserve stock.

### 11.5 Administrator processing

`Find record → Review current status and evidence → Select permitted action → Confirm details/reason → Submit → Display verified result and updated history.`

For payment/refund exceptions, show a pending-investigation state when the authoritative result is uncertain. Never offer an optimistic **Completed** state.

---

## 12. Accessibility

### 12.1 Target and semantics

Target **WCAG 2.2 AA**. Use semantic headings, landmarks, navigation, form labels, tables, and buttons. All essential operations must be available with keyboard only. Provide a visible skip-to-content link and logical tab order.

### 12.2 Interaction requirements

- Maintain visible keyboard focus and restore it after closing menus/dialogs.
- Ensure touch targets meet the applicable WCAG 2.2 target-size requirement, using native component sizes and documented WCAG exceptions only where applicable.
- Use sufficient text and non-text contrast; verify real component combinations, not only isolated tokens.
- Associate validation errors and hints with inputs; announce important state changes through appropriate live regions.
- Provide meaningful image alternatives; decorative images have empty alt text.
- Avoid conveying status through color, position, animation, or icon alone.
- Support zoom, text resizing, reflow, and reduced motion without losing actions or content.
- Use proper accessible names for icon-only controls, pagination, image galleries, and rating controls.
- Ensure overlays have focus management, Escape handling, and an obvious close action where appropriate.

### 12.3 Accessibility verification

Review storefront discovery, variant selection, checkout, guest verification, order tracking, admin tables, modal confirmations, and refund forms with keyboard and screen-reader checks. Automated accessibility checks complement but do not replace manual verification. Repeat contrast, focus, error, overlay and form-control checks in **both light and dark themes**.

---

## 13. Content & visual assets

### 13.1 Language and formatting

The initial interface uses clear English copy suitable for Bangladesh customers; the UI should accommodate future localization without changing layout architecture. Display monetary amounts in BDT with consistent separators. Use an unambiguous date format and label business-day versus calendar-day deadlines where relevant. Show local delivery locations using store-configured district/area values.

### 13.2 Microcopy conventions

Use consistent labels for separate lifecycles: **Order** (Pending, Confirmed, Processing, Shipped, Delivered, Cancelled where eligible), **Payment** (Pending Verification, Paid, Failed, Cancelled, Partially Refunded, Refunded), **Return** (Requested, Under Review, Approved, Awaiting Return, Received, Inspected, Completed or Rejected), and **Refund** (Requested, Under Review, Approved, Rejected, Processing, Completed, Failed). Show risk review, allocation hold, and overpayment/payment-correction flags separately from these lifecycle labels. Non-physical shortage claims use the abbreviated PRD FR-17 claim path. These are user-facing labels mapped to authoritative backend states; do not invent a single combined order/payment/refund status.

- Buttons describe actions: **Add to Cart**, **Proceed to Checkout**, **Place COD Order**, **Continue to Secure Payment**, **Request Cancellation**, **Submit Return Request**, **Approve Refund**.
- State labels are explicit: **Payment Pending Verification**, **Payment Confirmed**, **Refund Processing**, **Refund Completed**.
- Error messages explain what happened and what the user can do next; avoid generic “Something went wrong” when a safe specific explanation is available.
- Avoid countdown promises for payment verification, delivery, or refunds unless the system has a reliable deadline to show.
- Distinguish *estimated delivery date* from *applicable delivery deadline*.

### 13.3 Imagery and icons

Use store-approved product photographs and brand assets. Maintain consistent thumbnail ratios, provide alternate product views where available, and optimize images for responsive loading. Use a consistent icon family and avoid icons without text for critical actions. Store policies, contact details, shipping charges, active payment channels, and logo are operator-supplied/configured values, not fixed design assumptions.

### 13.4 Transactional email presentation

Use one responsive, accessible email layout: store identity, concise subject, clear event heading, order/reference number, verified status, relevant amount/date, support contact, and a safe link to the appropriate verified page. Use plain-text fallbacks and avoid relying on color, images, or email-client dark-mode rendering for meaning.

| Event | Email content focus |
| --- | --- |
| Registration or account recovery | Account confirmation or recovery action; no password disclosure |
| Order placed | Order reference, items/amount, COD due or online payment pending as applicable |
| Payment update | Verified paid, failed, or pending status; safe order link |
| Shipment or delivery exception | Latest fulfillment status, confirmed estimate or support instructions |
| Return update | Request status, receipt/inspection step or decision |
| Refund update | Approved, rejected, processing, failed, or confirmed completed status |

Email links must not expose sensitive data or imply that clicking a link verifies payment. Use backend-confirmed status and the store's approved sender identity.

### 13.5 Content ownership

| Content | Source |
| --- | --- |
| Product names, descriptions, images, prices | Catalog administration |
| Categories, featured products, banners | Catalog/store configuration |
| Delivery zones, charges, estimates | Backend and store configuration |
| Payment channels and financial status | Backend/provider-verified state |
| Shipping, returns, privacy, terms | Store-approved published policy content |
| Contact and complaint details | Store settings |

---

## 14. Design quality & consistency

### 14.1 Page completion checklist

A page specification is ready for implementation when it defines the following. Passing implementation checks still requires real test evidence:

1. A clear title, primary task, and navigation context.
2. Responsive layouts for mobile, tablet, and desktop.
3. Correct shared components and semantic tokens in light and dark modes.
4. Loading, empty, error, success, and relevant pending states.
5. Accessible forms, keyboard interaction, and visible focus.
6. Appropriate authorization/eligibility messaging.
7. Correct BDT, pricing, delivery, and status language.
8. No contradictory behavior against the PRD or `ARCHITECTURE.md`.

### 14.2 Consistency and acceptance checks

| Check | Expected outcome |
| --- | --- |
| Mobile navigation | All PRD-required destinations remain reachable |
| Catalog and variants | Filter, sort, selection, unavailable states, and back navigation work |
| Checkout | Final server totals and delivery details are visible before submission |
| Payment | Redirect alone never appears as verified success |
| Guest access | Verification required; only authorized order actions visible |
| Order management | Fulfillment, payment, return, and refund statuses remain distinct |
| Admin actions | Invalid transitions blocked; financial actions confirmed and auditable |
| Responsive layout | No clipped controls or page-level horizontal scrolling |
| Accessibility | Keyboard, focus, labels, contrast, errors, and reflow checked in both themes |
| Theme switching | System default, explicit preference, persisted choice, native HeroUI variants, and no lost form state |
| Content | No placeholder legal claims, unsupported delivery promises, or inactive payment channels |

### 14.3 Relationship to implementation

Use these specifications as the UI/UX baseline for both applications. `ARCHITECTURE.md` remains authoritative for technical boundaries and financial state transitions; the PRD remains authoritative for product scope and business rules. Implementation tasks, route-by-route coding details, and project schedules belong in `IMPLEMENTATION_PLAN.md` and `TASKS.md`, not here.
