import type { ActionHandler } from "./action-core.js";
import { handleAssert } from "./handlers/assert.js";
import { handleClick } from "./handlers/click.js";
import { handleDragAndDrop } from "./handlers/drag-and-drop.js";
import { handleCheck, handleSelect, handleUncheck, handleUpload } from "./handlers/forms.js";
import { handleBack, handleForward } from "./handlers/history.js";
import { handleHover } from "./handlers/hover.js";
import { handleNavigate } from "./handlers/navigate.js";
import { handlePress } from "./handlers/press.js";
import { handleScroll } from "./handlers/scroll.js";
import { handleScreenshot } from "./handlers/screenshot.js";
import { handleType } from "./handlers/type.js";
import { handleWait } from "./handlers/wait.js";

export type { PlaywrightPage } from "./playwright.js";
export type { PlaybackContext } from "./action-core.js";

export const actionHandlers: Record<string, ActionHandler> = {
  navigate: handleNavigate,
  click: handleClick,
  type: handleType,
  hover: handleHover,
  scroll: handleScroll,
  wait: handleWait,
  assert: handleAssert,
  screenshot: handleScreenshot,
  press: handlePress,
  back: handleBack,
  forward: handleForward,
  check: handleCheck,
  uncheck: handleUncheck,
  select: handleSelect,
  upload: handleUpload,
  dragAndDrop: handleDragAndDrop,
};
