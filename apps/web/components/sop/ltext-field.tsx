"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LText, SopLang } from "@nodedr-restaurant/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type LDraft = Partial<Record<SopLang, string>>;

const SPEECH_LANG: Record<SopLang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN", mr: "mr-IN" };
const SHORT: Record<SopLang, string> = { en: "EN", hi: "हि", gu: "ગુ", mr: "म" };

/* Browser speech-to-text (Chrome/Edge/Android; Hindi, Gujarati, Marathi and
   Indian English). Not every browser has it — the mic button hides then. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> ; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
export function useSpeechSupported() {
  // Browser-only capability: false on the server, real answer after hydration.
  return useSyncExternalStore(noop, () => !!getRecognition(), () => false);
}

function MicButton({ lang, onText }: { lang: SopLang; onText: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const supported = useSpeechSupported();
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text.trim()) onText(text.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? "Stop dictation" : "Dictate"}
      aria-pressed={on}
      className={cn(
        "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md",
        on ? "animate-pulse bg-destructive text-white" : "text-muted-foreground hover:bg-secondary",
      )}
    >
      {on ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * One piece of kitchen text in English and the kitchen's second language,
 * side by side. Other languages already stored are kept untouched.
 */
export function LTextField({
  value,
  onChange,
  lang2,
  multiline,
  placeholder,
  label,
  dictate,
}: {
  value: LDraft;
  onChange: (v: LDraft) => void;
  lang2: SopLang;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  dictate?: boolean;
}) {
  const langs: SopLang[] = lang2 === "en" ? ["en"] : ["en", lang2];
  return (
    <div className={cn("grid gap-2", langs.length > 1 && "sm:grid-cols-2")}>
      {langs.map((l) => {
        const common = {
          value: value[l] ?? "",
          "aria-label": `${label} (${SHORT[l]})`,
          placeholder: l === "en" ? placeholder : SHORT[l],
          lang: l,
          className: cn(dictate && "pr-10"),
        };
        const set = (text: string) => onChange({ ...value, [l]: text });
        const append = (text: string) => set(value[l] ? `${value[l]} ${text}` : text);
        return (
          <div key={l} className="relative">
            {multiline ? (
              <Textarea rows={2} {...common} onChange={(e) => set(e.target.value)} />
            ) : (
              <Input {...common} onChange={(e) => set(e.target.value)} />
            )}
            {dictate && <MicButton lang={l} onText={append} />}
          </div>
        );
      })}
    </div>
  );
}

/** Drafts → stored LText: trims, drops blanks, and lets a Hindi-only line stand in for English. */
export function toLText(d: LDraft | undefined): LText | null {
  const out: LDraft = {};
  for (const [k, v] of Object.entries(d ?? {})) if (v?.trim()) out[k as SopLang] = v.trim();
  if (!out.en) out.en = out.hi ?? out.gu ?? out.mr;
  return out.en ? (out as LText) : null;
}

export const NATIVE_SELECT =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
