# UI component implementation guide

## Component ownership

[Architecture §§4–5](./ARCHITECTURE.md#4-project-structure) defines placement. P02-012/P02-013 migrate code incrementally; paths in the usage sections describe current components until those tasks update imports, tests and links.

| Component responsibility                                        | Target                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| HeroUI defaults, fields, feedback and router-aware links        | Each app's `components/ui/`                                                  |
| Storefront shell/header/footer and admin/auth shells/navigation | Each app's `components/layout/`; no duplicate root layouts tree              |
| Feature-specific product card/grid/gallery/filter               | `features/products/components/`                                              |
| Add-to-cart behavior                                            | `features/cart/components/`; product screens compose it                      |
| Reusable price/image/status/summary/skeleton compositions       | Storefront `components/commerce/` when genuinely used across features        |
| Reusable table/list/upload/guarded-action compositions          | Admin `components/management/`                                               |
| Feature-only hooks, API functions, schemas and types            | Owning `features/<name>/`; root equivalents only for real cross-feature code |

Keep HeroUI v3 and theme bootstrap. P02-014 replaces custom tokens/fonts with native defaults and centralizes native facades in each app’s `components/ui/`. Do not add empty providers or duplicate component implementations. Preserve Server/Client Component boundaries and keyboard/focus/input-retention behavior; file moves alone do not prove visual acceptance. Form schemas validate usability; backend DTO/security/business validation remains authoritative. Future query/form dependencies are introduced with consuming features and their checks, not assumed installed.

This is a usage reference for the app-owned HeroUI compositions in `storefront/src/components/ui/` and `admin/src/components/ui/`. [Design](./DESIGN.md) governs visual and interaction requirements. Import the relevant module directly; neither app consumes the other app's runtime components. The owner’s 20 October 2026 decision replaces the custom design system with native HeroUI defaults. All application HeroUI imports go through the app’s `components/ui/` modules, enforced by `lint:boundaries`. `primitives.tsx` preserves compound/generic APIs and `theme.css` owns colors/fonts/styles. There is no custom webfont/palette/size skin. `index.ts` exposes the public boundary; framework Link adapters retain navigation semantics.


## Component map

| Module         | Exports                                                     | Responsibility                                                                                                             |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`   | `Button`                                                    | All native variants/sizes; disabled/pending handling and optional visible pending text                            |
| `fields.tsx`   | `TextInput`, `SelectField`, `CheckboxField`, `RadioChoices` | HeroUI labels, helper/error associations and controlled/uncontrolled input support; `TextInput multiline` renders TextArea |
| `form.tsx`     | `Form`, `FormErrorSummary`                                  | Prevent navigation/repeated pending submissions; link safe field errors and focus the summary after a failed submit        |
| `feedback.tsx` | `Notice`, `LoadingState`, `EmptyState`                      | Persistent textual feedback, announcement roles, decorative progress/skeletons and caller-supplied recovery actions        |
| `overlays.tsx` | `FormDialog`, `FormDrawer`                                  | Titled modal/drawer with description, Escape/Cancel, focus restoration, scrollable body and a pending dismissal lock       |
| `link.tsx`     | `Link`                                                      | HeroUI styling/behavior with Next.js `href` or React Router `to`; use the appropriate app adapter                          |

## Fields and validation

- Give text/select fields unique stable IDs and visible labels. Provide `name` when the value belongs in form submission. Required fields include visible text and programmatic required state.
- Pass safe, user-facing `error` text to the field; HeroUI associates it with the input. Native/custom validation remains available on TextInput through the underlying TextField props. Domain rules and server validation remain owned by the feature and API contract.
- Use `TextInput multiline` for notes, and use `SelectField` for a list of labelled options with optional disabled entries. Do not encode permission or business eligibility solely through disabled controls.
- `Form` prevents default navigation and ignores submissions while `isPending` is true. The caller owns request lifecycle, field errors, result handling, retries and backend idempotency. Changing a button to pending is not backend duplicate protection.
- `FormErrorSummary` accepts `{ fieldId, message }` entries. Pass a `focusKey` counter and increment it after each failed submission. Ordinary keystrokes must not increment it. Each link focuses the corresponding field; do not send raw exception details to this component.
- Keep values when validation or requests fail. Explicitly clear only after an authoritative success or a user-requested reset. Avoid retaining sensitive drafts beyond their required UI lifetime.

```tsx
<Form isPending={pending} onSubmit={handleSubmit}>
  <FormErrorSummary errors={issues} focusKey={failedAttempts} />
  <TextInput
    id="display-name"
    name="displayName"
    label="Display name"
    value={draft}
    onChange={setDraft}
    error={fieldError}
    isRequired
  />
  <Button type="submit" isPending={pending} pendingLabel="Saving…">
    Save
  </Button>
</Form>
```

The variables and `handleSubmit` belong to the consuming feature; the example does not implement an API operation.

## Feedback and pending actions

`Notice` accepts `info`, `success`, `warning` or `error`. Errors use an assertive alert; other feedback uses a polite status. Important confirmations remain on the page. A success notice is appropriate only after the owning operation verifies success. Pass a recovery action only when that retry is safe.

Pending Buttons keep their accessible progress text and block activation through HeroUI. Forms also guard submit events, including keyboard submissions. Explain significant disabled actions nearby. A danger variant supplies presentation only; destructive/financial confirmation and authorization remain feature responsibilities.

`LoadingState` provides one polite status with decorative Spinner/Skeleton content. `EmptyState` provides a title, explanation and optional recovery action; show it only after a successful empty result, not while loading or after an error.

## Dialogs and drawers

- Render the parent editor outside the overlay. Keep draft values in that parent and pass controlled field values into the panel, so unmounting/reopening the overlay preserves the intended draft. Uncontrolled fields inside an unmounted panel are not retained automatically.
- Supply descriptive `title`, `triggerLabel` and optional `description`. Place the form fields in `children` and caller-owned actions in `actions`. If an action is outside its form, explicitly associate it through the form ID or use an explicit handler.
- Panels restore focus to their trigger on ordinary dismissal. HeroUI owns modal focus containment and keyboard behavior. The body scrolls within the viewport; the drawer permits vertical touch panning.
- While `isPending`, Escape, backdrop dismissal and Cancel are disabled. The caller must settle pending state and show a verified result/error; the panel does not start, retry or complete an operation itself. Never leave a panel permanently locked after a failed request.
- Optional `isOpen`/`onOpenChange` support caller-controlled lifecycle. Do not add a public preview route or synthetic authenticated session to demonstrate a foundation component.

## Commerce compositions

Storefront commerce components live in `storefront/src/components/commerce/`. These presentation props are not new public DTOs; consuming features adapt the API contract at their boundary. No live catalog/cart/checkout feature is implied by this foundation.

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

## Admin management compositions

Admin-only primitives live in `admin/src/components/management/`. They are presentation foundations, with no authenticated preview routes, live management data or backend mutations.

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

## Verification

Both apps run the same behavior contract against their own components once in jsdom; browser checks exercise light and dark styling. Tests cover labels/errors, input retention, selection, pending guards, feedback semantics, summary focus and dialog/drawer dismissal/draft preservation. Browser viewport, native Tab cycling, zoom, pointer/touch and assistive-technology checks remain distinct from DOM tests. Record observed verification in the owning task evidence.

Storefront additionally runs 20 commerce cases, covering sale/rating/image states, unavailable variants, bounded/direct quantities, pending/removal, supplied amount authority and loading semantics. Browser layout/image-delivery/zoom/native keyboard checks remain separate from DOM state checks.

Admin management tests run ten DOM cases: server row order/header/sort, arrow-key navigation, local overflow structure, result states/retry, pagination guards, filter drafts, file constraints/preview cleanup/progress/retry, explicit reason/eligibility confirmation and Escape/focus restoration and caller-controlled closure. DOM tests do not establish rendered viewport usability or native file-picker behavior.

The actual-app preview and focused browser checks live in `tests/ui/`. `npm run test:ui` requires both built apps and installed Playwright engines; see [P02-011 audit evidence](./evidence/P02-011-accessibility.md). The fixture uses real components and synthetic data outside the production route trees; it provides no authentication bypass.

## Default-theme migration and preview

P02-014 records owner authorization, research and cleanup. The single local `showcase.html` loads the actual selected app UI facade and theme, with Admin/Storefront and Light/Dark controls. It exposes native variant axes, app fields/feedback/dialogs/theme and commerce/management compositions. It is not a separately styled mock. Theme switching preserves mounted drafts; app switching reloads the CSS boundary.

Native Button variants/sizes are no longer narrowed by the app wrapper. Optional `pendingLabel` remains an explicit behavior composition. Required-field indication uses native labels/ARIA rather than appended text. Dialog/drawer Cancel uses the native close slot, with no positioning override. CSS palette/asset snapshots and duplicate DOM theme runs were retired; functional/negative tests, BDT correctness, theme lifecycle, browser interaction and explicit accessibility checks remain. Historical evidence is not rewritten as new acceptance.
