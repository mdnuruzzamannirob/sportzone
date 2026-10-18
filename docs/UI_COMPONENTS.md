# UI component implementation guide

This is a usage reference for the app-owned HeroUI compositions in `storefront/src/components/ui/` and `admin/src/components/ui/`. [Design](./DESIGN.md) governs visual and interaction requirements. Import the relevant module directly; neither app consumes the other app's runtime components.

## Component map

| Module | Exports | Responsibility |
| --- | --- | --- |
| `button.tsx` | `Button` | Primary, outline, ghost and danger variants; disabled/pending handling and visible pending text |
| `fields.tsx` | `TextInput`, `SelectField`, `CheckboxField`, `RadioChoices` | HeroUI labels, helper/error associations and controlled/uncontrolled input support; `TextInput multiline` renders TextArea |
| `form.tsx` | `Form`, `FormErrorSummary` | Prevent navigation/repeated pending submissions; link safe field errors and focus the summary after a failed submit |
| `feedback.tsx` | `Notice`, `LoadingState`, `EmptyState` | Persistent textual feedback, announcement roles, decorative progress/skeletons and caller-supplied recovery actions |
| `overlays.tsx` | `FormDialog`, `FormDrawer` | Titled modal/drawer with description, Escape/Cancel, focus restoration, scrollable body and a pending dismissal lock |
| `link.tsx` | `Link` | HeroUI styling/behavior with Next.js `href` or React Router `to`; use the appropriate app adapter |

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

## Verification

Both apps run the same behavior contract against their own components in light and dark modes. Tests cover labels/errors, input retention, selection, pending guards, feedback semantics, summary focus and dialog/drawer dismissal/draft preservation. Browser viewport, native Tab cycling, zoom, pointer/touch and assistive-technology checks remain distinct from DOM tests. Record observed verification in the owning task evidence.
