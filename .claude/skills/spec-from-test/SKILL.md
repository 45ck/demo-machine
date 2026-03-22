---
name: spec-from-test
description: Convert an existing Playwright or Cypress E2E test file into a demo-machine YAML spec. Reuses test coverage as demo scripts.
argument-hint: <test-file>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *)
---

# Convert E2E Tests to Demo Specs

Parse existing Playwright or Cypress test files and generate demo-machine YAML specs from them. Reuses engineering test coverage as polished product demos.

## Input

- `$ARGUMENTS` should be a path to a Playwright (`.spec.ts`, `.test.ts`) or Cypress (`.cy.ts`, `.cy.js`) test file.
- If no arguments, search for test files in `tests/`, `e2e/`, `cypress/`, or `playwright/` directories.

## Action Mapping

### Playwright → Demo-Machine

| Playwright                       | Demo-Machine                                 | Notes                    |
| -------------------------------- | -------------------------------------------- | ------------------------ |
| `page.goto(url)`                 | `action: navigate, url: ...`                 |                          |
| `page.click(sel)`                | `action: click, selector: ...`               |                          |
| `locator.click()`                | `action: click, target: ...`                 | Convert locator strategy |
| `page.fill(sel, text)`           | `action: type, selector: ..., text: ...`     |                          |
| `locator.fill(text)`             | `action: type, target: ..., text: ...`       |                          |
| `page.hover(sel)`                | `action: hover, selector: ...`               |                          |
| `locator.hover()`                | `action: hover, target: ...`                 |                          |
| `page.press(sel, key)`           | `action: press, key: ...`                    |                          |
| `locator.press(key)`             | `action: press, key: ...`                    |                          |
| `locator.check()`                | `action: check, target: ...`                 |                          |
| `locator.uncheck()`              | `action: uncheck, target: ...`               |                          |
| `locator.selectOption(val)`      | `action: select, target: ..., option: ...`   |                          |
| `page.waitForSelector(sel)`      | `action: wait, timeout: 5000` + `assert`     |                          |
| `expect(...).toBeVisible()`      | `action: assert, target: ..., visible: true` |                          |
| `expect(...).toContainText(txt)` | `action: assert, target: ..., text: ...`     |                          |
| `page.screenshot()`              | `action: screenshot, name: ...`              | Optional for demos       |

### Cypress → Demo-Machine

| Cypress                               | Demo-Machine                                   | Notes    |
| ------------------------------------- | ---------------------------------------------- | -------- |
| `cy.visit(url)`                       | `action: navigate, url: ...`                   |          |
| `cy.get(sel).click()`                 | `action: click, selector: ...`                 |          |
| `cy.get(sel).type(text)`              | `action: type, selector: ..., text: ...`       |          |
| `cy.get(sel).check()`                 | `action: check, selector: ...`                 |          |
| `cy.get(sel).uncheck()`               | `action: uncheck, selector: ...`               |          |
| `cy.get(sel).select(val)`             | `action: select, selector: ..., option: ...`   |          |
| `cy.contains(text).click()`           | `action: click, target: {by: text, text: ...}` |          |
| `cy.get(sel).should('be.visible')`    | `action: assert, selector: ..., visible: true` |          |
| `cy.get(sel).should('contain', text)` | `action: assert, selector: ..., text: ...`     |          |
| `cy.screenshot()`                     | `action: screenshot, name: ...`                | Optional |

### Locator Strategy Mapping

Convert Playwright locators to `target`:

```typescript
// page.getByRole('button', { name: 'Click me' })
target: by: role;
role: button;
name: "Click me";

// page.getByTestId('submit-btn')
target: by: testId;
testId: "submit-btn";

// page.getByLabel('Email')
target: by: label;
label: "Email";

// page.getByText('Hello')
target: by: text;
text: "Hello";
```

## Conversion Steps

1. **Parse the test file** — Identify `describe`, `it`, and `test` blocks
2. **Map to chapters** — Each `describe` → chapter; each `it` → sequence of steps
3. **Extract setup** — Read `beforeAll`, `beforeEach` for runner config
4. **Convert actions** — Use the mapping table above
5. **Add waits** — After `page.goto()` and form submissions, add `wait` steps
6. **Convert assertions** — Turn `expect(...)` into `assert` steps
7. **Generate narration** — Leave empty; user should run `/narrate-spec` afterward
8. **Validate** — `node dist/cli.js validate <spec.yaml>`

## Example Conversion

**Before (Playwright test)**:

```typescript
describe("Task Management", () => {
  it("should create and complete a task", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.click('[data-testid="new-task"]');
    await page.fill('[data-testid="task-input"]', "Buy milk");
    await page.click('[data-testid="add-btn"]');
    await page.waitForSelector('[data-testid="task-item"]');
    await expect(page.locator('[data-testid="task-item"]')).toContainText("Buy milk");
    await page.click('[data-testid="task-item"] input[type="checkbox"]');
    await expect(page.locator('[data-testid="task-item"]')).toHaveClass("completed");
  });
});
```

**After (Demo spec)**:

```yaml
meta:
  title: "Task Management"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "npm run dev"
  url: "http://localhost:3000"
  timeout: 10000

chapters:
  - title: "Creating and Completing a Task"
    steps:
      - action: navigate
        url: "http://localhost:3000"
      - action: wait
        timeout: 1000
      - action: click
        target:
          by: testId
          testId: "new-task"
      - action: type
        target:
          by: testId
          testId: "task-input"
        text: "Buy milk"
      - action: click
        target:
          by: testId
          testId: "add-btn"
      - action: wait
        timeout: 500
      - action: assert
        target:
          by: testId
          testId: "task-item"
        text: "Buy milk"
      - action: click
        target:
          by: role
          role: checkbox
      - action: assert
        target:
          by: testId
          testId: "task-item"
        visible: true
```

## Notes

- **Skip `beforeEach` setup** if it only logs in; add as demo steps instead
- **Extract `baseURL`** from test config → `runner.url`
- **Convert `expect` chains** to separate `assert` steps
- **Add `wait` steps** after navigations (add ~1000ms) and form submissions (~500ms)
- **Test IDs are gold** — use `by: testId` whenever available (most stable)
- **Don't narrate yet** — Leave `narration` fields empty; user runs `/narrate-spec` after

## Validation

After conversion:

```bash
# Validate structure
node dist/cli.js validate <spec.yaml>

# Dry-run (don't capture)
node dist/cli.js run <spec.yaml> --no-record

# Full capture
node dist/cli.js run <spec.yaml> --output ./output
```

Arguments: $ARGUMENTS
