"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { X, RefreshCw, Zap, ZapOff, Clock, Image as ImageIcon, Music2, Sparkles, Gauge, LayoutGrid } from "lucide-react";

const MODES = [
  { id: "15", label: "15s", seconds: 15 },
  { id: "60", label: "60s", seconds: 60 },
  { id: "180", label: "3m", seconds: 180 },
  { id: "photo", label: "PHOTO", seconds: 0 },
];

// Camera filters. The `css` string is used for the live preview AND is
// baked into the photo / recorded video, so what you see is what you post.
const FILTERS = [
  { id: "none", label: "Normal", css: "none", dot: "#d9d9d9" },
  { id: "vivid", label: "Vivid", css: "saturate(1.45) contrast(1.1)", dot: "#ff3d81" },
  { id: "warm", label: "Warm", css: "sepia(0.28) saturate(1.3) hue-rotate(-12deg) brightness(1.05)", dot: "#ffa94d" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(18deg) brightness(1.03)", dot: "#4dabf7" },
  { id: "smooth", label: "Smooth", css: "blur(0.6px) brightness(1.08) contrast(0.95) saturate(1.1)", dot: "#ffc9d6" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.12)", dot: "#555555" },
  { id: "vintage", label: "Vintage", css: "sepia(0.5) contrast(1.05) brightness(0.96) saturate(0.9)", dot: "#b8894d" },
  { id: "fade", label: "Fade", css: "contrast(0.85) brightness(1.1) saturate(0.85)", dot: "#c7d3e0" },
  { id: "drama", label: "Drama", css: "contrast(1.35) saturate(1.2) brightness(0.92)", dot: "#7048e8" },
];

// Recording speeds, same options as TikTok. Slow values give slow motion,
// fast values give a sped-up video. The speed is baked into the finished clip.
const SPEEDS = [
  { value: 0.3, label: "0.3x" },
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
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

// Canvas filters (ctx.filter) are what let a filter be baked into a photo
// or recording. Most Android/desktop browsers support it; some iPhones don't.
function canvasFilterSupported() {
  try {
    return typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
  } catch {
    return false;
  }
}

// Read a File into a data URL.
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

// Checks whether a just-recorded blob actually has real video data in it,
// rather than judging it by duration or file size. A clip that's only a
// fraction of a second long is still perfectly valid (TikTok allows this
// too) as long as it has real frame dimensions; the only thing worth
// rejecting is a recording that produced no usable video track at all,
// which is what caused the broken 0:00 player before this check existed.
function blobHasPlayableVideo(blob) {
  return new Promise((resolve) => {
    if (!blob || blob.size === 0) {
      resolve(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => finish(v.videoWidth > 0 && v.videoHeight > 0);
    v.onerror = () => finish(false);
    setTimeout(() => finish(false), 4000);
    v.src = url;
  });
}

// Re-records a finished clip at a different speed (0.3x slow motion up to
// 3x fast). It plays the clip back at the new rate and records that, so the
// speed becomes part of the video itself. Takes about as long as the new
// clip. Returns null if this browser can't do it.
function retimeBlob(blob, speed, clipSeconds, mimeType) {
  return new Promise((resolve) => {
    let finished = false;
    let rec = null;
    let ctx = null;
    const url = URL.createObjectURL(blob);
    const chunks = [];
    const v = document.createElement("video");

    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { v.pause(); } catch {}
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch {}
      try { ctx?.close(); } catch {}
      URL.revokeObjectURL(url);
      resolve(result);
    };

    try {
      if (typeof v.captureStream !== "function" && typeof v.mozCaptureStream !== "function") {
        finish(null);
        return;
      }
      v.playsInline = true;
      v.preload = "auto";
      v.src = url;
      v.defaultPlaybackRate = speed;
      v.playbackRate = speed;

      v.onloadeddata = async () => {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          ctx = new AudioCtx();
          const dest = ctx.createMediaStreamDestination();
          // Routed only into the recorder, so nothing plays out loud.
          ctx.createMediaElementSource(v).connect(dest);
          const cap = (v.captureStream || v.mozCaptureStream).call(v);
          if (cap.getVideoTracks().length === 0) {
            finish(null);
            return;
          }
          const out = new MediaStream([...cap.getVideoTracks(), ...dest.stream.getAudioTracks()]);
          const options = { videoBitsPerSecond: 1000000 };
          if (mimeType) options.mimeType = mimeType;
          rec = new MediaRecorder(out, options);
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          rec.onstop = () => {
            const result = new Blob(chunks, { type: rec.mimeType || mimeType || "video/webm" });
            finish(result.size > 0 ? result : null);
          };
          const stopRec = () => {
            try {
              if (rec.state !== "inactive") rec.stop();
              else finish(null);
            } catch {
              finish(null);
            }
          };
          v.onended = stopRec;
          setTimeout(stopRec, (clipSeconds / speed + 6) * 1000);
          await ctx.resume();
          rec.start(250);
          v.playbackRate = speed;
          await v.play();
        } catch {
          finish(null);
        }
      };
      v.onerror = () => finish(null);
    } catch {
      finish(null);
    }
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
//   onCaptureMany([{ mediaUrl, mediaType: "image", thumbUrl }, ...]) (optional)
//       - when provided, the gallery picker allows selecting several photos
//         at once (like TikTok) and every gallery photo pick goes here, even
//         when only one photo is chosen. Videos still go through onCapture,
//         one at a time, and are never mixed with photos.
//   maxImages (optional, default 35) - cap for a multi-photo selection
//   onClose()                                     - user closed the camera
//   sound (optional)        { id, name, mediaUrl } - a sound to record with
//   onPickSound (optional)  - shows the "Add sound" pill and calls this when tapped
//   onRemoveSound (optional) - shows an x on the pill to remove the sound
export default function CameraCapture({
  onCapture,
  onCaptureMany,
  maxImages = 35,
  onClose,
  sound = null,
  onPickSound,
  onRemoveSound,
}) {
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
  const filterRafRef = useRef(null);
  const pinchRef = useRef(null);
  const zoomBusyRef = useRef(false);

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
  const [filterId, setFilterId] = useState("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [processing, setProcessing] = useState("");
  const [zoomCaps, setZoomCaps] = useState(null);
  const [zoom, setZoom] = useState(1);

  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const activeFilter = FILTERS.find((f) => f.id === filterId) || FILTERS[0];
  const isPhoto = mode.id === "photo";
  const hasSound = !!sound?.mediaUrl;
  const multiEnabled = typeof onCaptureMany === "function";
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
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max });
        setZoom(caps.zoom.min);
      } else {
        setZoomCaps(null);
        setZoom(1);
      }
    } catch {
      setTorchSupported(false);
      setZoomCaps(null);
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
      if (filterRafRef.current) cancelAnimationFrame(filterRafRef.current);
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

  function teardownFilter() {
    if (filterRafRef.current) cancelAnimationFrame(filterRafRef.current);
    filterRafRef.current = null;
  }

  // Draws the camera through the chosen filter onto a hidden canvas and
  // returns that canvas as a live video stream, so the filter is part of
  // the recording itself (not just the preview).
  function startFilterCanvas(css) {
    const video = videoRef.current;
    if (!video || !video.videoWidth || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      ctx.filter = css;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      filterRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return canvas.captureStream(30);
  }

  // Pinch the preview to zoom, when the camera supports it.
  async function applyZoom(value) {
    if (!zoomCaps) return;
    const next = Math.min(zoomCaps.max, Math.max(zoomCaps.min, value));
    setZoom(next);
    if (zoomBusyRef.current) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    zoomBusyRef.current = true;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next }] });
    } catch {}
    zoomBusyRef.current = false;
  }

  function touchDistance(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  function handlePinchStart(e) {
    if (e.touches.length === 2 && zoomCaps) {
      pinchRef.current = { dist: touchDistance(e.touches), zoom };
    }
  }

  function handlePinchMove(e) {
    if (!pinchRef.current || e.touches.length !== 2) return;
    applyZoom(pinchRef.current.zoom * (touchDistance(e.touches) / pinchRef.current.dist));
  }

  function handlePinchEnd() {
    pinchRef.current = null;
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
      const ctx = canvas.getContext("2d");
      if (activeFilter.css !== "none" && canvasFilterSupported()) ctx.filter = activeFilter.css;
      ctx.drawImage(video, 0, 0);
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
      const chosenSpeed = speed;

      let videoTracks = stream.getVideoTracks();
      let audioTracks = stream.getAudioTracks();

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
        audioTracks = dest.stream.getAudioTracks();
      }

      // A filter is baked into the recording by recording a filtered canvas
      // instead of the raw camera.
      if (activeFilter.css !== "none") {
        if (canvasFilterSupported()) {
          const filtered = startFilterCanvas(activeFilter.css);
          if (filtered) videoTracks = filtered.getVideoTracks();
        } else {
          showError("This browser can't save filters in videos, so this one records without it.");
        }
      }

      const recordStream = new MediaStream([...videoTracks, ...audioTracks]);

      const mimeType = pickMimeType();
      const options = { videoBitsPerSecond: mode.seconds > 60 ? 800000 : 1200000 };
      if (mimeType) options.mimeType = mimeType;
      const recorder = new MediaRecorder(recordStream, options);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        teardownSound();
        teardownFilter();
        if (discardRef.current) return;

        const thumb = frameFromVideo(videoRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "video/webm" });

        // Confirm the blob actually decodes into a real video before handing
        // it off — a clip lasting a fraction of a second is fine and should
        // go through just like it does on TikTok; only a truly empty/corrupt
        // recording (no frames at all) gets rejected here.
        const clipSeconds = (Date.now() - startedAtRef.current) / 1000;

        blobHasPlayableVideo(blob).then(async (ok) => {
          if (discardRef.current) return;
          if (!ok) {
            showError("That recording didn't save properly. Try again.");
            return;
          }

          let finalBlob = blob;
          if (chosenSpeed !== 1) {
            const secs = Math.max(1, Math.round(clipSeconds / chosenSpeed));
            setProcessing(`Applying ${chosenSpeed}x speed… about ${secs}s`);
            const retimed = await retimeBlob(blob, chosenSpeed, clipSeconds, mimeType);
            setProcessing("");
            if (discardRef.current) return;
            if (retimed) {
              finalBlob = retimed;
            } else {
              showError("This browser can't change speed, so this clip kept normal speed.");
            }
          }

          const reader = new FileReader();
          reader.onload = () => {
            setLastThumb(thumb || null);
            onCapture({ mediaUrl: reader.result, mediaType: "video", thumbUrl: thumb || null });
          };
          reader.readAsDataURL(finalBlob);
        });
      };

      recorder.start(250);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      setFiltersOpen(false);

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
      teardownFilter();
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
    if (processing) return;
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
    teardownFilter();
    onClose();
  }

  async function handleGalleryPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    try {
      // A video always goes through on its own (first video wins), like TikTok:
      // you can pick many photos, or one video, but not a mix.
      const videoFile = files.find((f) => f.type.startsWith("video/"));
      if (videoFile) {
        const dataUrl = await readAsDataUrl(videoFile);
        const thumb = await thumbFromVideoFile(dataUrl);
        setLastThumb(thumb);
        onCapture({ mediaUrl: dataUrl, mediaType: "video", thumbUrl: thumb });
        return;
      }

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      if (multiEnabled) {
        const limit = Math.max(1, maxImages);
        const chosen = imageFiles.slice(0, limit);
        // Promise.all keeps the order the user selected them in.
        const dataUrls = await Promise.all(chosen.map(readAsDataUrl));
        setLastThumb(dataUrls[0]);
        onCaptureMany(
          dataUrls.map((url) => ({ mediaUrl: url, mediaType: "image", thumbUrl: url }))
        );
        return;
      }

      // Single-select behavior (no onCaptureMany provided): use the first image.
      const dataUrl = await readAsDataUrl(imageFiles[0]);
      setLastThumb(dataUrl);
      onCapture({ mediaUrl: dataUrl, mediaType: "image", thumbUrl: dataUrl });
    } catch {
      showError("Couldn't load that from your gallery. Try again.");
    }
  }

  const progress = mode.seconds ? Math.min(1, elapsed / mode.seconds) : 0;
  const busy = recording || countdownLeft > 0 || !!processing;
  const elapsedSecs = Math.floor(elapsed);
  const elapsedLabel = `${Math.floor(elapsedSecs / 60)}:${String(elapsedSecs % 60).padStart(2, "0")}`;

  return (
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
            filter: activeFilter.css,
          }}
        />

        {/* Invisible layer that catches pinch-to-zoom on the preview. */}
        <div
          onTouchStart={handlePinchStart}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          onTouchCancel={handlePinchEnd}
          style={{ position: "absolute", inset: 0, zIndex: 1, touchAction: "none" }}
        />

        {/* Rule-of-thirds grid */}
        {gridOn && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
            {[33.33, 66.66].map((pos) => (
              <div key={`v${pos}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 1, background: "rgba(255,255,255,0.45)" }} />
            ))}
            {[33.33, 66.66].map((pos) => (
              <div key={`h${pos}`} style={{ position: "absolute", left: 0, right: 0, top: `${pos}%`, height: 1, background: "rgba(255,255,255,0.45)" }} />
            ))}
          </div>
        )}

        {zoomCaps && zoom > zoomCaps.min + 0.05 && (
          <div
            style={{
              position: "absolute", left: "50%", bottom: 250, transform: "translateX(-50%)", zIndex: 3,
              background: "rgba(0,0,0,0.55)", color: "white", fontSize: 13, fontWeight: 700,
              padding: "3px 12px", borderRadius: 14, pointerEvents: "none",
            }}
          >
            {(zoom / zoomCaps.min).toFixed(1)}x
          </div>
        )}

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
              icon={<Sparkles size={22} />}
              label={filterId === "none" ? "Filters" : activeFilter.label}
              active={filtersOpen || filterId !== "none"}
              onClick={() => setFiltersOpen((o) => !o)}
            />
            {!isPhoto && (
              <ToolButton
                icon={<Gauge size={22} />}
                label={speed === 1 ? "Speed" : `${speed}x`}
                active={speedOpen || speed !== 1}
                onClick={() => setSpeedOpen((o) => !o)}
              />
            )}
            <ToolButton
              icon={<Clock size={22} />}
              label={timerSeconds ? `${timerSeconds}s` : "Timer"}
              active={timerSeconds > 0}
              onClick={cycleTimer}
            />
            <ToolButton
              icon={<LayoutGrid size={22} />}
              label="Grid"
              active={gridOn}
              onClick={() => setGridOn((g) => !g)}
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

        {processing && (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 6, background: "rgba(0,0,0,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10,
              color: "white", fontSize: 15, fontWeight: 600, textAlign: "center", padding: 24,
            }}
          >
            <span>{processing}</span>
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>Keep this screen open</span>
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
          {speedOpen && !busy && !isPhoto && (
            <div
              style={{
                display: "flex", gap: 4, alignSelf: "center", background: "rgba(0,0,0,0.5)",
                borderRadius: 20, padding: 3,
              }}
            >
              {SPEEDS.map((sp) => (
                <button
                  key={sp.value}
                  type="button"
                  onClick={() => setSpeed(sp.value)}
                  style={{
                    border: "none", borderRadius: 17, padding: "6px 13px", fontSize: 13, fontWeight: 700,
                    background: speed === sp.value ? "white" : "transparent",
                    color: speed === sp.value ? "#111" : "white",
                  }}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          )}

          {filtersOpen && !busy && (
            <div
              style={{
                display: "flex", gap: 8, overflowX: "auto", width: "100%", padding: "0 14px",
                scrollbarWidth: "none", msOverflowStyle: "none",
              }}
            >
              {FILTERS.map((f) => {
                const selected = f.id === filterId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterId(f.id)}
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                      border: "none", borderRadius: 18, padding: "7px 13px",
                      background: selected ? "white" : "rgba(0,0,0,0.5)",
                      color: selected ? "#111" : "white", fontSize: 13, fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 12, height: 12, borderRadius: "50%", background: f.dot,
                        border: "1.5px solid rgba(255,255,255,0.7)",
                      }}
                    />
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

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
                aria-label={multiEnabled ? "Upload photos from gallery" : "Upload from gallery"}
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
          multiple={multiEnabled}
          onChange={handleGalleryPick}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
