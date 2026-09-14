"use client";
import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

type AIInputBarProps = {
  message: string;
  loading: boolean;
  disabled: boolean;
  bottomOffset?: string;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function AIInputBar({ message, loading, disabled, bottomOffset = "0px", onChange, onSend }: AIInputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [focused, setFocused] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    setVoiceSupported(typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    type SpeechRecognitionCtor = new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (ev: { results: { 0: { 0: { transcript: string } } } }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };

    const SR =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;

    if (!SR) return;

    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = ev => {
      const text = ev.results[0][0].transcript;
      onChange(message ? `${message} ${text}` : text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function syncTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 72)}px`;
  }

  useEffect(() => {
    if (inputRef.current) syncTextareaHeight(inputRef.current);
  }, [message]);

  const canSend = Boolean(message.trim()) && !disabled;

  return (
    <div
      style={{
        position: "fixed",
        bottom: bottomOffset,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        padding: "10px 12px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        alignItems: "flex-end",
        gap: "8px",
      }}
    >
      {voiceSupported && (
        <button
          type="button"
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={listening ? "Parar gravação" : "Entrada por voz"}
          style={{
            width: "48px",
            height: "48px",
            flexShrink: 0,
            borderRadius: "14px",
            background: listening ? "var(--red-10)" : "var(--bg-input)",
            border: `1px solid ${listening ? "var(--red-20)" : "var(--border)"}`,
            color: listening ? "var(--red)" : "var(--text-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {listening ? <MicOff size={18} strokeWidth={1.5} /> : <Mic size={18} strokeWidth={1.5} />}
        </button>
      )}

      {/*
        Borda/padding no wrapper — no Android, height fixo na textarea
        ignora padding e o texto cola/corta nas bordas.
      */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          background: focused ? "var(--bg-input-focus)" : "var(--bg-input)",
          border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "14px",
          padding: "12px 14px",
          minHeight: "48px",
          boxSizing: "border-box",
          opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.15s ease, background 0.15s ease",
        }}
      >
        <textarea
          ref={inputRef}
          value={message}
          onChange={e => {
            onChange(e.target.value);
            syncTextareaHeight(e.target);
          }}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ex: gastei 50 no iFood e 30 de uber…"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            width: "100%",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            fontSize: "15px",
            lineHeight: "24px",
            color: "var(--text-1)",
            fontFamily: "inherit",
            resize: "none",
            height: "24px",
            minHeight: "24px",
            maxHeight: "72px",
            overflowY: "auto",
            display: "block",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        style={{
          width: "48px",
          height: "48px",
          flexShrink: 0,
          borderRadius: "14px",
          background: canSend ? "var(--accent)" : "var(--bg-input)",
          border: `1px solid ${canSend ? "transparent" : "var(--border)"}`,
          color: canSend ? "#06100E" : "var(--text-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: canSend ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        {loading ? (
          <div
            style={{
              width: "15px",
              height: "15px",
              border: "2px solid var(--accent)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
        ) : (
          <SendIcon />
        )}
      </button>
    </div>
  );
}

export function focusInput(ref: React.RefObject<HTMLTextAreaElement | null>) {
  ref.current?.focus();
}
