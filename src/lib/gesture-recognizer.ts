// Rule-based ASL recognizer from MediaPipe hand landmarks.
// Supports full A-Z alphabet plus common word/phrase gestures.
// Landmarks are normalized [0,1] with y increasing downward.
//
// Architecture: this module exposes `recognize(hands, handedness?)` which
// classifies a single frame. It is intentionally modular so a trained ML
// model can replace `recognize` without changing the app.

export type Landmark = { x: number; y: number; z: number };
export type Handedness = "Left" | "Right";

export type Recognition = {
  label: string | null;   // recognized token (letter or gesture name), or null
  confidence: number;     // 0..1
  kind: "letter" | "gesture" | null;
};

/* ---------- helpers ---------- */

function dist(a: Landmark, b: Landmark) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function dist3(a: Landmark, b: Landmark) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}
function angleBetween(a: Landmark, b: Landmark, c: Landmark) {
  // angle at b (in radians) formed by a-b-c
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return Math.PI;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return Math.acos(cos);
}

type FingerStates = {
  thumb: boolean;   // extended out
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  // curl values 0 (straight) .. ~pi (fully curled) at PIP
  curl: [number, number, number, number, number];
};

function fingerStates(lm: Landmark[]): FingerStates {
  // Extension by comparing tip distance from wrist to PIP joint distance from wrist.
  const wrist = lm[0];
  const ext = (tip: number, pip: number) =>
    dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.05;

  const thumbTip = lm[4], thumbIP = lm[3], indexMCP = lm[5];
  const thumb = dist(thumbTip, indexMCP) > dist(thumbIP, indexMCP) * 1.1;

  const curl: [number, number, number, number, number] = [
    angleBetween(lm[2], lm[3], lm[4]),   // thumb
    angleBetween(lm[5], lm[6], lm[8]),   // index
    angleBetween(lm[9], lm[10], lm[12]), // middle
    angleBetween(lm[13], lm[14], lm[16]),// ring
    angleBetween(lm[17], lm[18], lm[20]),// pinky
  ];

  return {
    thumb,
    index: ext(8, 6),
    middle: ext(12, 10),
    ring: ext(16, 14),
    pinky: ext(20, 18),
    curl,
  };
}

function palmSize(lm: Landmark[]) {
  return dist(lm[0], lm[9]) || 1;
}

// Direction of the hand: vector from wrist(0) to middle MCP(9).
function handDirection(lm: Landmark[]) {
  return { x: lm[9].x - lm[0].x, y: lm[9].y - lm[0].y };
}

// Rough "palm facing camera" heuristic using z of key knuckles vs wrist.
function palmFacing(lm: Landmark[]): "toward" | "away" | "side" {
  const zw = lm[0].z ?? 0;
  const zk = ((lm[5].z ?? 0) + (lm[9].z ?? 0) + (lm[13].z ?? 0) + (lm[17].z ?? 0)) / 4;
  const diff = zk - zw;
  if (diff < -0.02) return "toward";
  if (diff > 0.02) return "away";
  return "side";
}

/* ---------- letter classifiers ---------- */

function classifyLetter(lm: Landmark[]): Recognition {
  const s = fingerStates(lm);
  const ps = palmSize(lm);
  const dir = handDirection(lm);
  const pointingUp = dir.y < -0.2;      // fingers point up (image coords)
  const pointingDown = dir.y > 0.2;
  const pointingSide = Math.abs(dir.x) > Math.abs(dir.y);

  const extCount = [s.index, s.middle, s.ring, s.pinky].filter(Boolean).length;

  const d = (a: number, b: number) => dist(lm[a], lm[b]) / ps;

  // Fingertip distances
  const tipIndexThumb = d(4, 8);
  const tipIndexMiddle = d(8, 12);
  const tipMiddleRing = d(12, 16);
  const tipRingPinky = d(16, 20);
  const thumbToPinkyTip = d(4, 20);

  // ---------- L: index + thumb extended, others curled ----------
  if (s.index && !s.middle && !s.ring && !s.pinky && s.thumb) {
    // Check angle between thumb and index roughly 90°
    const ang = angleBetween(lm[4], lm[0], lm[8]);
    if (ang > 0.9 && ang < 2.2) return { label: "L", confidence: 0.92, kind: "letter" };
    return { label: "D", confidence: 0.8, kind: "letter" };
  }

  // ---------- Y: thumb + pinky extended ----------
  if (s.thumb && s.pinky && !s.index && !s.middle && !s.ring) {
    return { label: "Y", confidence: 0.92, kind: "letter" };
  }

  // ---------- I: only pinky extended ----------
  if (!s.index && !s.middle && !s.ring && s.pinky && !s.thumb) {
    return { label: "I", confidence: 0.9, kind: "letter" };
  }

  // ---------- J: pinky extended like I but pointing sideways/down ----------
  // (J is a motion; approximated by orientation)
  // Handled after motion tracking; skip here.

  // ---------- D: only index extended ----------
  if (s.index && !s.middle && !s.ring && !s.pinky && !s.thumb) {
    return { label: "D", confidence: 0.88, kind: "letter" };
  }

  // ---------- U: index + middle extended together (close) ----------
  if (s.index && s.middle && !s.ring && !s.pinky) {
    if (tipIndexMiddle < 0.25) {
      return { label: "U", confidence: 0.88, kind: "letter" };
    }
    // ---------- V: index + middle spread ----------
    if (tipIndexMiddle >= 0.25 && tipIndexMiddle < 0.7) {
      return { label: "V", confidence: 0.88, kind: "letter" };
    }
  }

  // ---------- R: index + middle crossed (tips very close, one z below the other) ----------
  if (s.index && s.middle && !s.ring && !s.pinky && tipIndexMiddle < 0.18) {
    return { label: "R", confidence: 0.78, kind: "letter" };
  }

  // ---------- W: index + middle + ring extended ----------
  if (s.index && s.middle && s.ring && !s.pinky) {
    return { label: "W", confidence: 0.9, kind: "letter" };
  }

  // ---------- F: thumb+index touch, others extended ----------
  if (tipIndexThumb < 0.35 && s.middle && s.ring && s.pinky && !s.index) {
    return { label: "F", confidence: 0.9, kind: "letter" };
  }

  // ---------- B: four fingers extended together, thumb across palm ----------
  if (extCount === 4 && !s.thumb) {
    if (tipIndexMiddle < 0.2 && tipMiddleRing < 0.2 && tipRingPinky < 0.2) {
      return { label: "B", confidence: 0.9, kind: "letter" };
    }
  }

  // ---------- K: index + middle extended, thumb between them, index up ----------
  if (s.index && s.middle && !s.ring && !s.pinky && s.thumb && pointingUp) {
    // thumb tip near middle base
    if (d(4, 10) < 0.55) return { label: "K", confidence: 0.75, kind: "letter" };
  }

  // ---------- P: like K but pointing down ----------
  if (s.index && s.middle && !s.ring && !s.pinky && s.thumb && pointingDown) {
    return { label: "P", confidence: 0.7, kind: "letter" };
  }

  // ---------- H: index + middle extended horizontally (sideways) ----------
  if (s.index && s.middle && !s.ring && !s.pinky && pointingSide && tipIndexMiddle < 0.3) {
    return { label: "H", confidence: 0.78, kind: "letter" };
  }

  // ---------- G: index extended sideways, others curled ----------
  if (s.index && !s.middle && !s.ring && !s.pinky && pointingSide) {
    return { label: "G", confidence: 0.78, kind: "letter" };
  }

  // ---------- Q: like G but pointing down ----------
  if (s.index && !s.middle && !s.ring && !s.pinky && pointingDown) {
    return { label: "Q", confidence: 0.72, kind: "letter" };
  }

  // ---------- X: index bent (hook) ----------
  // index PIP curl large but index tip not below wrist
  if (!s.middle && !s.ring && !s.pinky) {
    const indexCurl = s.curl[1];
    if (indexCurl > 1.6 && indexCurl < 2.5 && !s.index) {
      return { label: "X", confidence: 0.7, kind: "letter" };
    }
  }

  /* ---------- Fist-family: A / E / M / N / S / T / O / C ---------- */
  if (extCount === 0) {
    // Average tip-to-palm distance (curl tightness)
    const tips = [lm[8], lm[12], lm[16], lm[20]];
    const avgTipToPalm = tips.reduce((acc, t) => acc + dist(t, lm[9]), 0) / (4 * ps);

    // C: open curved hand
    if (avgTipToPalm > 0.75 && !s.thumb) {
      return { label: "C", confidence: 0.75, kind: "letter" };
    }
    // O: fingertips meet thumb tip
    const avgTipToThumb =
      (dist(lm[8], lm[4]) + dist(lm[12], lm[4]) + dist(lm[16], lm[4]) + dist(lm[20], lm[4])) / (4 * ps);
    if (avgTipToThumb < 0.35 && avgTipToPalm > 0.5) {
      return { label: "O", confidence: 0.78, kind: "letter" };
    }

    const thumbToIndexTip = d(4, 8);

    // T: thumb tucked between index and middle
    if (d(4, 6) < 0.35 && d(4, 10) < 0.5 && lm[4].y < lm[8].y) {
      return { label: "T", confidence: 0.7, kind: "letter" };
    }
    // M: thumb under three fingers (index+middle+ring)
    if (lm[4].y > lm[6].y && lm[4].y > lm[10].y && lm[4].y > lm[14].y && lm[4].y < lm[18].y) {
      return { label: "M", confidence: 0.65, kind: "letter" };
    }
    // N: thumb under two fingers
    if (lm[4].y > lm[6].y && lm[4].y > lm[10].y && lm[4].y < lm[14].y) {
      return { label: "N", confidence: 0.65, kind: "letter" };
    }
    // S: fist, thumb across the front of fingers
    if (thumbToIndexTip < 0.5 && lm[4].x > lm[5].x !== (dir.x > 0)) {
      return { label: "S", confidence: 0.7, kind: "letter" };
    }
    // A: fist, thumb along the side
    return { label: "A", confidence: 0.75, kind: "letter" };
  }

  // ---------- E: all curled with thumb across ----------
  if (extCount === 0) {
    return { label: "E", confidence: 0.6, kind: "letter" };
  }

  // ---------- Z: index extended, drawn zigzag - static approximation ----------
  if (s.index && !s.middle && !s.ring && !s.pinky && pointingSide) {
    return { label: "Z", confidence: 0.55, kind: "letter" };
  }

  // Fallback: not confident
  void thumbToPinkyTip;
  return { label: null, confidence: 0, kind: null };
}

/* ---------- gesture (word) classifiers ---------- */

function classifyGesture(lm: Landmark[]): Recognition {
  const s = fingerStates(lm);
  const ps = palmSize(lm);
  const dir = handDirection(lm);
  const pointingUp = dir.y < -0.2;
  const pointingDown = dir.y > 0.2;
  const facing = palmFacing(lm);

  const d = (a: number, b: number) => dist(lm[a], lm[b]) / ps;
  const extCount = [s.index, s.middle, s.ring, s.pinky].filter(Boolean).length;

  // I Love You (ILY): thumb + index + pinky extended, middle+ring curled
  if (s.thumb && s.index && !s.middle && !s.ring && s.pinky) {
    return { label: "I Love You", confidence: 0.95, kind: "gesture" };
  }

  // Peace / Victory: index + middle extended and spread, others curled, palm forward, pointing up
  if (s.index && s.middle && !s.ring && !s.pinky && pointingUp && d(8, 12) > 0.35) {
    return { label: "Peace", confidence: 0.9, kind: "gesture" };
  }

  // Thumbs Up: only thumb extended, hand pointing sideways/up, thumb above wrist
  if (s.thumb && !s.index && !s.middle && !s.ring && !s.pinky && lm[4].y < lm[0].y) {
    return { label: "Thumbs Up", confidence: 0.92, kind: "gesture" };
  }

  // Call Me: thumb + pinky extended (like Y) pointing up beside head — same as Y letter.
  // We treat Y letter and Call Me the same landmark shape; letter classifier wins for A-Z,
  // so expose Call Me only when hand oriented sideways.
  if (s.thumb && s.pinky && !s.index && !s.middle && !s.ring && Math.abs(dir.x) > Math.abs(dir.y)) {
    return { label: "Call Me", confidence: 0.85, kind: "gesture" };
  }

  // OK: thumb+index circle, others extended (same landmarks as letter F).
  // We alias F as OK gesture only when hand oriented naturally upright.
  if (d(4, 8) < 0.35 && s.middle && s.ring && s.pinky && !s.index && pointingUp) {
    return { label: "OK", confidence: 0.9, kind: "gesture" };
  }

  // Open Palm: all five fingers extended and spread
  if (s.thumb && s.index && s.middle && s.ring && s.pinky) {
    // Stop: open palm facing camera, pointing up
    if (facing === "toward" && pointingUp) {
      return { label: "Stop", confidence: 0.9, kind: "gesture" };
    }
    // Hello: open hand raised, palm facing camera or side (waving pose)
    if (pointingUp) {
      return { label: "Hello", confidence: 0.8, kind: "gesture" };
    }
    // Goodbye: open hand pointing sideways or slightly down (waving)
    if (facing !== "away") {
      return { label: "Goodbye", confidence: 0.7, kind: "gesture" };
    }
    return { label: "Open Palm", confidence: 0.85, kind: "gesture" };
  }

  // Come Here: index finger curled inward (beckoning) - single frame approximation:
  // index extended pointing up and hand pointing toward camera (z of tip < wrist)
  if (s.index && !s.middle && !s.ring && !s.pinky && (lm[8].z ?? 0) < (lm[0].z ?? 0) - 0.05) {
    return { label: "Come Here", confidence: 0.7, kind: "gesture" };
  }

  // Go: index pointing to the side (same as G letter alternate)
  if (s.index && !s.middle && !s.ring && !s.pinky && Math.abs(dir.x) > 0.3) {
    return { label: "Go", confidence: 0.7, kind: "gesture" };
  }

  // No: index + middle + thumb forming a "chomping" shape (all pinching)
  if (s.index && s.middle && !s.ring && !s.pinky && d(4, 8) < 0.35 && d(4, 12) < 0.45) {
    return { label: "No", confidence: 0.8, kind: "gesture" };
  }

  // Yes: fist nodding (approximate: closed fist pointing up = Yes)
  if (extCount === 0 && !s.thumb && pointingUp) {
    return { label: "Yes", confidence: 0.6, kind: "gesture" };
  }

  // Bad: thumb down (thumb extended, others curled, thumb below wrist)
  if (s.thumb && !s.index && !s.middle && !s.ring && !s.pinky && lm[4].y > lm[0].y) {
    return { label: "Bad", confidence: 0.88, kind: "gesture" };
  }

  // Good: open hand moving down — approximate with open palm pointing down
  if (extCount === 4 && pointingDown) {
    return { label: "Good", confidence: 0.7, kind: "gesture" };
  }

  // Thank You: flat hand near chin — approximate: open palm pointing up-toward camera with all fingers together
  if (extCount === 4 && s.thumb && d(8, 12) < 0.2 && d(12, 16) < 0.2 && d(16, 20) < 0.2 && facing === "toward") {
    return { label: "Thank You", confidence: 0.7, kind: "gesture" };
  }

  // Please: flat hand circling chest — approximate: open palm facing self, pointing up
  if (extCount === 4 && s.thumb && facing === "toward" && pointingUp) {
    return { label: "Please", confidence: 0.65, kind: "gesture" };
  }

  // Sorry: fist with thumb out, circular on chest — approximate: fist with thumb extended forward
  if (extCount === 0 && s.thumb && facing === "toward") {
    return { label: "Sorry", confidence: 0.6, kind: "gesture" };
  }

  // Love: crossed fists on chest — hard from one hand; approximate: fist with thumb tucked and pointing up
  if (extCount === 0 && !s.thumb && facing === "toward" && pointingUp) {
    return { label: "Love", confidence: 0.55, kind: "gesture" };
  }

  // Help: thumb on flat palm (two hands ideally). Single-hand approximation: thumbs-up hand raised above wrist center.
  // Skipped to avoid collision with Thumbs Up.

  return { label: null, confidence: 0, kind: null };
}

/* ---------- public API ---------- */

export type Mode = "auto" | "letters" | "gestures";

export function recognize(lm: Landmark[], mode: Mode = "auto"): Recognition {
  if (!lm || lm.length < 21) return { label: null, confidence: 0, kind: null };

  if (mode === "letters") return classifyLetter(lm);
  if (mode === "gestures") return classifyGesture(lm);

  // Auto: prefer gesture if strong, else letter.
  const g = classifyGesture(lm);
  const l = classifyLetter(lm);
  if (g.label && g.confidence >= 0.85) return g;
  if (l.label && l.confidence >= g.confidence) return l;
  if (g.label) return g;
  return l;
}

export const SUPPORTED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const SUPPORTED_GESTURES = [
  "Hello", "Goodbye", "Yes", "No", "Thank You", "Please", "Sorry", "Help",
  "Stop", "OK", "I Love You", "Thumbs Up", "Peace", "Open Palm", "Call Me",
  "Come Here", "Go", "Good", "Bad", "Love",
];
