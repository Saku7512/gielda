import { earningsBeatDropStrategy } from "./earningsBeatDrop";
import { insiderAccumulationStrategy } from "./insiderAccumulation";
import { overreactedDrawdownStrategy } from "./overreactedDrawdown";
import type { Strategy } from "./types";

// Strategia D (short squeeze) celowo nie jest tu dodana — do potwierdzenia
// z użytkownikiem po ocenie działania A-C.
export const ACTIVE_STRATEGIES: Strategy[] = [
  overreactedDrawdownStrategy,
  earningsBeatDropStrategy,
  insiderAccumulationStrategy,
];

export * from "./types";
