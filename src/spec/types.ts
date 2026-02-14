import type { z } from "zod";
import type { demoSpecSchema } from "./schema.js";

export type DemoSpec = z.infer<typeof demoSpecSchema>;
export type Chapter = DemoSpec["chapters"][number];
export type Step = Chapter["steps"][number];
export type Meta = DemoSpec["meta"];
export type RunnerConfig = NonNullable<DemoSpec["runner"]>;
export type Resolution = Meta["resolution"];
export type Branding = NonNullable<Meta["branding"]>;
export type Pacing = DemoSpec["pacing"];
