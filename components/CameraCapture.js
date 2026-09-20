"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { X, RefreshCw, Zap, ZapOff, Clock, Image as ImageIcon, Music2 } from "lucide-react";

const MODES = [
  { id: "15", label: "15s", seconds: 15 },
  { id: "60", label: "60s", seconds: 60 },
  { id: "photo", label: "PHOTO", seconds: 0 },
];

const RING_RADIUS = 40;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

// Grab a small JPEG frame from a playing/loaded <video> element.
function frameFromVideo(video, maxWidth = 480) {
  try {
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

// Build a cover image for a video the user picked from their gallery.
function thumbFromVideoFile(dataUrl) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.onloadeddata = () => {
      try { v.currentTime = 0.1; } catch { finish(null); }
    };
    v.onseeked = () => finish(frameFromVideo(v));
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 3000);
    v.src = dataUrl;
  });
}

function ToolButton({ icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        background: "none", border: "none", padding: 0,
        color: active ? "#ffd84d" : "white",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))",
      }}
    >
      {icon}
      <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// Props:
//   onCapture({ mediaUrl, mediaType, thumbUrl })  - called with the photo/video
//   onClose()                                     - user closed the camera
//   sound (optional)        { id, name, mediaUrl } - a sound to record with
//   onPickSound (optional)  - shows the "Add sound" pill and calls this when tapped
//   onRemoveSound (optional) - shows an x on the pill to remove the sound
export default function CameraCapture({ onCapture, onClose, sound = null, onPickSound, onRemoveSound }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const galleryInputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const soundElRef = useRef(null);
  const recordTimerRef = useRef(null);
  const errorTimerRef = useRef(null);
  const discardRef = useRef(false);
  const startedAtRef = useRef(0);

  const [facingMode, setFacingMode] = useState("user");
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [modeId, setModeId] = useState("15");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [lastThumb, setLastThumb] = useState(null);

  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const isPhoto = mode.id === "photo";
  const hasSound = !!sound?.mediaUrl;
  // With a sound attached the mic is off; the sound is the audio track.
  const wantAudio = !isPhoto && !hasSound;

  const startStream = useCallback(async () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setFlashOn(false);
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: wantAudio });
    } catch {
      if (wantAudio) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        } catch {
          stream = null;
        }
      }
    }
    if (!stream) {
      setError("Couldn't access camera. Check your browser's camera permissions.");
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      setTorchSupported(!!caps.torch);
    } catch {
      setTorchSupported(false);
    }
    setError("");
  }, [facingMode, wantAudio]);

  useEffect(() => {
    startStream();
  }, [startStream]);

  useEffect(() => {
    return () => {
      discardRef.current = true;
      try { recorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(recordTimerRef.current);
      clearTimeout(errorTimerRef.current);
      try { soundElRef.current?.pause(); } catch {}
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  function showError(msg) {
    setError(msg);
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(""), 3500);
  }

  function teardownSound() {
    try { soundElRef.current?.pause(); } catch {}
    soundElRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
  }

  function flipCamera() {
    if (recording) return;
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  }

  function cycleTimer() {
    setTimerSeconds((t) => (t === 0 ? 3 : t === 3 ? 10 : 0));
  }

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !flashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashOn(next);
    } catch {
      showError("Flash isn't available on this camera.");
    }
  }

  function takePhoto() {
    try {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        showError("Camera isn't ready yet — give it a second and try again.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setLastThumb(dataUrl);
      onCapture({ mediaUrl: dataUrl, mediaType: "image", thumbUrl: dataUrl });
    } catch {
      showError("Couldn't take the photo. Try again.");
    }
  }

  async function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      showError("Camera isn't ready yet — give it a second and try again.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      showError("Recording isn't supported in this browser.");
      return;
    }
    if (recorderRef.current) return;

    try {
      discardRef.current = false;
      chunksRef.current = [];
      let recordStream = stream;

      if (hasSound) {
        // Mix the sound straight into the recording's audio track.
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();
        const el = new Audio();
        el.src = sound.mediaUrl;
        el.preload = "auto";
        const src = ctx.createMediaElementSource(el);
        src.connect(dest);
        src.connect(ctx.destination);
        await ctx.resume();
        audioCtxRef.current = ctx;
        soundElRef.current = el;
        el.onended = () => stopRecording();
        recordStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      }

      const mimeType = pickMimeType();
      const options = { videoBitsPerSecond: 1200000 };
      if (mimeType) options.mimeType = mimeType;
      const recorder = new MediaRecorder(recordStream, options);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        teardownSound();
        if (discardRef.current) return;
        const thumb = frameFromVideo(videoRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "video/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          setLastThumb(thumb || null);
          onCapture({ mediaUrl: reader.result, mediaType: "video", thumbUrl: thumb || null });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      if (hasSound && soundElRef.current) {
        await soundElRef.current.play().catch(() => {});
      }

      const maxSeconds = mode.seconds;
      recordTimerRef.current = setInterval(() => {
        const secs = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(secs);
        if (secs >= maxSeconds) stopRecording();
      }, 100);
    } catch {
      teardownSound();
      recorderRef.current = null;
      setRecording(false);
      showError("Couldn't start recording. Try again.");
    }
  }

  function stopRecording() {
    clearInterval(recordTimerRef.current);
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch {}
    }
  }

  function runCapture() {
    if (isPhoto) takePhoto();
    else startRecording();
  }

  function handleCapturePress() {
    if (recording) {
      stopRecording();
      return;
    }
    if (countdownLeft > 0) {
      setCountdownLeft(0);
      return;
    }
    if (timerSeconds > 0) setCountdownLeft(timerSeconds);
    else runCapture();
  }

  useEffect(() => {
    if (countdownLeft <= 0) return;
    const t = setTimeout(() => {
      if (countdownLeft === 1) {
        setCountdownLeft(0);
        runCapture();
      } else {
        setCountdownLeft(countdownLeft - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownLeft]);

  function handleClose() {
    discardRef.current = true;
    setCountdownLeft(0);
    stopRecording();
    teardownSound();
    onClose();
  }

  function handleGalleryPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const thumb = isVideo ? await thumbFromVideoFile(dataUrl) : dataUrl;
      setLastThumb(thumb);
      onCapture({ mediaUrl: dataUrl, mediaType: isVideo ? "video" : "image", thumbUrl: thumb });
    };
    reader.readAsDataURL(file);
  }

  const progress = mode.seconds ? Math.min(1, elapsed / mode.seconds) : 0;
  const busy = recording || countdownLeft > 0;
  const elapsedSecs = Math.floor(elapsed);
  const elapsedLabel = `${Math.floor(elapsedSecs / 60)}:${String(elapsedSecs % 60).padStart(2, "0")}`;return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 500, display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 480, height: "100%", background: "#111", overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          }}
        />

        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, background: "linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0))", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 220, background: "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))", pointerEvents: "none" }} />

        {/* Recording progress bar */}
        {recording && (
          <div
            style={{
              position: "absolute", top: "env(safe-area-inset-top, 0px)", left: 8, right: 8, marginTop: 8,
              height: 4, borderRadius: 2, background: "rgba(255,255,255,0.3)", zIndex: 4,
            }}
          >
            <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 2, background: "#ff2d55" }} />
          </div>
        )}

        {/* Top bar: close, sound pill / timer */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 3,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "calc(env(safe-area-inset-top, 0px) + 20px) 14px 0",
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: "rgba(0,0,0,0.4)", border: "none", borderRadius: "50%",
              width: 36, height: 36, color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>

          {recording ? (
            <span style={{ color: "white", fontSize: 14, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {elapsedLabel}
            </span>
          ) : hasSound || onPickSound ? (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.45)",
                borderRadius: 20, padding: "7px 12px", maxWidth: 210,
              }}
            >
              <button
                type="button"
                onClick={() => onPickSound && onPickSound()}
                disabled={!onPickSound}
                style={{
                  background: "none", border: "none", padding: 0, color: "white",
                  display: "flex", alignItems: "center", gap: 6, minWidth: 0,
                }}
              >
                <Music2 size={14} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hasSound ? sound.name : "Add sound"}
                </span>
              </button>
              {hasSound && onRemoveSound && (
                <button
                  type="button"
                  onClick={onRemoveSound}
                  aria-label="Remove sound"
                  style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.8)", display: "flex" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ) : (
            <span />
          )}

          <div style={{ width: 36 }} />
        </div>

        {/* Right-side tools */}
        {!recording && (
          <div
            style={{
              position: "absolute", right: 12, top: "calc(env(safe-area-inset-top, 0px) + 84px)", zIndex: 3,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
            }}
          >
            <ToolButton icon={<RefreshCw size={22} />} label="Flip" onClick={flipCamera} />
            <ToolButton
              icon={<Clock size={22} />}
              label={timerSeconds ? `${timerSeconds}s` : "Timer"}
              active={timerSeconds > 0}
              onClick={cycleTimer}
            />
            {torchSupported && (
              <ToolButton
                icon={flashOn ? <Zap size={22} /> : <ZapOff size={22} />}
                label="Flash"
                active={flashOn}
                onClick={toggleFlash}
              />
            )}
          </div>
        )}

        {/* Countdown */}
        {countdownLeft > 0 && (
          <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ color: "white", fontSize: 120, fontWeight: 800, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
              {countdownLeft}
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute", top: "40%", left: 16, right: 16, zIndex: 5, color: "white",
              textAlign: "center", fontSize: 14, background: "rgba(0,0,0,0.65)", padding: 12, borderRadius: 10,
            }}
          >
            {error}
          </div>
        )}

        {/* Bottom controls */}
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 3,
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}
        >
          {!busy && (
            <div style={{ display: "flex", gap: 22 }}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModeId(m.id)}
                  style={{
                    background: "none", border: "none", padding: "2px 0",
                    color: modeId === m.id ? "white" : "rgba(255,255,255,0.55)",
                    fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
                    borderBottom: modeId === m.id ? "2px solid white" : "2px solid transparent",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ position: "relative", width: "100%", height: 88, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button
              type="button"
              onClick={handleCapturePress}
              aria-label={isPhoto ? "Take photo" : recording ? "Stop recording" : "Start recording"}
              style={{ position: "relative", width: 88, height: 88, background: "none", border: "none", padding: 0 }}
            >
              <svg width="88" height="88" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0 }}>
                <circle cx="44" cy="44" r={RING_RADIUS} fill="none" stroke="white" strokeWidth="4" />
                {recording && (
                  <circle
                    cx="44" cy="44" r={RING_RADIUS} fill="none" stroke="#ff2d55" strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${progress * RING_LENGTH} ${RING_LENGTH}`}
                    transform="rotate(-90 44 44)"
                  />
                )}
              </svg>
              <span
                style={{
                  position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                  display: "block",
                  width: recording ? 30 : isPhoto ? 64 : 62,
                  height: recording ? 30 : isPhoto ? 64 : 62,
                  borderRadius: recording ? 8 : "50%",
                  background: isPhoto ? "white" : "#ff2d55",
                  transition: "all 0.18s ease",
                }}
              />
            </button>

            {!busy && (
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                aria-label="Upload from gallery"
                style={{
                  position: "absolute", right: 22, background: "none", border: "none", padding: 0,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "white",
                }}
              >
                <span
                  style={{
                    width: 42, height: 42, borderRadius: 10, border: "2px solid rgba(255,255,255,0.7)",
                    overflow: "hidden", background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {lastThumb ? (
                    <img src={lastThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <ImageIcon size={18} color="white" />
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Upload</span>
              </button>
            )}
          </div>
        </div>

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleGalleryPick}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}