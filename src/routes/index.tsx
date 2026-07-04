import { createFileRoute, Link } from "@tanstack/react-router";
import { Hand, Sparkles, Cpu, Zap, Camera, MessageSquare, Shield, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

const features = [
  { icon: Camera, title: "Real-Time Webcam", desc: "Live camera feed with instant hand-landmark visualization." },
  { icon: Cpu, title: "MediaPipe Powered", desc: "21-point hand tracking runs entirely in your browser." },
  { icon: Sparkles, title: "ASL Recognition", desc: "Rule-based recognizer for ASL letters A–F, ready out of the box." },
  { icon: MessageSquare, title: "Text Generation", desc: "Assembles recognized signs into readable text you can copy or download." },
  { icon: Zap, title: "Low Latency", desc: "Optimized rendering loop for smooth, responsive detection." },
  { icon: Shield, title: "Private by Design", desc: "Video never leaves your device — all processing happens locally." },
];

const stack = ["React 19", "TanStack Start", "MediaPipe Tasks", "Tailwind v4", "TypeScript", "shadcn/ui"];

function Index() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-10" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-glow/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered sign language recognition
            </div>
            <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Bridge the gap with <span className="text-gradient">SignBridge</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
              A real-time American Sign Language recognizer that turns hand gestures into readable English text, right in your browser.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-primary shadow-elegant hover:opacity-95">
                <Link to="/recognize">
                  Start Recognition
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/about">Learn more</Link>
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">No sign-up · Runs 100% locally · Camera required</p>
          </div>

          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-3xl border border-border bg-gradient-card p-2 shadow-elegant">
              <div className="aspect-video overflow-hidden rounded-2xl bg-gradient-hero flex items-center justify-center relative">
                <Hand className="h-32 w-32 text-primary-foreground/90 drop-shadow-2xl" strokeWidth={1.2} />
                <div className="absolute bottom-4 left-4 rounded-lg bg-background/80 px-3 py-2 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Detected</div>
                  <div className="font-display text-2xl font-bold text-gradient">B</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Everything you need to demo AI sign recognition</h2>
          <p className="mt-4 text-muted-foreground">Modern browser-based ML. No servers, no data leaves your machine.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-gradient-card p-6 shadow-card transition-all hover:shadow-elegant hover:-translate-y-0.5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Built with a modern stack</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {stack.map((s) => (
                <span key={s} className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-10 text-center shadow-elegant sm:p-16">
          <h2 className="font-display text-3xl font-bold text-primary-foreground sm:text-4xl">
            Ready to start signing?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/90">
            Grant camera access, show your hand, and watch SignBridge translate live.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" variant="secondary">
              <Link to="/recognize">
                Launch recognizer
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} SignBridge · College Mini Project
        </div>
      </footer>
    </div>
  );
}
