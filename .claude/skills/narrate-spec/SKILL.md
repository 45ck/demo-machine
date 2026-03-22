---
name: narrate-spec
description: Generate compelling AI narration for every step in a demo-machine spec. Use when a spec has no narration or needs better narration text.
argument-hint: <spec-file> [--tone formal|casual|technical]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *)
---

# AI Narration Writing

Generate compelling, coherent narration text for every step in a demo-machine YAML spec. Creates a narrative that flows naturally across chapters, explaining _why_ the user is performing each action — not just describing the click.

## Input

- `$ARGUMENTS` should include a path to an existing `.demo.yaml` file.
- Optional `--tone` flag: `formal` (default), `casual`, or `technical`.
- If no arguments, look for `*.demo.yaml` files in the project.

## Narration Guidelines

### Voice & Tone

- **Formal** (default): Professional product demo voice. "Let's navigate to the dashboard to review our metrics."
- **Casual**: Friendly walkthrough. "Now we'll hop over to the dashboard and check out the numbers."
- **Technical**: Developer-focused. "Navigate to the /dashboard endpoint to inspect the metrics payload."

### Writing Rules

1. **Lead into actions**: Narration should describe what's about to happen, not what just happened. "Let's click Save to persist our changes" (before the click), not "We clicked Save" (after).
2. **Explain the why**: Don't narrate obvious mechanics. Instead of "Click the button", say "Save our configuration to apply the new settings."
3. **Flow across chapters**: The narration should read as a coherent story. Use transitions: "Now that we've set up the basics, let's explore the advanced features."
4. **Respect TTS constraints**: Keep text to 5-15 words per step. Avoid abbreviations, special characters, and jargon that TTS will mispronounce.
5. **Skip trivial steps**: Don't narrate every `wait` or intermediate `click`. Only add narration to steps where it provides value.
6. **Chapter-level narration**: Use the chapter's `narration` field for chapter introductions when appropriate.
7. **First chapter = introduction**: Open with a welcoming sentence that sets context.
8. **Last chapter = wrap-up**: End with a summary or call-to-action.

### What NOT to narrate

- `wait` steps (unless the wait is for something meaningful like "while the data loads")
- Intermediate clicks that are part of a multi-step action (narrate the intent on the first step)
- `screenshot` steps
- `assert` steps (unless the assertion demonstrates a key feature)

## Steps

1. **Read** the spec file completely. Understand the app, the user journey, and the chapter organization.

2. **Analyze** the existing narration (if any). Note gaps, inconsistencies, or mechanical descriptions.

3. **Generate** narration for each chapter and step:
   - Write chapter-level `narration` for chapter introductions
   - Write step-level `narration` for key action steps
   - Ensure the narrative flows as a coherent story
   - Match the requested tone

4. **Apply** the narration by editing the spec file. Only add/modify `narration` fields — do not change actions, selectors, or other step properties.

5. **Validate** the updated spec:

   ```bash
   node dist/cli.js validate <spec.yaml>
   ```

6. Report what was added/changed and the overall narrative arc.

## Example Transformation

**Before** (no narration):

```yaml
chapters:
  - title: "Adding a Task"
    steps:
      - action: click
        selector: "#task-input"
      - action: type
        selector: "#task-input"
        text: "Design landing page"
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500
```

**After** (with narration):

```yaml
chapters:
  - title: "Adding a Task"
    narration: "Now let's add our first task to the list."
    steps:
      - action: click
        selector: "#task-input"
      - action: type
        selector: "#task-input"
        text: "Design landing page"
        narration: "We'll type in a task for designing the landing page."
      - action: click
        selector: "#add-btn"
        narration: "Click Add to save it to our task list."
      - action: wait
        timeout: 500
```

Arguments: $ARGUMENTS
