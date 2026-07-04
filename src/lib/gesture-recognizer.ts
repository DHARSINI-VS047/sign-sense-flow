// Rule-based ASL A-F recognizer from MediaPipe hand landmarks.
// Landmarks are normalized [0,1] with y increasing downward.

export type Landmark = { x: number; y: number; z: number };

type FingerState = {
  thumbExtended: boolean;
  indexExtended: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
};

function dist(a: Landmark, b: Landmark) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function fingerStates(lm: Landmark[]): FingerState {
  // A finger is "extended" if its tip is significantly farther from wrist than PIP joint.
  const wrist = lm[0];
  const extended = (tip: number, pip: number) => dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.08;
  // Thumb: check horizontal distance vs MCP (index MCP) for extension across palm.
  const thumbTip = lm[4], thumbIP = lm[3], indexMCP = lm[5];
  const thumbExtended = dist(thumbTip, indexMCP) > dist(thumbIP, indexMCP) * 1.15;
  return {
    thumbExtended,
    indexExtended: extended(8, 6),
    middleExtended: extended(12, 10),
    ringExtended: extended(16, 14),
    pinkyExtended: extended(20, 18),
  };
}

export type Recognition = { letter: string | null; confidence: number };

export function recognize(lm: Landmark[]): Recognition {
  if (!lm || lm.length < 21) return { letter: null, confidence: 0 };
  const s = fingerStates(lm);
  const fingers = [s.indexExtended, s.middleExtended, s.ringExtended, s.pinkyExtended];
  const extCount = fingers.filter(Boolean).length;

  // Reference scale: wrist to middle MCP
  const palmSize = dist(lm[0], lm[9]) || 1;
  const thumbIndexTipDist = dist(lm[4], lm[8]) / palmSize;

  // F: thumb + index form circle (tips close), middle/ring/pinky extended
  if (thumbIndexTipDist < 0.35 && s.middleExtended && s.ringExtended && s.pinkyExtended && !s.indexExtended) {
    return { letter: "F", confidence: 0.9 };
  }

  // B: all four fingers extended, thumb tucked (not extended out)
  if (extCount === 4 && !s.thumbExtended) {
    return { letter: "B", confidence: 0.92 };
  }

  // D: only index extended
  if (s.indexExtended && !s.middleExtended && !s.ringExtended && !s.pinkyExtended) {
    return { letter: "D", confidence: 0.88 };
  }

  // A vs E vs C: all four curled
  if (extCount === 0) {
    // Distance from fingertips to palm center (avg tip-to-wrist normalized)
    const tips = [lm[8], lm[12], lm[16], lm[20]];
    const avgTipToPalm = tips.reduce((acc, t) => acc + dist(t, lm[9]), 0) / (4 * palmSize);
    // Thumb position vs index tip
    const thumbToIndexTip = dist(lm[4], lm[8]) / palmSize;

    if (avgTipToPalm > 0.75) {
      // Fingers curled but not tight -> C (curved hand)
      return { letter: "C", confidence: 0.75 };
    }
    if (thumbToIndexTip < 0.45) {
      // Thumb tucked in front of fingers -> E
      return { letter: "E", confidence: 0.78 };
    }
    // Fist with thumb on the side -> A
    return { letter: "A", confidence: 0.85 };
  }

  return { letter: null, confidence: 0 };
}

export const SUPPORTED_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
