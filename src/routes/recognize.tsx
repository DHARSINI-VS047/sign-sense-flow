import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera, CameraOff, Copy, Download, Eraser, History, Play, Square,
  Settings2, AlertCircle, Loader2, Delete, Space, Undo2, BookOpen,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  recognize, SUPPORTED_LETTERS, SUPPORTED_GESTURES,
  type Landmark, type Mode, type Recognition,
} from "@/lib/gesture-recognizer";

export const Route = createFileRoute("/recognize")({
  head: () => ({
    meta: [
      { title: "Recognize — SignBridge" },
      { name: "description", content: "Live ASL gesture recognition using your webcam." },
      { property: "og:title", content: "SignBridge Recognizer" },
      { property: "og:description", content: "Real-time ASL to text in your browser." },
    ],
  }),
  component: RecognizePage,
});

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

type HistoryItem = { label: string; kind: "letter" | "gesture"; confidence: number; at: number; committedText: string };

// Frames a gesture must be stable before it commits (~250ms at 30fps)
const STABLE_FRAMES = 7;
// Cooldown after a commit (ms) before the same label can commit again
const COOLDOWN_MS = 900;

function RecognizePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading-model" | "requesting" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [current, setCurrent] = useState<Recognition>({ label: null, confidence: 0, kind: null });
  const [threshold, setThreshold] = useState(0.7);
  const [mode, setMode] = useState<Mode>("auto");
  const [text, setText] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Refs for temporal smoothing + cooldown
  const stableRef = useRef<{ label: string | null; count: number }>({ label: null, count: 0 });
  const lastCommitRef = useRef<{ label: string | null; at: number }>({ label: null, at: 0 });

  const thresholdRef = useRef(threshold);
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Enumerate cameras
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const cams = devs.filter((d) => d.kind === "videoinput");
      setCameras(cams);
      if (cams[0] && !selectedCam) setSelectedCam(cams[0].deviceId);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEverything = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const w = video.videoWidth, h = video.videoHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      let results: any;
      try {
        results = landmarker.detectForVideo(video, performance.now());
      } catch {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const hand: Landmark[] | undefined = results?.landmarks?.[0];
      if (hand && hand.length) {
        setHandDetected(true);
        ctx.strokeStyle = "rgba(139, 92, 246, 0.9)";
        ctx.lineWidth = Math.max(2, w * 0.003);
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = hand[a], pb = hand[b];
          ctx.moveTo(pa.x * w, pa.y * h);
          ctx.lineTo(pb.x * w, pb.y * h);
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(236, 72, 153, 1)";
        for (const p of hand) {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, Math.max(3, w * 0.005), 0, Math.PI * 2);
          ctx.fill();
        }

        const rec = recognize(hand, modeRef.current);
        setCurrent(rec);

        const st = stableRef.current;
        const now = performance.now();
        if (rec.label && rec.confidence >= thresholdRef.current) {
          if (st.label === rec.label) {
            st.count += 1;
          } else {
            st.label = rec.label;
            st.count = 1;
          }
          if (st.count === STABLE_FRAMES) {
            const last = lastCommitRef.current;
            const cooled = last.label !== rec.label || now - last.at > COOLDOWN_MS;
            if (cooled) {
              lastCommitRef.current = { label: rec.label, at: now };
              const committed = rec.kind === "letter" ? rec.label : ` ${rec.label} `;
              const label = rec.label;
              const confidence = rec.confidence;
              const kind = rec.kind ?? "gesture";
              setText((prev) => (prev + committed).replace(/ +/g, " "));
              setHistory((prev) => [
                { label, kind, confidence, at: Date.now(), committedText: committed },
                ...prev,
              ].slice(0, 100));
            }
          }
        } else {
          st.label = rec.label;
          st.count = 0;
        }
      } else {
        setHandDetected(false);
        setCurrent({ label: null, confidence: 0, kind: null });
        stableRef.current = { label: null, count: 0 };
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (typeof window === "undefined") return;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support webcam access.");
      }

      setStatus("loading-model");
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      landmarkerRef.current = landmarker;

      setStatus("requesting");
      const constraints: MediaStreamConstraints = {
        video: selectedCam
          ? { deviceId: { exact: selectedCam }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element not ready.");
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        const handler = () => { video.removeEventListener("loadeddata", handler); resolve(); };
        video.addEventListener("loadeddata", handler);
      });
      await video.play();

      navigator.mediaDevices.enumerateDevices().then((devs) => {
        setCameras(devs.filter((d) => d.kind === "videoinput"));
      });

      setStatus("running");
      loop();
    } catch (e: any) {
      console.error(e);
      const msg = e?.name === "NotAllowedError"
        ? "Camera permission was denied. Please allow camera access in your browser settings."
        : e?.name === "NotFoundError"
        ? "No webcam was found on this device."
        : e?.message || "Failed to start the recognizer.";
      setError(msg);
      setStatus("error");
      stopEverything();
      toast.error(msg);
    }
  }, [selectedCam, stopEverything, loop]);

  const stop = useCallback(() => {
    stopEverything();
    setStatus("idle");
    setHandDetected(false);
    setCurrent({ label: null, confidence: 0, kind: null });
  }, [stopEverything]);

  const running = status === "running";
  const busy = status === "loading-model" || status === "requesting";

  const onCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Text copied to clipboard");
  };
  const onDownload = () => {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signbridge-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded transcript");
  };
  const onUndo = () => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const [last, ...rest] = prev;
      setText((t) => (t.endsWith(last.committedText) ? t.slice(0, -last.committedText.length) : t.slice(0, -1)));
      return rest;
    });
  };

  const statusLabel = useMemo(() => {
    switch (status) {
      case "loading-model": return "Loading model…";
      case "requesting": return "Requesting camera…";
      case "running": return handDetected ? "Hand detected" : "Waiting for hand";
      case "error": return "Error";
      default: return "Idle";
    }
  }, [status, handDetected]);

  const displayLabel = current.label ?? (handDetected ? "Gesture Not Recognized" : "—");
  const belowThreshold = current.label && current.confidence < threshold;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Live Recognizer</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A–Z alphabet plus common ASL gestures. Hold each sign briefly to add it.
            </p>
          </div>
          <StatusBadge status={status} handDetected={handDetected} label={statusLabel} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Video pane */}
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-black shadow-elegant aspect-video">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full scale-x-[-1] pointer-events-none"
              />

              {!running && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-hero/60 backdrop-blur-sm">
                  <div className="text-center max-w-sm px-6">
                    {busy ? (
                      <>
                        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-foreground" />
                        <p className="mt-4 text-primary-foreground font-medium">{statusLabel}</p>
                      </>
                    ) : status === "error" ? (
                      <>
                        <AlertCircle className="mx-auto h-10 w-10 text-destructive-foreground" />
                        <p className="mt-4 text-primary-foreground font-medium">{error}</p>
                        <Button onClick={start} className="mt-4" variant="secondary">Try again</Button>
                      </>
                    ) : (
                      <>
                        <Camera className="mx-auto h-12 w-12 text-primary-foreground" />
                        <p className="mt-4 text-primary-foreground font-medium">Camera is off</p>
                        <p className="mt-1 text-sm text-primary-foreground/80">Click start to begin recognizing signs.</p>
                        <Button onClick={start} className="mt-4" variant="secondary">
                          <Play className="mr-1 h-4 w-4" /> Start
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {running && (
                <>
                  <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 backdrop-blur">
                    <span className={`h-2 w-2 rounded-full ${handDetected ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                    <span className="text-xs font-medium">{statusLabel}</span>
                  </div>
                  <div className="absolute bottom-4 right-4 rounded-2xl bg-background/85 px-4 py-3 backdrop-blur shadow-card min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Current {current.kind ?? "gesture"}
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className={`font-display font-bold ${current.label ? "text-gradient text-3xl" : "text-muted-foreground text-lg"}`}>
                        {displayLabel}
                      </span>
                      {current.label && (
                        <span className={`text-sm ${belowThreshold ? "text-destructive" : "text-muted-foreground"}`}>
                          {Math.round(current.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Button onClick={stop} variant="destructive">
                  <Square className="mr-1 h-4 w-4" /> Stop
                </Button>
              ) : (
                <Button onClick={start} disabled={busy} className="bg-gradient-primary">
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                  {busy ? statusLabel : "Start recognition"}
                </Button>
              )}
              <div className="ml-auto text-xs text-muted-foreground">
                26 letters · {SUPPORTED_GESTURES.length} gestures
              </div>
            </div>

            {/* Transcript */}
            <div className="rounded-3xl border border-border bg-gradient-card p-6 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Transcript</h2>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setText((t) => t + " ")} title="Space">
                    <Space className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setText((t) => t.slice(0, -1))} title="Backspace">
                    <Delete className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onUndo} title="Undo last recognition" disabled={!history.length}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setText("")} title="Clear">
                    <Eraser className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onCopy} title="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDownload} title="Download">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-24 rounded-xl border border-border bg-background/60 p-4 font-display text-2xl tracking-wide break-words whitespace-pre-wrap">
                {text || <span className="text-muted-foreground text-base font-sans">Recognized text will appear here…</span>}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Settings */}
            <div className="rounded-3xl border border-border bg-gradient-card p-6 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Settings</h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recognition mode</label>
                  <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (letters + gestures)</SelectItem>
                      <SelectItem value="letters">Letters only (A–Z)</SelectItem>
                      <SelectItem value="gestures">Gestures only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Camera</label>
                  <Select value={selectedCam} onValueChange={setSelectedCam} disabled={running}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {cameras.length === 0 && <SelectItem value="default">Default camera</SelectItem>}
                      {cameras.map((c, i) => (
                        <SelectItem key={c.deviceId || i} value={c.deviceId || `cam-${i}`}>
                          {c.label || `Camera ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Confidence threshold
                    </label>
                    <span className="text-sm font-mono">{Math.round(threshold * 100)}%</span>
                  </div>
                  <Slider
                    value={[threshold]}
                    onValueChange={(v) => setThreshold(v[0])}
                    min={0.3}
                    max={0.95}
                    step={0.05}
                    className="mt-3"
                  />
                </div>

                <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    {running ? <Camera className="h-4 w-4 mt-0.5 shrink-0" /> : <CameraOff className="h-4 w-4 mt-0.5 shrink-0" />}
                    <p>Video is processed entirely on your device. Nothing is uploaded.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Vocabulary */}
            <div className="rounded-3xl border border-border bg-gradient-card p-6 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Vocabulary</h2>
              </div>
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Letters</div>
                <div className="flex flex-wrap gap-1">
                  {SUPPORTED_LETTERS.map((l) => (
                    <span key={l} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/60 text-xs font-mono">{l}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Gestures</div>
                <div className="flex flex-wrap gap-1">
                  {SUPPORTED_GESTURES.map((g) => (
                    <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* History */}
            <div className="rounded-3xl border border-border bg-gradient-card p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">History</h2>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setHistory([])} disabled={!history.length}>
                  Clear
                </Button>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Recognized signs will show up here.</p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-auto pr-1">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-base font-bold text-gradient">{h.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{h.kind}</span>
                        <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString()}</span>
                      </div>
                      <Badge variant="secondary">{Math.round(h.confidence * 100)}%</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status, handDetected, label }: { status: string; handDetected: boolean; label: string }) {
  const color =
    status === "running" && handDetected ? "bg-success" :
    status === "running" ? "bg-primary" :
    status === "error" ? "bg-destructive" :
    status === "idle" ? "bg-muted-foreground" : "bg-primary";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium backdrop-blur">
      <span className={`h-2 w-2 rounded-full ${color} ${status === "running" && handDetected ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
