import { useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Mic, Square } from "lucide-react";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
let activeRecognition: Recognition | null = null;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export default function VoiceTextarea({ value, onValueChange, disabled, ...props }: Props) {
  const recognitionRef = useRef<Recognition | null>(null);
  const latest = useRef({ value, onValueChange });
  latest.current = { value, onValueChange };
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const constructor = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
  const available = !!constructor && window.isSecureContext;

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
    if (activeRecognition === recognition) activeRecognition = null;
  }, []);

  useEffect(() => {
    if (disabled && recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort();
    }
  }, [disabled]);

  function start() {
    if (!constructor || !available || disabled) return;
    activeRecognition?.abort();
    const recognition = new constructor();
    recognitionRef.current = recognition;
    activeRecognition = recognition;
    recognition.lang = "fa-IR";
    recognition.continuous = true;
    recognition.interimResults = true;
    const committed = new Set<number>();
    recognition.onresult = event => {
      if (recognitionRef.current !== recognition) return;
      const final: string[] = [];
      const pending: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = result[0].transcript.trim();
        if (result.isFinal && !committed.has(index)) {
          committed.add(index);
          if (transcript) final.push(transcript);
        } else if (!result.isFinal && transcript) pending.push(transcript);
      }
      if (final.length) {
        const current = latest.current;
        const text = current.value + (current.value && !/\s$/.test(current.value) ? " " : "") + final.join(" ");
        latest.current = { ...current, value: text };
        current.onValueChange(text);
      }
      setInterim(pending.join(" "));
    };
    recognition.onerror = event => {
      if (recognitionRef.current !== recognition) return;
      const messages: Record<string, string> = {
        "not-allowed": "اجازهٔ استفاده از میکروفون داده نشد. مجوز میکروفون را در مرورگر بررسی کنید.",
        "service-not-allowed": "سرویس تایپ صوتی در این مرورگر فعال نیست.",
        "audio-capture": "میکروفون در دسترس نیست. اتصال و مجوز آن را بررسی کنید.",
        "no-speech": "صدایی دریافت نشد. دوباره شروع کنید.",
        network: "اتصال به سرویس تشخیص گفتار برقرار نشد. اتصال اینترنت را بررسی کنید.",
        "language-not-supported": "تشخیص گفتار فارسی در این مرورگر پشتیبانی نمی‌شود.",
      };
      if (event.error !== "aborted") setError(messages[event.error] ?? "تایپ صوتی متوقف شد. دوباره تلاش کنید.");
    };
    recognition.onend = () => {
      if (activeRecognition === recognition) activeRecognition = null;
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
    };
    setError("");
    setInterim("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      if (activeRecognition === recognition) activeRecognition = null;
      setListening(false);
      setError("شروع تایپ صوتی انجام نشد. دوباره تلاش کنید.");
    }
  }

  return <div className="voice-textarea">
    <textarea {...props} value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}/>
    <div className="voice-textarea-tools">
      <button type="button" className="secondary" disabled={disabled || !available} aria-pressed={listening}
        onClick={() => listening ? recognitionRef.current?.stop() : start()}>
        {listening ? <Square size={15}/> : <Mic size={15}/>}
        {listening ? "توقف تایپ صوتی" : "تایپ صوتی"}
      </button>
      <small>{!window.isSecureContext ? "برای تایپ صوتی، سامانه را با HTTPS باز کنید."
        : !constructor ? "این مرورگر از تایپ صوتی پشتیبانی نمی‌کند."
        : listening ? "در حال شنیدن… فارسی صحبت کنید."
        : "تشخیص گفتار توسط سرویس مرورگر انجام می‌شود و ممکن است صدا به آن سرویس ارسال شود."}</small>
    </div>
    {interim && <p className="voice-textarea-interim" role="status">{interim}</p>}
    {error && <p className="voice-textarea-error" role="alert">{error}</p>}
  </div>;
}
