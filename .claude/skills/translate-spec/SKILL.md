---
name: translate-spec
description: Translate all narration text in a demo-machine spec to another language, producing a localized copy.
argument-hint: <spec-file> <language>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *)
---

# Multi-Language Demo Specs

Translate all narration and user-facing text in a demo spec to another language, creating localized versions for international audiences.

## Input

- `$ARGUMENTS` should include:
  - A path to the `.demo.yaml` spec file (required)
  - A target language (required): e.g. `French`, `ja` (Japanese), `pt-BR` (Brazilian Portuguese)
- Examples:
  - `/translate-spec examples/my-demo.yaml French`
  - `/translate-spec specs/dashboard.demo.yaml es`
  - `/translate-spec ./app-demo.yaml "Traditional Chinese"`

## What Gets Translated

### Translate These Fields

- `meta.title` — The demo title
- `meta.branding.tagline` (if present) — Brand tagline
- `chapters[].title` — Chapter headings
- `chapters[].narration` — Chapter introductions
- `chapters[].steps[].narration` — Step narration (the voice-over text)

### Do NOT Translate These Fields

- `runner.command`, `runner.url` — Technical config
- `chapters[].steps[].action` — Action types (click, type, navigate, etc.)
- `chapters[].steps[].selector`, `target` — CSS selectors, ARIA role names
- `chapters[].steps[].text` (typed input) — Text that appears in the app (e.g. form values)
- `chapters[].steps[].url` — URLs and endpoints
- `pacing`, `narration.provider`, `narration.voice` — Technical config

## Translation Rules

1. **Preserve meaning over literal translation**
   - Translate the intention, not word-for-word
   - Adapt for cultural context when appropriate

2. **Maintain TTS compatibility**
   - Keep narration to 5–15 words per step (same as English)
   - Avoid abbreviations and special characters
   - Use natural phrasing for the target language

3. **Keep text length similar**
   - Don't expand narration by >20% (impacts TTS timing)
   - If translation is longer, trim words or simplify phrasing

4. **Preserve product names**
   - Keep app/company names in English (they appear in UI)
   - "Click Save" → "Haga clic en Guardar", not "Haga clic en Guardar [translated name]"

5. **Use language conventions**
   - Use correct punctuation, capitalization, and formatting for the target language
   - Example: French uses `«guillemets»`, not `"quotes"`

6. **Maintain narrative flow**
   - Keep the same voice and tone (formal, casual, technical)
   - Ensure transitions between chapters still read smoothly

## Output Format

Save the translated spec as:

- `examples/my-demo.{language}.demo.yaml`
- Examples: `examples/my-demo.fr.demo.yaml`, `examples/my-demo.ja.demo.yaml`

## Example Translation

**Before (English)**:

```yaml
meta:
  title: "Task Management Demo"

chapters:
  - title: "Getting Started"
    narration: "Welcome to our task app."
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Let's start by opening the app."
      - action: click
        target:
          by: role
          role: button
          name: "New Task"
        narration: "Click the New Task button."
      - action: type
        target:
          by: label
          label: "Task name"
        text: "Buy groceries"
        narration: "Type the task name."
      - action: click
        target:
          by: role
          role: button
          name: "Save"
        narration: "Click Save to create the task."
```

**After (Spanish)**:

```yaml
meta:
  title: "Demostración de Gestión de Tareas"

chapters:
  - title: "Comenzando"
    narration: "Bienvenido a nuestra aplicación de tareas."
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Empecemos abriendo la aplicación."
      - action: click
        target:
          by: role
          role: button
          name: "New Task"
        narration: "Haga clic en el botón Nueva Tarea."
      - action: type
        target:
          by: label
          label: "Task name"
        text: "Buy groceries"
        narration: "Escriba el nombre de la tarea."
      - action: click
        target:
          by: role
          role: button
          name: "Save"
        narration: "Haga clic en Guardar para crear la tarea."
```

## Verification

After translation:

```bash
# Validate the translated spec
node dist/cli.js validate examples/my-demo.{language}.demo.yaml

# Test narration (if TTS provider supports the language)
node dist/cli.js run examples/my-demo.{language}.demo.yaml \
  --output ./output \
  --narration-provider kokoro \
  --narration-language {language}
```

## Common Language Codes

- `en` — English
- `es` or `es-ES` — Spanish
- `fr` — French
- `de` — German
- `it` — Italian
- `pt` or `pt-BR` — Portuguese
- `ja` — Japanese
- `zh-CN` — Simplified Chinese
- `zh-TW` — Traditional Chinese
- `ko` — Korean
- `ru` — Russian

## Tips

- **Use a native speaker** if available for high-quality translations
- **Test with TTS** to ensure the translated narration sounds natural
- **Keep chapters concise** — translation can expand text length
- **Abbreviations** — Use full words (e.g. "número" not "nº")
- **Punctuation** — Match target language conventions (French `:` vs. English `:`)

Arguments: $ARGUMENTS
