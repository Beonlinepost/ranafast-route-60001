/**
 * useVoiceSearch — single persistent recognition instance, iOS-safe TTS.
 *
 * Architecture (matches the working Base44/WorkerWork pattern):
 * - ONE recognition instance created once and reused (never destroyed/recreated)
 * - TTS speaks directly: no cancel(), no complex priming, no state machine
 * - After TTS ends: simple 100ms setTimeout → recognitionRef.current.start()
 * - This is the exact pattern that works on iPhone Safari
 *
 * States:
 *   idle      — mic is off
 *   listening — recognition is active
 *   speaking  — TTS is playing
 */

import { useCallback, useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

export type VoiceState = "idle" | "listening" | "speaking" | "restarting";

export interface UseVoiceSearchResult {
  voiceState: VoiceState;
  listening: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  notifySpeakingStart: () => void;
  notifySpeakingEnd: (spokenTextLength?: number) => void;
  primeAudioContext: () => void;
}

const log = (msg: string, data?: unknown) => {
  console.debug(`[Voice ${new Date().toLocaleTimeString()}]`, msg, data ?? "");
};

export function useVoiceSearch(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError?: (err: string) => void,
  lang = "en-IE"
): UseVoiceSearchResult {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  // Single persistent recognition instance — never destroyed
  const recRef = useRef<AnyRec>(null);
  const wantActiveRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>("idle");
  const onTranscriptRef = useRef(onTranscript);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  /** Create the single recognition instance (called once) */
  const initRec = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      log("SpeechRecognition not supported");
      onError?.("Speech recognition not supported in this browser.");
      return;
    }
    if (recRef.current) return; // already initialised

    log("Creating persistent recognition instance");
    const rec: AnyRec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      log("Recognition started");
      retryCountRef.current = 0;
      setVoiceState("listening");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) onTranscriptRef.current(interim, false);
      if (final) {
        log("Final transcript", final);
        onTranscriptRef.current(final, true);
      }
    };

    rec.onend = () => {
      log("Recognition ended, wantActive=" + wantActiveRef.current + " state=" + voiceStateRef.current);
      clearRestartTimer();

      // Only auto-restart if active state is expected and not speaking
      if (wantActiveRef.current && (voiceStateRef.current === "listening" || voiceStateRef.current === "restarting")) {
        // iPhone Safari silence timeout auto-restart pattern
        const backoffMs = Math.min(100 * Math.pow(2, Math.min(retryCountRef.current, 4)), 1600);
        log(`Auto-restarting recognition (retry #${retryCountRef.current + 1}, delay=${backoffMs}ms)`);

        restartTimerRef.current = setTimeout(() => {
          if (wantActiveRef.current && (voiceStateRef.current === "listening" || voiceStateRef.current === "restarting")) {
            try {
              retryCountRef.current++;
              rec.start();
            } catch (e) {
              log("Restart error", e);
            }
          }
        }, backoffMs);
      } else if (!wantActiveRef.current && voiceStateRef.current !== "speaking") {
        setVoiceState("idle");
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      log("Recognition error", e.error);
      if (e.error === "aborted" || e.error === "no-speech" || e.error === "network") {
        // Expected on iOS Safari silence timeouts or speech pauses
        if (wantActiveRef.current && voiceStateRef.current === "listening") {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (wantActiveRef.current && voiceStateRef.current === "listening") {
              try { rec.start(); } catch (err) { log("Restart after transient error failed", err); }
            }
          }, 250);
        }
        return;
      }
      onError?.(e.error);
    };

    recRef.current = rec;
  }, [lang, onError, clearRestartTimer]);

  const start = useCallback(() => {
    if (voiceStateRef.current !== "idle") {
      log("Already active, skipping start");
      return;
    }
    initRec();
    if (!recRef.current) return;

    log("Starting voice search");
    wantActiveRef.current = true;
    retryCountRef.current = 0;
    clearRestartTimer();
    try {
      recRef.current.start();
    } catch (e) {
      log("Start error", e);
    }
  }, [initRec, clearRestartTimer]);

  const stop = useCallback(() => {
    log("Stopping voice search");
    wantActiveRef.current = false;
    clearRestartTimer();
    if (recRef.current) {
      try { recRef.current.abort(); } catch (e) { log("Abort error", e); }
    }
    setVoiceState("idle");
  }, [clearRestartTimer]);

  const toggle = useCallback(() => {
    if (voiceStateRef.current === "idle") {
      start();
    } else {
      stop();
    }
  }, [start, stop]);

  /**
   * Called BEFORE speaking — abort recognition so mic and speaker don't conflict on Safari iOS.
   */
  const notifySpeakingStart = useCallback(() => {
    log("Speaking start — aborting recognition and locking STT");
    clearRestartTimer();
    setVoiceState("speaking");
    if (recRef.current) {
      try { recRef.current.abort(); } catch (e) { log("Abort error on speaking start", e); }
    }
  }, [clearRestartTimer]);

  /**
   * Called inside utterance.onend — restart recognition after TTS finishes.
   * On iOS Safari, speaker tail-off + reaction sounds need a delay before mic re-activation.
   */
  const notifySpeakingEnd = useCallback((spokenTextLength = 0) => {
    clearRestartTimer();
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMobile = isIOS || /Android/i.test(navigator.userAgent);
    
    // On iOS Safari, allow 500ms after TTS to clear speaker buffer before restarting recognition
    const estimatedAudioMs = (isMobile && spokenTextLength > 0) ? 500 : (isIOS ? 300 : 100);
    log(`Speaking end — restarting recognition in ${estimatedAudioMs}ms (iOS=${isIOS}, mobile=${isMobile}, len=${spokenTextLength})`);
    setVoiceState("restarting");
    
    restartTimerRef.current = setTimeout(() => {
      if (wantActiveRef.current) {
        log("Restarting recognition after TTS");
        setVoiceState("listening");
        retryCountRef.current = 0;
        if (recRef.current) {
          try { recRef.current.start(); } catch (e) { log("Restart after TTS failed", e); }
        }
      } else {
        setVoiceState("idle");
      }
    }, estimatedAudioMs);
  }, [clearRestartTimer]);

  /**
   * Prime the iOS audio context on user gesture (onPointerDown).
   * Speaks a silent utterance and pre-warms speech context.
   */
  const primeAudioContext = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;
    try {
      log("Priming iOS audio context");
      if ("speechSynthesis" in window) {
        window.speechSynthesis.resume?.();
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        u.rate = 2;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      log("Prime error", e);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantActiveRef.current = false;
      clearRestartTimer();
      if (recRef.current) {
        try { recRef.current.abort(); } catch (_) {}
      }
    };
  }, [clearRestartTimer]);

  return {
    voiceState,
    listening: voiceState === "listening",
    start,
    stop,
    toggle,
    notifySpeakingStart,
    notifySpeakingEnd,
    primeAudioContext,
  };
}
