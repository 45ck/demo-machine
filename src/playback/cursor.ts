const CONTROL_POINT_OFFSET = 0.42;
const CONTROL_POINT_OFFSET_2 = 0.58;

export function cubicBezier(t: number): number {
  const p1y = CONTROL_POINT_OFFSET;
  const p2y = CONTROL_POINT_OFFSET_2;
  const mt = 1 - t;
  return 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t;
}

const CURSOR_SIZE = 24;
const CURSOR_Z_INDEX = 999999;

const CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 1L4 19L8.5 14.5L12.5 22L15 21L11 13L17 13Z' fill='white' stroke='black' stroke-width='1.2' stroke-linejoin='round'/></svg>`;

const CURSOR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}`;

export function getCursorCSS(): string {
  return `
#dm-cursor {
  position: fixed;
  width: ${CURSOR_SIZE}px;
  height: ${CURSOR_SIZE}px;
  pointer-events: none;
  z-index: ${CURSOR_Z_INDEX};
  transform: translate(-4px, -2px);
  background-image: url("${CURSOR_DATA_URL}");
  background-size: contain;
  background-repeat: no-repeat;
  filter: drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.35));
  transition: transform 0.15s ease;
}

/* Focus ring to visually "select" targets before interacting */
#dm-focus-ring {
  position: fixed;
  left: 0;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
  z-index: ${CURSOR_Z_INDEX - 1};
  opacity: 0;
  border-radius: 12px;
  border: 2px solid rgba(50, 220, 255, 0.95);
  box-shadow:
    0 0 0 6px rgba(50, 220, 255, 0.18),
    0 12px 28px rgba(0, 0, 0, 0.25);
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  will-change: transform, opacity;
}

/* Spotlight overlay to strongly "select" targets (non-interactive). */
#dm-spotlight {
  position: fixed;
  left: 0;
  top: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
  z-index: ${CURSOR_Z_INDEX - 3};
  opacity: 0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.22);
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  will-change: transform, opacity;
}

/* Click ripple for extra "polish" */
.dm-ripple {
  position: fixed;
  left: 0;
  top: 0;
  width: 16px;
  height: 16px;
  pointer-events: none;
  z-index: ${CURSOR_Z_INDEX - 2};
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 4px rgba(50, 220, 255, 0.25);
  transform: translate(-50%, -50%) scale(0.2);
  opacity: 0.95;
  animation: dm-ripple 420ms ease-out forwards;
}

@keyframes dm-ripple {
  0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0.95; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
}
`.trim();
}

interface CursorMoveParams {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  durationMs: number;
}

export function getMoveCursorScript(params: CursorMoveParams): string {
  const { fromX, fromY, toX, toY, durationMs } = params;
  return `
(function() {
  var cursor = document.getElementById('dm-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'dm-cursor';
    document.body.appendChild(cursor);
  }
  var startX = ${fromX};
  var startY = ${fromY};
  var endX = ${toX};
  var endY = ${toY};
  var duration = ${durationMs};
  var start = performance.now();

  function ease(t) {
    var mt = 1 - t;
    return 3 * mt * mt * t * ${CONTROL_POINT_OFFSET}
         + 3 * mt * t * t * ${CONTROL_POINT_OFFSET_2}
         + t * t * t;
  }

  function animate(now) {
    var elapsed = now - start;
    var progress = Math.min(elapsed / duration, 1);
    var eased = ease(progress);
    var x = startX + (endX - startX) * eased;
    var y = startY + (endY - startY) * eased;
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  cursor.style.left = startX + 'px';
  cursor.style.top = startY + 'px';
  requestAnimationFrame(animate);
})();
`.trim();
}

export function getClickPulseScript(): string {
  return `
(function() {
  var cursor = document.getElementById('dm-cursor');
  if (!cursor) return;
  cursor.style.transform = 'translate(-4px, -2px) scale(0.7)';
  setTimeout(function() {
    cursor.style.transform = 'translate(-4px, -2px) scale(1)';
  }, 150);
})();
`.trim();
}
