import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { BookOpen, Cpu, Workflow, User } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SignBridge — How it works" },
      { name: "description", content: "Learn how SignBridge uses MediaPipe hand tracking and a rule-based recognizer to translate ASL gestures into text." },
      { property: "og:title", content: "About SignBridge" },
      { property: "og:description", content: "How SignBridge translates ASL gestures into text in the browser." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">About SignBridge</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          SignBridge is a real-time American Sign Language recognition web app built as a college mini project.
          It demonstrates how modern in-browser machine learning can make accessibility tools fast, private, and easy to deploy.
        </p>

        <section className="mt-12 space-y-8">
          <Card icon={BookOpen} title="Project overview">
            SignBridge captures video from your webcam, tracks 21 hand landmarks per frame using MediaPipe, and applies a
            geometric rule-based recognizer to identify ASL letters A through F. Recognized letters are aggregated into
            words and sentences that you can copy or export.
          </Card>

          <Card icon={Cpu} title="Technologies used">
            <ul className="list-disc space-y-1 pl-5">
              <li>React 19 + TanStack Start (SSR-ready routing)</li>
              <li>MediaPipe Tasks Vision — HandLandmarker (WASM, runs in-browser)</li>
              <li>TypeScript, Tailwind CSS v4, shadcn/ui components</li>
              <li>Rule-based landmark classifier (no training required)</li>
              <li>Lucide icons, Sonner toasts</li>
            </ul>
          </Card>

          <Card icon={Workflow} title="How it works">
            <ol className="list-decimal space-y-2 pl-5">
              <li>You grant camera access; a live video stream begins.</li>
              <li>Each frame is passed to MediaPipe HandLandmarker, producing 21 (x, y, z) landmarks.</li>
              <li>Landmarks are drawn as an overlay so you can see the model's view.</li>
              <li>A geometric recognizer inspects finger extension and thumb position to classify the gesture.</li>
              <li>Predictions above your confidence threshold, held stable across frames, are appended to the transcript.</li>
            </ol>
          </Card>

          <Card icon={User} title="Developer">
            <p>
              Built by a student developer as a mini project demonstration. Replace this placeholder with your name,
              roll number, and department before submission.
            </p>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-card p-6 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
