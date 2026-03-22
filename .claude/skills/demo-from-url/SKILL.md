---
name: demo-from-url
description: Generate a complete demo-machine YAML spec by crawling a live web app. Give it a URL and description, get a ready-to-run spec.
argument-hint: <url> [description]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(npx *)
---

# AI Spec Generation from URL

Navigate to a live web application, discover its interactive elements, identify the primary user journey, and generate a complete demo-machine YAML spec with narration.

## Input

- `$ARGUMENTS` should start with a URL (required), optionally followed by a description of what to demo.
- Examples:
  - `/demo-from-url http://localhost:3000`
  - `/demo-from-url http://localhost:3000 Show the task management workflow`
  - `/demo-from-url https://myapp.example.com Demonstrate user signup and first project creation`

## Discovery Process

### 1. Reconnaissance

First, understand the app by navigating to the URL and inspecting the page:

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('YOUR_URL');
  const html = await page.content();
  console.log(html);
  await browser.close();
})();
"
```

Identify:

- Main heading / page title
- Primary call-to-action buttons
- Form inputs
- Navigation links
- Interactive elements (dropdowns, modals, toggles)

### 2. Map the User Journey

Choose the **primary user journey** based on the app's purpose. Examples:

- **Todo app**: Create a task → mark complete → delete
- **E-commerce**: Browse → filter → add to cart → checkout
- **SaaS dashboard**: Login → navigate to feature → perform action → save
- **Form app**: Fill form → validate → submit → confirmation

Break it into **3–5 chapters**, each representing a cohesive action sequence.

### 3. Generate the YAML Spec

Create a spec file with:

```yaml
meta:
  title: "App Name Demo"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "npm run dev" # or null if already running
  url: "http://localhost:3000"
  timeout: 10000

chapters:
  - title: "Chapter 1: Opening"
    narration: "Welcome to the app."
    steps:
      - action: navigate
        url: "http://localhost:3000"
      - action: wait
        timeout: 500
      - action: click
        target:
          by: role
          role: button
          name: "Get Started"
        narration: "Click Get Started to begin."

  - title: "Chapter 2: Main Workflow"
    steps:
      # ... more steps
```

## Target Preference

When creating `target` blocks, prefer this order:

1. **`by: testId`** — Most stable

   ```yaml
   target:
     by: testId
     testId: "submit-button"
   ```

2. **`by: role` + `name`** — Accessible, stable

   ```yaml
   target:
     by: role
     role: button
     name: "Submit"
   ```

3. **`by: label`** — For form elements

   ```yaml
   target:
     by: label
     label: "Email"
   ```

4. **`by: text`** — As fallback

   ```yaml
   target:
     by: text
     text: "Click here"
   ```

5. **`selector`** — Last resort
   ```yaml
   selector: ".primary-button"
   ```

## Step Types

Use these actions to build your journey:

- `navigate` — Go to a URL
- `click` — Click an element
- `type` — Type text into an input
- `select` — Select a dropdown option
- `check` / `uncheck` — Toggle checkboxes
- `hover` — Hover over an element
- `press` — Press a keyboard key
- `scroll` — Scroll the page
- `wait` — Pause for a duration
- `assert` — Verify element visibility or text
- `screenshot` — Capture the current state

## Narration Guidelines

- Keep each line to 5–15 words
- Write in present/future tense: "Let's click..." not "We clicked..."
- Explain **why** each action matters
- Skip `wait` and intermediate steps
- Start with a welcome; end with a summary

## Verification

After generating the spec:

```bash
# Validate the YAML structure
node dist/cli.js validate <spec.yaml>

# Dry-run the spec (don't record)
node dist/cli.js run <spec.yaml> --no-record

# Full capture with rendering
node dist/cli.js run <spec.yaml> --output ./output
```

## Example Spec

```yaml
meta:
  title: "Todo App Demo"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "npm run dev"
  url: "http://localhost:3000"
  timeout: 10000

chapters:
  - title: "Creating a Task"
    narration: "Let's create our first task."
    steps:
      - action: navigate
        url: "http://localhost:3000"
      - action: click
        target:
          by: testId
          testId: "new-task-btn"
      - action: type
        target:
          by: label
          label: "Task title"
        text: "Design the landing page"
        narration: "Type in our task."
      - action: click
        target:
          by: role
          role: button
          name: "Add"
        narration: "Click Add to save."

  - title: "Completing a Task"
    narration: "Now mark it as complete."
    steps:
      - action: click
        target:
          by: role
          role: checkbox
          name: "Design the landing page"
        narration: "Check off the task."
      - action: wait
        timeout: 500
      - action: assert
        target:
          by: text
          text: "Design the landing page"
        visible: true
        narration: "Task is marked complete."
```

Arguments: $ARGUMENTS
