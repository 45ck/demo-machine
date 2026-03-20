import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

/**
 * Injects a MutationObserver before each action and reads the mutation count
 * afterwards.  Filters out `dm-*` overlay elements so demo-machine's own
 * cursor / spotlight / ripple effects do not count as app mutations.
 */
export class DomMutationDetector implements ChangeDetector {
  readonly name = "dom-mutation";

  async before(page: PlaywrightPage): Promise<void> {
    await page.evaluate((() => {
      const w = window as unknown as Record<string, unknown>;
      // Disconnect any stale observer from a previous step.
      if (typeof (w["__dm_observer"] as { disconnect?: () => void })?.disconnect === "function") {
        (w["__dm_observer"] as { disconnect: () => void }).disconnect();
      }

      let count = 0;
      const counts = { childList: 0, attributes: 0, characterData: 0 };

      const isDmNode = (node: Node): boolean => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const el = node as Element;
        const id = el.id ?? "";
        return id.startsWith("dm-") || (el.classList?.contains?.("dm-overlay") ?? false);
      };

      const hasNonDmNode = (nodes: NodeList): boolean => {
        for (const n of nodes) {
          if (!isDmNode(n)) return true;
        }
        return false;
      };

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (isDmNode(m.target)) continue;
          if (m.target.parentElement && isDmNode(m.target.parentElement)) continue;
          if (
            m.type === "childList" &&
            !hasNonDmNode(m.addedNodes) &&
            !hasNonDmNode(m.removedNodes)
          ) {
            continue;
          }
          count++;
          const key = m.type as keyof typeof counts;
          if (key in counts) counts[key]++;
        }
      });

      observer.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
      });

      w["__dm_observer"] = observer;
      w["__dm_mutation_count"] = () => ({ count, ...counts });
    }) as (...args: unknown[]) => unknown);
  }

  async after(page: PlaywrightPage, _step: Step): Promise<DetectorSignal> {
    const result = (await page.evaluate((() => {
      const w = window as unknown as Record<string, unknown>;
      const observer = w["__dm_observer"] as { disconnect: () => void } | undefined;
      observer?.disconnect();
      const getter = w["__dm_mutation_count"] as
        | (() => { count: number; childList: number; attributes: number; characterData: number })
        | undefined;
      const stats = getter?.() ?? { count: 0, childList: 0, attributes: 0, characterData: 0 };
      delete w["__dm_observer"];
      delete w["__dm_mutation_count"];
      return stats;
    }) as (...args: unknown[]) => unknown)) as {
      count: number;
      childList: number;
      attributes: number;
      characterData: number;
    };

    const parts: string[] = [];
    if (result.childList > 0) parts.push(`${String(result.childList)} childList`);
    if (result.attributes > 0) parts.push(`${String(result.attributes)} attributes`);
    if (result.characterData > 0) parts.push(`${String(result.characterData)} characterData`);

    return {
      detector: this.name,
      changesDetected: result.count > 0,
      confidence: Math.min(1, result.count / 3),
      details:
        result.count > 0
          ? `${String(result.count)} DOM mutations (${parts.join(", ")})`
          : "no DOM mutations observed",
    };
  }
}
