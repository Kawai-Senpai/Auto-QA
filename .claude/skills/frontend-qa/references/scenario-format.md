# Scenario Format

The framework-neutral representation compiled into Playwright tests. Defined and
validated in `src/lib/scenario.ts`.

The schema is a constraint, not a suggestion: it cannot express XPath, CSS
selectors or DOM-position lookups, so the compiler cannot emit them.

## Shape

```json
{
  "id": "checkout-blocks-without-terms",
  "name": "Checkout is blocked until terms are accepted",
  "requirementSource": "specs/qa/requirements/guest-checkout.md#terms",
  "startPath": "./",
  "steps": [],
  "assertions": []
}
```

| Field | Rule |
| --- | --- |
| `id` | Lowercase letters, digits, hyphens. Becomes the filename. |
| `name` | The test title. At least 3 characters. Describe the behaviour. |
| `requirementSource` | Required. Where the expectation came from. |
| `startPath` | Relative, e.g. `./` or `./checkout`. See note below. |
| `steps` | May be empty when only asserting a landing state. |
| `assertions` | At least one. A test without assertions is not a test. |

### `startPath` must be relative

`'/'` resolves against the origin and drops any path in the base URL.
`https://example.com/app` + `/` gives `https://example.com/`. Use `./`.

## Targets

Four strategies, in order of preference:

```json
{ "by": "role", "role": "button", "name": "Place order", "exact": true }
{ "by": "label", "label": "Postcode" }
{ "by": "text", "text": "1 item left", "exact": true }
{ "by": "testId", "testId": "checkout-submit" }
```

Roles: `alert`, `button`, `checkbox`, `combobox`, `dialog`, `heading`, `img`,
`link`, `list`, `listitem`, `option`, `radio`, `searchbox`, `status`, `switch`,
`tab`, `textbox`.

Reach for `testId` only when no semantic locator can identify the control, and
say so in your report.

### Scoping with `within`

When the same accessible name appears more than once — a link in both a header
and a footer — scope it. Any target may carry:

```json
{
  "by": "role", "role": "link", "name": "Pricing", "exact": true,
  "within": { "role": "navigation", "name": "Primary" }
}
```

Compiles to:

```ts
page.getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pricing", exact: true })
```

`within.role` also accepts landmarks: `banner`, `navigation`, `main`,
`contentinfo`, `region`, `form`. `within.name` is optional.

This exists because `.first()` and `.nth(0)` degrade an assertion to "one of
these exists somewhere", and `nth()` is rejected by the auditor anyway.

## Steps

```json
{ "action": "goto",    "path": "./checkout" }
{ "action": "click",   "target": {} }
{ "action": "fill",    "target": {}, "value": "SW1A 1AA" }
{ "action": "press",   "target": {}, "key": "Enter" }
{ "action": "check",   "target": {} }
{ "action": "uncheck", "target": {} }
{ "action": "hover",   "target": {} }
{ "action": "select",  "target": {}, "value": "express" }
```

There is no `wait` action. Playwright's assertions retry; wait on observable
state instead of a duration.

## Assertions

### Visible state

```json
{ "type": "visible",      "target": {} }
{ "type": "hidden",       "target": {} }
{ "type": "containsText", "target": {}, "text": "Accept the terms to continue" }
{ "type": "value",        "target": {}, "value": "" }
{ "type": "checked",      "target": {} }
{ "type": "unchecked",    "target": {} }
{ "type": "count",        "target": {}, "count": 3 }
{ "type": "urlPath",      "path": "/dashboard" }
```

### Side effects

A frontend can show a success toast while sending the wrong request, or none at
all. These assert what actually left the browser:

```json
{ "type": "requestSeen",   "method": "POST", "urlIncludes": "/api/orders" }
{ "type": "requestAbsent", "method": "POST", "urlIncludes": "/api/orders" }
```

The compiler registers the request listener before the first navigation, so a
request fired during initial load is still observed.

Prefer pairing a visible assertion with a side-effect assertion. "The error
appeared **and** no order was created" is a real test; the first half alone is
not.

### Accessibility

```json
{ "type": "axe" }
{ "type": "axe", "tags": ["wcag2a", "wcag2aa"] }
```

Adds an `@axe-core/playwright` scan asserting zero violations.

## Worked example

```json
{
  "id": "checkout-blocks-without-terms",
  "name": "Checkout is blocked until terms are accepted",
  "requirementSource": "specs/qa/requirements/guest-checkout.md#terms",
  "startPath": "./checkout",
  "steps": [
    { "action": "fill", "target": { "by": "label", "label": "Postcode" }, "value": "SW1A 1AA" },
    { "action": "click", "target": { "by": "role", "role": "button", "name": "Place order" } }
  ],
  "assertions": [
    { "type": "containsText", "target": { "by": "role", "role": "alert" }, "text": "Accept the terms to continue" },
    { "type": "requestAbsent", "method": "POST", "urlIncludes": "/api/orders" }
  ]
}
```

## Compiling

```bash
npx tsx src/cli-compile.ts specs/qa/scenarios/<id>.json
```

Writes `tests/e2e/generated/<id>.spec.ts`. Generated files are build artifacts —
edit the scenario, never the output.
