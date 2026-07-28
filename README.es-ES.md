<div align="center">

# demo-machine

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://github.com/45ck/demo-machine/raw/master/assets/banner.dark.png"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://github.com/45ck/demo-machine/raw/master/assets/banner.light.png"
  />
  <img
    src="https://github.com/45ck/demo-machine/raw/master/assets/banner.light.png"
    alt="demo-machine banner"
    width="100%"
  />
</picture>

**Demo como código**: convierte especificaciones versionadas en capturas de navegador repetibles y videos de demostración de producto pulidos.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/demo-machine)](https://www.npmjs.com/package/demo-machine)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)](tests/)
[![Playwright](https://img.shields.io/badge/Playwright-Browser%20Automation-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Video%20Rendering-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org)

[Inicio Rápido](#quick-start) &bull; [Docs](docs/README.md) &bull; [CLI](docs/cli-reference.md) &bull; [Spec](docs/spec-reference.md) &bull; [MCP](docs/mcp.md) &bull; [Roadmap](ROADMAP.md)

</div>

---

## Qué hace

demo-machine lee una especificación `.demo.yaml`, lanza tu aplicación, controla un navegador real con Playwright, graba la ejecución y renderiza un archivo MP4 pulido.

Úsalo cuando quieras demostraciones de producto que sean:

- Repetibles en lugar de regrabadas manualmente.
- Controladas por versiones junto al código de la aplicación.
- Narradas, con movimiento suave del cursor, encuadre de cámara centrado en el zoom, feedback de clics legible y transiciones de zoom-out limpias.
- Revisables a través de artefactos como trazas, capturas de pantalla, manifiestos e informes de calidad.
- Listas para análisis: las ejecuciones completadas pueden empaquetarse en artefactos de revisión sin necesidad de recaptura o renderizado.
- Asistidas por IA a través del servidor MCP integrado.

Es local-first. No requiere servicios en la nube y actualmente no tiene dependencias de CI.

## Demo

El video principal de exhibición fue generado a partir de [examples/assurance/long-demo/long-demo.demo.yaml](examples/assurance/long-demo/long-demo.demo.yaml):

[![AssuranceOps showcase video preview](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo-poster.webp)](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo.mp4)

Abre el [video de exhibición narrado de AssuranceOps](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo.mp4). Más ejemplos renderizados se encuentran en la [galería de demos](docs/demo-gallery.md).

La exhibición demuestra el estándar de calidad actual: la narración precede a la acción, el cursor se mueve hacia el elemento discutido, la cámara hace zoom en la UI relevante en lugar de una región genérica, la acción real de clic o escritura ocurre mientras está encuadrada, y la vista vuelve suavemente a salir antes del siguiente paso.

## Quick Start

```bash
git clone https://github.com/45ck/demo-machine.git
cd demo-machine
pnpm install
pnpm exec playwright install chromium
pnpm build
node dist/cli.js run examples/showcase/todo-app.demo.yaml --no-headless
```

Requisitos:

- Node.js >= 22
- pnpm
- FFmpeg en tu `PATH`
- Chromium instalado a través de Playwright

El video renderizado se escribe en una carpeta segura por ejecución:

```text
output/todo-app/<run-id>/output.mp4
```

Para un recorrido más detallado, usa [Getting Started](GETTING-STARTED.md). Para cada comando y opción, usa la [referencia de la CLI](docs/cli-reference.md).

## Comandos Básicos

```bash
# Pipeline completo: captura + renderizado + controles de calidad
demo-machine run <spec.yaml>

# Validar antes de invertir tiempo en la captura
demo-machine validate <spec.yaml>

# Crear una especificación inicial
demo-machine init my-product.demo.yaml --url http://localhost:3000 --command "pnpm dev"

# Solo captura
demo-machine capture <spec.yaml>

# Re-renderizar desde una captura previa
demo-machine edit <output-dir>/events.json

# Analizar una ejecución existente para artefactos de revisión
demo-machine analyze <output-dir>
demo-machine analyze --latest --spec <spec.yaml>

# Generar una página de visualización estática con capítulos junto a una ejecución completada
demo-machine share <spec.yaml> <output-dir>

# Buscar ejemplos para copiar
demo-machine examples list
demo-machine examples show controls-lab

# Verificar dependencias locales
demo-machine doctor
```

## Ejemplos

Las especificaciones de ejemplo están organizadas por propósito:

- `examples/showcase/`: demos pulidas utilizadas en la documentación y galería.
- `examples/proof/actions/`: pequeñas pruebas de reproducción a nivel de acción.
- `examples/proof/variants/`: variantes de cobertura de redacción y sincronización de narración.
- `examples/assurance/long-demo/`: un flujo de QA realista y más largo para asegurar el video completo.

`examples/manifest.json` es la fuente de verdad para el descubrimiento y herramientas de suite. `demo-machine examples list` lee ese manifiesto y, por defecto, muestra las especificaciones de showcase y assurance. Usa `--type proof` para fixtures de acción, `--type all` para cada entrada del manifiesto, y filtros como `--tag`, `--signal`, `--tier` o `--search` para acotar la tabla. `demo-machine examples show <slug>` imprime la ruta canónica de la especificación, variantes, señales de calidad y los comandos ejecutables `run` y `validate`.

## Cómo Funciona

```text
archivo de especificación (spec file)
  -> validar
  -> iniciar aplicación
  -> controlar navegador
  -> capturar video + eventos + traza + capturas de pantalla
  -> renderizar MP4
  -> escribir verificación + artefactos de calidad
  -> opcionalmente escribir visor estático compartido + manifiesto de integración
  -> opcionalmente analizar ejecución completada para artefactos de revisión
```

Las ejecuciones por defecto escriben en `output/<spec-slug>/<run-id>` y actualizan `output/latest.json`. Si pasas `--output <dir>`, demo-machine usa ese directorio exacto y se niega a sobrescribir artefactos de demo conocidos a menos que también pases `--overwrite`.

Artefactos clave:

- `output.mp4`: video de demo renderizado
- `video.webm`: grabación bruta del navegador
- `events.json`: línea de tiempo de acciones capturadas
- `verification.json`: prueba de captura y contrato de artefactos
- `environment.json`: contexto de ejecución/navegador
- `quality.json`: controles post-renderizado
- `trace.zip`: traza de Playwright para depuración, a menos que `DEMO_MACHINE_PUBLIC_SAFE=true` esté configurado para una grabación pública sensible
- `viewer.html` y `viewer.manifest.json`: página de visualización por capítulos, sin rastreo y con enlaces profundos, y contrato de integración de duración/incrustación cuando `share` está configurado.

`demo-machine analyze <output-dir>` se ejecuta después de que se haya completado una captura/renderizado.
Utiliza `@45ck/video-evaluator` para inspeccionar el `output.mp4` renderizado o el `video.webm` bruto y escribe artefactos de análisis junto a la ejecución sin cambiar la captura. Las salidas actuales del analizador incluyen `review-bundle.json`, `review-prompt.md`, `video.shots.json`, `segment.evidence.json`, `layout-safety.report.json`, `demo-capture-evidence.json` cuando existe evidencia de capturas de pantalla o eventos, y archivos `segment-storyboard/`. Pasa `--spec <path>` para incluir la especificación fuente en el prompt de revisión, `--video <path>` para analizar un video independiente, `--layout <path>` para incluir anotaciones de diseño, o `--no-ocr` cuando los pasos del storyboard basados en OCR no están disponibles localmente.

Cuando hay artefactos del analizador junto al video renderizado, la puerta de calidad post-renderizado lee `layout-safety.report.json`, `segment.evidence.json` y `review-bundle.json` y emite sus hallazgos dentro de la forma de resultado normal de `quality.json`. Se permite la ausencia de artefactos del analizador; hacen que la revisión tenga menos respaldo de evidencia, pero no hacen fallar una ejecución normal por sí solos.

El límite de propiedad es deliberado. `video-evaluator` posee el análisis de video reutilizable: hechos multimedia, evidencia de storyboard/toma/segmento, seguridad de diseño, señales técnicas y de subtítulos, diferencias visuales y empaquetado de prompts de revisión para agentes. demo-machine mantiene locales la captura del navegador, las trazas de Playwright, la semántica de las acciones, la validación de selectores, el comportamiento de la narración/cursor y la política final de `quality.json` específica de la demo.

## Ejemplo de Especificación

```yaml
meta:
  title: "Mi Demo de Producto"

runner:
  command: "pnpm dev"
  url: "http://localhost:3000"
  healthcheck: "http://localhost:3000/health"

chapters:
  - title: "Primera mirada"
    steps:
      - action: navigate
        url: "/"
      - action: click
        target:
          by: role
          role: button
          name: "Get Started"
      - action: screenshot
        name: first-screen
```

Prefiere objetivos estructurados como `role`, `label`, `text` y `testId` antes que selectores CSS brutos. Consulta la [referencia de especificaciones](docs/spec-reference.md) para todos los campos, acciones, objetivos, narración y redacción.

## AI / MCP

demo-machine incluye un servidor MCP para que los asistentes de IA puedan ayudar a crear, validar, ejecutar, revisar y reparar demostraciones.

```json
{
  "mcpServers": {
    "demo-machine": {
      "command": "npx",
      "args": ["demo-machine-mcp"]
    }
  }
}
```

El servidor MCP expone 5 herramientas, 4 recursos y 8 prompts. Consulta la [guía de MCP](docs/mcp.md) para la lista completa.

El repositorio también incluye archivos de habilidades para agentes para flujos de trabajo estilo Claude Code en `.claude/skills/`, y `pnpm qa:meta-prompt` crea un espacio de trabajo listo para Codex con una habilidad y prompt local de Demo Machine. En la práctica, puedes pedirle a un agente de codificación que inspeccione una aplicación, escriba el `.demo.yaml`, ejecute Demo Machine, analice la salida completada, revise el `review-prompt.md`, `quality.json` y el MP4 generados, e itere hasta que la narración, el enfoque del zoom, el movimiento del cursor y la calidad visual sean impecables.

## Calidad Local

```bash
pnpm validate
pnpm local-ready
pnpm release-ready:fast
pnpm release-ready
pnpm examples:validate -- --no-build
pnpm examples:smoke:pr -- --limit 2
pnpm release:gates:showcase
pnpm video:assure -- --filter assurance-long-demo
pnpm golden-frames:compare
pnpm visual-diff
pnpm qa:meta-prompt
```

`pnpm validate` ejecuta lint, formateo, ortografía, chequeo de tipos, tests, chequeos de dependencias y verificaciones estrictas de inventario. `pnpm local-ready` añade el build y la validación de ejemplos. `pnpm release-ready:fast` añade puertas de lanzamiento sin renderizar videos de smoke, mientras que `pnpm release-ready` ejecuta la captura/renderizado de smoke de nivel PR y la seguridad de video. `pnpm examples:validate` valida especificaciones respaldadas por manifiesto, y `pnpm video:assure` escanea las salidas MP4 renderizadas en busca de frames en blanco, tramos congelados y saltos visuales grandes una vez que existen las salidas de ejemplos renderizadas.

`pnpm local-ready` es la puerta de entrega local esperada para cambios ordinarios de código y documentación. No actualiza las líneas base visuales. Usa `pnpm golden-frames` para extraer cinco líneas base de frames clave por demo renderizada, `pnpm golden-frames:compare` o `pnpm visual-diff` para comparar los renderizados actuales con `baselines/golden-frames`, y los comandos de actualización correspondientes solo después de que un humano haya aceptado el cambio visual.

`pnpm release:gates:showcase` protege la superficie de demo pública: el README debe enlazar el MP4 y el póster aprobados, la suite principal de long-demo debe seguir respaldada por manifiesto con señales de calidad de narración/cursor/selector, y la galería curada debe mantener al menos 10 entradas de alta calidad con GIFs, capturas de frames y duraciones.

`pnpm qa:meta-prompt` crea un proyecto de fixture complejo más una habilidad y prompt de Codex para Demo Machine. Usa `pnpm qa:meta-prompt:run` cuando quieras que el CLI de Codex cree demos narradas, cubra la matriz de acciones/componentes, ejecute Demo Machine, se autoevalúe y produzca una página de revisión humana en `output/meta-prompt-qa/review.html`.

## Aprender Más

El [índice de documentación](docs/README.md) agrupa los documentos por flujo de trabajo: primera ejecución, autoría de especificaciones, flujos de trabajo de agentes, ejemplos, puertas de calidad y seguridad de lanzamiento.

Puntos de entrada comunes:

- [Getting Started](GETTING-STARTED.md): primera ejecución, especificaciones iniciales y flujo de validación.
- [Demo Anything](docs/demo-anything.md): principios de autoría, selección de objetivos, matriz de ejemplos y el manual para aplicaciones nuevas.
- [MCP Integration](docs/mcp.md): herramientas de asistente de IA, recursos, prompts y configuración de agentes.
- [Verification Matrix](docs/verification-matrix.md): qué prueban los controles locales y cómo se rastrea la cobertura.
- [Contributing](CONTRIBUTING.md), [Releasing](RELEASING.md), y [Security](SECURITY.md): operaciones del proyecto.

## Licencia

[MIT](LICENSE)
