import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionHandlers } from "../src/playback/actions.js";
import { stepSchema, preStepSchema } from "../src/spec/step-schema.js";
import { KNOWN_ACTIONS } from "../src/validation/checks/spec-steps.js";

interface VerificationInventory {
  actions: Array<{ id: string }>;
  preSteps: Array<{ id: string }>;
  targetStrategies: Array<{ id: string }>;
}

function inventory(): VerificationInventory {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs", "verification-inventory.json"), "utf8"),
  ) as VerificationInventory;
}

function minimalStepForAction(action: string): Record<string, unknown> {
  switch (action) {
    case "navigate":
      return { action, url: "/" };
    case "click":
    case "hover":
    case "check":
    case "uncheck":
    case "selectFirstNonPlaceholder":
      return { action, selector: "#target" };
    case "clickFirstVisible":
      return { action, selector: "#target" };
    case "type":
      return { action, selector: "#target", text: "hello" };
    case "scroll":
      return { action, selector: "#target", y: 100 };
    case "wait":
      return { action, timeout: 100 };
    case "waitForLocalDirectoryStable":
      return { action, path: "./generated", stableMs: 1000 };
    case "waitForLocalFile":
      return { action, path: "./generated.txt" };
    case "waitForPageFunction":
      return { action, expression: "document.body.innerText.includes('Ready')" };
    case "evaluate":
      return { action, expression: "document.body.dataset.ready = String(arg)", arg: "true" };
    case "runCommand":
      return { action, command: "node --version" };
    case "assert":
      return { action, selector: "#target", visible: true };
    case "screenshot":
      return { action, name: "proof" };
    case "press":
      return { action, key: "Enter" };
    case "back":
    case "forward":
      return { action };
    case "select":
      return { action, selector: "#target", option: { label: "Pro" } };
    case "upload":
      return { action, selector: "#target", file: "./sample.txt" };
    case "dragAndDrop":
      return { action, from: { selector: "#from" }, to: { selector: "#to" } };
    default:
      throw new Error(`No minimal step fixture for action "${action}"`);
  }
}

function targetForStrategy(strategy: string): Record<string, unknown> {
  switch (strategy) {
    case "css":
      return { selector: "#target" };
    case "text":
      return { target: { by: "text", text: "Save" } };
    case "role":
      return { target: { by: "role", role: "button", name: "Save" } };
    case "testId":
      return { target: { by: "testId", testId: "save-button" } };
    case "label":
      return { target: { by: "label", text: "Email" } };
    case "placeholder":
      return { target: { by: "placeholder", text: "Search" } };
    case "altText":
      return { target: { by: "altText", text: "Logo" } };
    case "title":
      return { target: { by: "title", text: "Help" } };
    default:
      throw new Error(`No target fixture for strategy "${strategy}"`);
  }
}

const TARGET_COMPATIBLE_ACTIONS = [
  "click",
  "type",
  "hover",
  "scroll",
  "assert",
  "check",
  "uncheck",
  "select",
  "selectFirstNonPlaceholder",
  "upload",
] as const;

function targetCompatibleStep(
  action: (typeof TARGET_COMPATIBLE_ACTIONS)[number],
  targetInput: Record<string, unknown>,
): Record<string, unknown> {
  const base = { action, ...targetInput };
  switch (action) {
    case "type":
      return { ...base, text: "hello" };
    case "assert":
      return { ...base, visible: true };
    case "select":
      return { ...base, option: { label: "Pro" } };
    case "upload":
      return { ...base, file: "./sample.txt" };
    default:
      return base;
  }
}

describe("verification surface", () => {
  it("keeps runtime handlers, preflight known actions, schema fixtures, and inventory aligned", () => {
    const inv = inventory();
    const handlerActions = Object.keys(actionHandlers).sort();
    const knownActions = [...KNOWN_ACTIONS].sort();
    const inventoryActions = inv.actions.map((entry) => entry.id).sort();

    expect(handlerActions).toEqual(knownActions);
    expect(inventoryActions).toEqual(knownActions);

    for (const action of knownActions) {
      expect(stepSchema.safeParse(minimalStepForAction(action)).success).toBe(true);
    }
  });

  it("proves every inventory target strategy is accepted by the schema", () => {
    for (const { id } of inventory().targetStrategies) {
      const result = stepSchema.safeParse({
        action: "click",
        ...targetForStrategy(id),
      });
      expect(result.success).toBe(true);
    }
  });

  it("proves every target-compatible action accepts every target strategy", () => {
    for (const action of TARGET_COMPATIBLE_ACTIONS) {
      for (const { id } of inventory().targetStrategies) {
        const result = stepSchema.safeParse(targetCompatibleStep(action, targetForStrategy(id)));
        expect(result.success, `${action} should accept ${id} target`).toBe(true);
      }
    }
  });

  it("proves dragAndDrop accepts every target strategy on both endpoints", () => {
    for (const { id } of inventory().targetStrategies) {
      const fromTarget = targetForStrategy(id);
      const toTarget = targetForStrategy(id);
      const result = stepSchema.safeParse({
        action: "dragAndDrop",
        from: fromTarget.selector ? { selector: fromTarget.selector } : fromTarget,
        to: toTarget.selector ? { selector: toTarget.selector } : toTarget,
      });
      expect(result.success, `dragAndDrop should accept ${id} targets`).toBe(true);
    }
  });

  it("proves every inventory preStep action is accepted by the schema", () => {
    const fixtures: Record<string, Record<string, unknown>> = {
      httpRequest: { action: "httpRequest", method: "GET", url: "https://example.com/health" },
      setCookie: { action: "setCookie", name: "session", value: "abc" },
      setLocalStorage: { action: "setLocalStorage", key: "token", value: "abc" },
    };

    for (const { id } of inventory().preSteps) {
      const fixture = fixtures[id];
      expect(fixture, `Missing preStep fixture for ${id}`).toBeDefined();
      expect(preStepSchema.safeParse(fixture).success).toBe(true);
    }
  });
});
