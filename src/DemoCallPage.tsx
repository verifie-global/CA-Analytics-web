import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type Category,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import satisfaiEye from "./assets/satisfai-eye.svg";
import {
  RealtimeAsrService,
  RealtimeAsrStatus,
  TranscriptMessage,
  TranscriptSegment,
} from "./realtimeAsrService";

type DemoTranscriptSegment = TranscriptSegment & {
  id: string;
  partial: boolean;
  updatedAt: number;
};

type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FaceAttribute = {
  label: string;
  value: number;
};

type FaceEmotionState = {
  mood: string;
  score: number;
  detectionMode: "mediapipe" | "local";
  attributes: FaceAttribute[];
};

const defaultSpeakerLabels: Record<string, string> = {
  SPEAKER_0: "Agent",
  SPEAKER_1: "Customer",
};

const emptyFaceEmotion: FaceEmotionState = {
  mood: "NATURAL",
  score: 0,
  detectionMode: "local",
  attributes: [
    { label: "Presence", value: 0 },
    { label: "Movement", value: 0 },
    { label: "Brightness", value: 0 },
  ],
};

const waveformBars = [
  12, 16, 20, 24, 18, 34, 38, 22, 18, 15, 14, 16, 18, 26, 36, 32, 28, 18, 22, 34,
  48, 42, 54, 38, 62, 74, 88, 58, 44, 22, 18, 18, 20, 22, 26, 34, 46, 30, 20, 18,
  16, 14, 14, 16, 24, 28, 18, 14, 14, 14, 14, 14, 14, 14,
];

const formatSeconds = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const formatTimeRange = (start: number, end: number) =>
  `${formatSeconds(start)}-${formatSeconds(end)}`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
const FACE_LANDMARKER_MODEL_PATH = "/mediapipe/models/face_landmarker.task";

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getSegmentKey = (segment: TranscriptSegment) =>
  `${segment.speaker}:${segment.start.toFixed(2)}:${segment.end.toFixed(2)}`;

const mergeTranscriptMessage = (
  currentSegments: DemoTranscriptSegment[],
  message: TranscriptMessage,
) => {
  const nextSegmentsById = new Map(currentSegments.map((segment) => [segment.id, segment]));

  message.segments.forEach((segment) => {
    const id = getSegmentKey(segment);
    nextSegmentsById.set(id, {
      ...nextSegmentsById.get(id),
      ...segment,
      id,
      partial: message.type === "partial",
      updatedAt: Date.now(),
    });
  });

  return [...nextSegmentsById.values()].sort((first, second) => {
    if (first.start !== second.start) {
      return first.start - second.start;
    }

    return first.end - second.end;
  });
};

const getDefaultSpeakerLabel = (speaker: string) => defaultSpeakerLabels[speaker] ?? speaker;

const getLandmarkFaceBox = (landmarks: NormalizedLandmark[], video: HTMLVideoElement): FaceBox => {
  const xs = landmarks.map((landmark) => landmark.x).filter(Number.isFinite);
  const ys = landmarks.map((landmark) => landmark.y).filter(Number.isFinite);

  if (xs.length === 0 || ys.length === 0) {
    return getDefaultFaceBox(video);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paddingX = (maxX - minX) * 0.08;
  const paddingY = (maxY - minY) * 0.12;

  return containFaceBox(
    {
      x: (minX - paddingX) * video.videoWidth,
      y: (minY - paddingY) * video.videoHeight,
      width: (maxX - minX + paddingX * 2) * video.videoWidth,
      height: (maxY - minY + paddingY * 2) * video.videoHeight,
    },
    video,
  );
};

const categoriesToScores = (categories: Category[]) => {
  const scores = new Map<string, number>();
  categories.forEach((category) => {
    scores.set(category.categoryName, clamp01(category.score));
  });
  return scores;
};

const averageScore = (scores: Map<string, number>, names: string[]) =>
  names.reduce((total, name) => total + (scores.get(name) ?? 0), 0) / names.length;

const analyzeMediaPipeBlendshapes = (result: FaceLandmarkerResult): FaceEmotionState | null => {
  const blendshapeCategories = result.faceBlendshapes[0]?.categories;
  if (!blendshapeCategories || blendshapeCategories.length === 0) {
    return null;
  }

  const scores = categoriesToScores(blendshapeCategories);
  const smile = averageScore(scores, ["mouthSmileLeft", "mouthSmileRight"]);
  const frown = averageScore(scores, ["mouthFrownLeft", "mouthFrownRight"]);
  const browRaise = averageScore(scores, ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"]);
  const browFurrow = averageScore(scores, ["browDownLeft", "browDownRight"]);
  const eyeWide = averageScore(scores, ["eyeWideLeft", "eyeWideRight"]);
  const eyeSquint = averageScore(scores, ["eyeSquintLeft", "eyeSquintRight"]);
  const jawOpen = scores.get("jawOpen") ?? 0;
  const lipPress = averageScore(scores, ["mouthPressLeft", "mouthPressRight"]);
  const cheekRaise = averageScore(scores, ["cheekSquintLeft", "cheekSquintRight"]);
  const mouthPucker = scores.get("mouthPucker") ?? 0;

  const emotionScores = [
    {
      mood: "POSITIVE",
      value: clamp01(smile * 0.82 + cheekRaise * 0.28 - frown * 0.34 - lipPress * 0.12),
    },
    {
      mood: "SURPRISED",
      value: clamp01(jawOpen * 0.52 + eyeWide * 0.34 + browRaise * 0.28 - lipPress * 0.16),
    },
    {
      mood: "TENSE",
      value: clamp01(browFurrow * 0.42 + eyeSquint * 0.28 + lipPress * 0.24 + mouthPucker * 0.18 - smile * 0.18),
    },
    {
      mood: "CONCERNED",
      value: clamp01(frown * 0.44 + browRaise * 0.22 + browFurrow * 0.2 - smile * 0.22),
    },
  ].sort((first, second) => second.value - first.value);

  const winner = emotionScores[0];
  const mood = winner.value > 0.22 ? winner.mood : "NATURAL";
  const score = mood === "NATURAL" ? clamp01(0.4 + (1 - Math.max(smile, frown, browFurrow, jawOpen)) * 0.26) : winner.value;

  return {
    mood,
    score,
    detectionMode: "mediapipe",
    attributes: [
      { label: "Smile", value: smile },
      { label: "Brow raise", value: browRaise },
      { label: "Brow furrow", value: browFurrow },
      { label: "Eye open", value: eyeWide },
      { label: "Eye squint", value: eyeSquint },
      { label: "Jaw open", value: jawOpen },
      { label: "Frown", value: frown },
    ],
  };
};

const containFaceBox = (box: FaceBox, video: HTMLVideoElement): FaceBox => {
  const x = Math.max(0, Math.min(video.videoWidth - 1, box.x));
  const y = Math.max(0, Math.min(video.videoHeight - 1, box.y));
  const width = Math.max(1, Math.min(video.videoWidth - x, box.width));
  const height = Math.max(1, Math.min(video.videoHeight - y, box.height));
  return { x, y, width, height };
};

const getDefaultFaceBox = (video: HTMLVideoElement): FaceBox => ({
  x: video.videoWidth * 0.24,
  y: video.videoHeight * 0.14,
  width: video.videoWidth * 0.52,
  height: video.videoHeight * 0.68,
});

const isLikelySkinPixel = (red: number, green: number, blue: number) => {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return (
    red > 65 &&
    green > 35 &&
    blue > 20 &&
    max - min > 12 &&
    red > green * 1.04 &&
    red > blue * 1.18
  );
};

const detectLocalFaceBox = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) => {
  const sampleWidth = 96;
  const sampleHeight = Math.max(54, Math.round((video.videoHeight / video.videoWidth) * sampleWidth));
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  context.drawImage(video, 0, 0, sampleWidth, sampleHeight);

  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let minX = sampleWidth;
  let minY = sampleHeight;
  let maxX = 0;
  let maxY = 0;
  let matchCount = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      if (isLikelySkinPixel(pixels[index], pixels[index + 1], pixels[index + 2])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        matchCount += 1;
      }
    }
  }

  const matchRatio = matchCount / (sampleWidth * sampleHeight);
  if (matchRatio < 0.012 || maxX <= minX || maxY <= minY) {
    return getDefaultFaceBox(video);
  }

  const scaleX = video.videoWidth / sampleWidth;
  const scaleY = video.videoHeight / sampleHeight;
  const paddingX = (maxX - minX) * 0.42;
  const paddingTop = (maxY - minY) * 0.72;
  const paddingBottom = (maxY - minY) * 0.28;

  return containFaceBox(
    {
      x: (minX - paddingX) * scaleX,
      y: (minY - paddingTop) * scaleY,
      width: (maxX - minX + paddingX * 2) * scaleX,
      height: (maxY - minY + paddingTop + paddingBottom) * scaleY,
    },
    video,
  );
};

const inferMood = ({
  brightness,
  centeredness,
  contrast,
  motion,
  presence,
  warmth,
}: {
  brightness: number;
  centeredness: number;
  contrast: number;
  motion: number;
  presence: number;
  warmth: number;
}) => {
  const positivity = clamp01(
    brightness * 0.34 + warmth * 0.22 + centeredness * 0.24 + (1 - motion) * 0.2,
  );
  const score = clamp01(0.22 + positivity * 0.48 + presence * 0.24 + contrast * 0.12 - motion * 0.18);

  if (motion > 0.24 && contrast > 0.28) {
    return { mood: "TENSE", score };
  }

  if (positivity > 0.65 && motion < 0.18) {
    return { mood: "POSITIVE", score };
  }

  if (centeredness > 0.72 && motion < 0.12) {
    return { mood: "FOCUSED", score };
  }

  return { mood: "NATURAL", score };
};

function LocalFaceAnalyzer({ active }: { active: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousLumaFrameRef = useRef<Float32Array | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [analysis, setAnalysis] = useState<FaceEmotionState>(emptyFaceEmotion);
  const [cameraError, setCameraError] = useState("");
  const [cameraNotice, setCameraNotice] = useState("");

  const drawOverlay = useCallback(
    (box: FaceBox, emotion: FaceEmotionState, video: HTMLVideoElement) => {
      const canvas = overlayCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const mirroredX = canvas.width - box.x - box.width;
      const safePad = Math.max(10, canvas.width * 0.012);
      context.strokeStyle = "#4c96f8";
      context.lineWidth = Math.max(4, canvas.width * 0.006);
      context.strokeRect(mirroredX, box.y, box.width, box.height);

      const moodWidth = Math.min(280, canvas.width - safePad * 2);
      const moodHeight = 28;
      const moodX = clampNumber(mirroredX, safePad, canvas.width - moodWidth - safePad);
      const moodY = clampNumber(box.y - moodHeight - 6, safePad, canvas.height - moodHeight - safePad);
      context.fillStyle = "#050505";
      context.fillRect(moodX, moodY, moodWidth, moodHeight);
      context.fillStyle = "#ffffff";
      context.font = "15px 'Input Mono', monospace";
      context.fillText(`customerMood = "${emotion.mood}"`, moodX + 14, moodY + 19);

      const scoreWidth = Math.min(224, canvas.width - safePad * 2);
      const scoreHeight = 64;
      const preferredScoreX = mirroredX + box.width - scoreWidth + 34;
      const preferredScoreY = box.y + box.height - 48;
      const scoreX = clampNumber(preferredScoreX, safePad, canvas.width - scoreWidth - safePad);
      const scoreY = clampNumber(preferredScoreY, safePad, canvas.height - scoreHeight - safePad);
      context.fillStyle = "rgba(255, 255, 255, 0.94)";
      context.fillRect(scoreX, scoreY, scoreWidth, scoreHeight);
      context.fillStyle = "#050505";
      context.font = "11px 'Input Mono', monospace";
      context.fillText("FACE", scoreX + 18, scoreY + 20);
      context.fillText("ANALYSIS", scoreX + 18, scoreY + 34);
      context.fillText("SCORE", scoreX + 18, scoreY + 48);
      context.font = "40px 'Input Mono', monospace";
      context.fillText(`${Math.round(emotion.score * 100)}%`, scoreX + 102, scoreY + 44);
    },
    [],
  );

  const analyzeAttributes = useCallback((video: HTMLVideoElement, rawBox: FaceBox) => {
    const canvas = sampleCanvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) {
      return emptyFaceEmotion;
    }

    const box = containFaceBox(rawBox, video);
    canvas.width = 64;
    canvas.height = 64;
    context.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lumaTotal = 0;
    let redTotal = 0;
    let blueTotal = 0;
    const lumaFrame = new Float32Array(canvas.width * canvas.height);

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const pixelIndex = index / 4;
      lumaFrame[pixelIndex] = luma;
      lumaTotal += luma;
      redTotal += red;
      blueTotal += blue;
    }

    const pixelCount = lumaFrame.length;
    const meanLuma = lumaTotal / pixelCount;
    let variance = 0;
    let motionTotal = 0;
    const previousFrame = previousLumaFrameRef.current;

    for (let index = 0; index < pixelCount; index += 1) {
      variance += (lumaFrame[index] - meanLuma) ** 2;
      if (previousFrame) {
        motionTotal += Math.abs(lumaFrame[index] - previousFrame[index]);
      }
    }

    previousLumaFrameRef.current = lumaFrame;

    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;
    const distanceFromCenter = Math.hypot(
      (faceCenterX - video.videoWidth / 2) / (video.videoWidth / 2),
      (faceCenterY - video.videoHeight / 2) / (video.videoHeight / 2),
    );
    const faceAreaRatio = (box.width * box.height) / (video.videoWidth * video.videoHeight);

    const brightness = clamp01(meanLuma / 255);
    const contrast = clamp01(Math.sqrt(variance / pixelCount) / 80);
    const motion = clamp01(previousFrame ? motionTotal / pixelCount / 40 : 0);
    const warmth = clamp01((redTotal / pixelCount - blueTotal / pixelCount + 255) / 510);
    const centeredness = clamp01(1 - distanceFromCenter / 1.1);
    const presence = clamp01(faceAreaRatio / 0.24);
    const mood = inferMood({ brightness, centeredness, contrast, motion, presence, warmth });

    return {
      mood: mood.mood,
      score: mood.score,
      detectionMode: "local" as const,
      attributes: [
        { label: "Presence", value: presence },
        { label: "Movement", value: motion },
        { label: "Brightness", value: brightness },
        { label: "Warmth", value: warmth },
        { label: "Centering", value: centeredness },
      ],
    };
  }, []);

  useEffect(() => {
    if (!active) {
      previousLumaFrameRef.current = null;
      setAnalysis(emptyFaceEmotion);
      setCameraError("");
      setCameraNotice("");
      return undefined;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timerId: number | null = null;

    const clearOverlay = () => {
      const canvas = overlayCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const scheduleAnalysis = () => {
      timerId = window.setTimeout(() => {
        void analyzeFrame();
      }, 250);
    };

    const analyzeFrame = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.videoWidth === 0 || video.videoHeight === 0) {
        if (!stopped) {
          scheduleAnalysis();
        }
        return;
      }

      try {
        const sampleCanvas = sampleCanvasRef.current;
        const sampleContext = sampleCanvas?.getContext("2d", { willReadFrequently: true });
        if (!sampleCanvas || !sampleContext) {
          return;
        }

        const mediaPipeResult = faceLandmarkerRef.current?.detectForVideo(video, performance.now());
        const mediaPipeEmotion = mediaPipeResult ? analyzeMediaPipeBlendshapes(mediaPipeResult) : null;
        const box =
          mediaPipeResult?.faceLandmarks[0]
            ? getLandmarkFaceBox(mediaPipeResult.faceLandmarks[0], video)
            : detectLocalFaceBox(video, sampleCanvas, sampleContext);
        const nextAnalysis = mediaPipeEmotion ?? analyzeAttributes(video, box);
        setAnalysis(nextAnalysis);
        drawOverlay(containFaceBox(box, video), nextAnalysis, video);
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Local face analysis failed.");
      } finally {
        if (!stopped) {
          scheduleAnalysis();
        }
      }
    };

    const loadFaceLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL_PATH,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputFaceBlendshapes: true,
      });
    };

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera capture is not supported in this browser.");
        }

        try {
          faceLandmarkerRef.current = await loadFaceLandmarker();
          setCameraNotice("MediaPipe Face Landmarker active. Emotion is based on facial blendshapes.");
        } catch (error) {
          console.warn("MediaPipe Face Landmarker failed to load", error);
          faceLandmarkerRef.current = null;
          setCameraNotice("MediaPipe unavailable. Using local camera-frame fallback.");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        setCameraError("");
        scheduleAnalysis();
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Unable to start camera.");
        setCameraNotice("");
      }
    };

    void startCamera();

    return () => {
      stopped = true;
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
      stream?.getTracks().forEach((track) => track.stop());
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      previousLumaFrameRef.current = null;
      clearOverlay();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [active, analyzeAttributes, drawOverlay]);

  return (
    <div className="demo-face-analyzer">
      <div className="demo-video-frame">
        <video ref={videoRef} muted playsInline className="demo-video" />
        <canvas ref={overlayCanvasRef} className="demo-video-overlay" aria-hidden="true" />
        <canvas ref={sampleCanvasRef} className="demo-sample-canvas" aria-hidden="true" />
        {!active ? (
          <div className="demo-video-placeholder">
            <span>LOCAL FACE ANALYSIS</span>
          </div>
        ) : null}
      </div>

      <div className="demo-face-footer">
        <div>
          <span>FACE ATTRIBUTES</span>
          <strong>{analysis.mood}</strong>
        </div>
        <strong>{Math.round(analysis.score * 100)}%</strong>
      </div>

      <div className="demo-attribute-grid">
        {analysis.attributes.map((attribute) => (
          <div key={attribute.label} className="demo-attribute">
            <span>{attribute.label}</span>
            <div>
              <i style={{ width: `${Math.round(attribute.value * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {cameraError ? <p className="demo-inline-error">{cameraError}</p> : null}
      {!cameraError && cameraNotice ? <p className="demo-inline-note">{cameraNotice}</p> : null}
      <span className="demo-detector-mode">
        {analysis.detectionMode === "mediapipe" ? "MEDIAPIPE BLENDSHAPES" : "LOCAL FACE ANALYSIS"}
      </span>
    </div>
  );
}

function DemoCallPage() {
  const asrService = useMemo(() => new RealtimeAsrService(), []);
  const [status, setStatus] = useState<RealtimeAsrStatus>("Disconnected");
  const [segments, setSegments] = useState<DemoTranscriptSegment[]>([]);
  const [speakerLabels, setSpeakerLabels] = useState<Record<string, string>>(defaultSpeakerLabels);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sessionStartedAtRef = useRef<number | null>(null);
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);

  const refreshInputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      setInputDevices((devices ?? []).filter((device) => device.kind === "audioinput"));
    } catch {
      setInputDevices([]);
    }
  }, []);

  useEffect(() => {
    const unsubscribeStatus = asrService.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus === "Recording" && sessionStartedAtRef.current == null) {
        sessionStartedAtRef.current = Date.now();
      }
      if (nextStatus === "Disconnected" || nextStatus === "Error") {
        sessionStartedAtRef.current = null;
      }
    });
    const unsubscribeTranscript = asrService.onTranscript((message) => {
      setSegments((current) => mergeTranscriptMessage(current, message));
      setSpeakerLabels((current) => {
        const nextLabels = { ...current };
        message.segments.forEach((segment) => {
          if (!nextLabels[segment.speaker]) {
            nextLabels[segment.speaker] = getDefaultSpeakerLabel(segment.speaker);
          }
        });
        return nextLabels;
      });
    });
    const unsubscribeError = asrService.onError((error) => {
      setErrorMessage(error.message);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeTranscript();
      unsubscribeError();
      void asrService.stopRecording();
    };
  }, [asrService]);

  useEffect(() => {
    void refreshInputDevices();

    navigator.mediaDevices?.addEventListener?.("devicechange", refreshInputDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshInputDevices);
    };
  }, [refreshInputDevices]);

  useEffect(() => {
    if (status !== "Recording") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      if (sessionStartedAtRef.current != null) {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      }
    }, 250);

    return () => window.clearInterval(timerId);
  }, [status]);

  useEffect(() => {
    transcriptPanelRef.current?.scrollTo({
      top: transcriptPanelRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [segments]);

  const startRecording = async () => {
    setSegments([]);
    setErrorMessage("");
    setElapsedSeconds(0);
    sessionStartedAtRef.current = null;
    await asrService.startRecording({
      deviceId: selectedInputDeviceId || undefined,
      chunkMs: 250,
    });
    void refreshInputDevices();
  };

  const stopRecording = async () => {
    await asrService.stopRecording();
  };

  const knownSpeakers = useMemo(
    () => [...new Set([...Object.keys(speakerLabels), ...segments.map((segment) => segment.speaker)])],
    [segments, speakerLabels],
  );
  const transcriptText = segments.map((segment) => segment.text).join(" ").toLowerCase();
  const lastSegmentEnd = segments.at(-1)?.end ?? elapsedSeconds;
  const canStart = status !== "Connecting" && status !== "Recording";
  const canStop = status === "Connecting" || status === "Connected" || status === "Recording";
  const faceAnalysisActive =
    status === "Connecting" || status === "Connected" || status === "Recording";
  const statusClass = status.toLowerCase();
  const tips = [
    {
      label: "Acknowledge the customer's frustration.",
      done: /frustrat|angry|incompetent|upset|delay/.test(transcriptText),
      tone: "cream",
    },
    {
      label: "Apologize for the delay and inconvenience.",
      done: /sorry|apolog|inconvenience/.test(transcriptText),
      tone: "purple",
    },
    {
      label: "Confirm the current status of the request.",
      done: /status|request|application|case/.test(transcriptText),
      tone: "pink",
    },
    {
      label: "Explain the reason for the delivery delay and provide a realistic timeline.",
      done: /tomorrow|timeline|delivery|post office|sent/.test(transcriptText),
      tone: "cream",
    },
    {
      label: "Check previous correspondence before requesting information again.",
      done: /email|correspondence|already/.test(transcriptText),
      tone: "purple",
    },
    {
      label: "Confirm whether the response was sent successfully.",
      done: /sent|success|received/.test(transcriptText),
      tone: "pink",
    },
    {
      label: "Ask if the customer prefers another communication channel.",
      done: /call|phone|email|message/.test(transcriptText),
      tone: "cream",
    },
  ];

  return (
    <div className="demo-call-shell">
      <header className="demo-call-header">
        <a className="demo-brand" href="/" aria-label="Back to dashboard">
          <img src={satisfaiEye} alt="" />
          <div>
            <h1>Decoding<br />the moment...</h1>
          </div>
        </a>
        <a className="demo-close-link" href="/" aria-label="Close demo call">
          <span />
          <span />
        </a>
      </header>

      <main className="demo-call-grid">
        <section className="demo-panel demo-face-panel">
          <LocalFaceAnalyzer active={faceAnalysisActive} />

          <div className="demo-live-control">
            <div className="demo-live-head">
              <h2>Real Time Conversation</h2>
              <span className={`demo-status-pill status-${statusClass}`}>{status}</span>
            </div>

            <div className={`demo-waveform ${status === "Recording" ? "is-recording" : ""}`} aria-hidden="true">
              {waveformBars.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${(index % 9) * 80}ms`,
                  }}
                />
              ))}
            </div>

            <div className="demo-control-row">
              <span className="demo-time-badge">
                {formatSeconds(elapsedSeconds)}-{formatSeconds(lastSegmentEnd)}
              </span>
              <div className="demo-record-actions">
                <button type="button" onClick={() => void startRecording()} disabled={!canStart}>
                  Start
                </button>
                <button type="button" onClick={() => void stopRecording()} disabled={!canStop}>
                  Stop
                </button>
              </div>
              <span className="demo-audio-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M4 10v4h4l5 4V6l-5 4H4Zm12-1.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>

            <label className="demo-input-select">
              <span>Microphone</span>
              <select
                value={selectedInputDeviceId}
                onChange={(event) => setSelectedInputDeviceId(event.target.value)}
                disabled={status === "Recording" || status === "Connecting"}
              >
                <option value="">Default input</option>
                {inputDevices.map((device, index) => (
                  <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            {errorMessage ? <p className="demo-inline-error">{errorMessage}</p> : null}
          </div>
        </section>

        <section className="demo-panel demo-diarization-panel">
          <div className="demo-panel-head">
            <h2>Diarization</h2>
            <span>{segments.length} segments</span>
          </div>

          <div className="demo-speaker-labels">
            {knownSpeakers.map((speaker) => (
              <label key={speaker}>
                <span>{speaker}</span>
                <input
                  value={speakerLabels[speaker] ?? speaker}
                  onChange={(event) =>
                    setSpeakerLabels((current) => ({
                      ...current,
                      [speaker]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div ref={transcriptPanelRef} className="demo-transcript-list">
            {segments.length === 0 ? (
              <div className="demo-empty-transcript">
                <strong>{status === "Recording" ? "Listening..." : "No conversation yet"}</strong>
              </div>
            ) : (
              segments.map((segment) => {
                const label = speakerLabels[segment.speaker] ?? segment.speaker;
                const roleClass =
                  label.toLowerCase().includes("customer") || segment.speaker === "SPEAKER_1"
                    ? "customer"
                    : "agent";

                return (
                  <article
                    key={segment.id}
                    className={`demo-transcript-card demo-role-${roleClass} ${
                      segment.partial ? "is-partial" : ""
                    }`}
                  >
                    <div>
                      <strong>{label}</strong>
                      {segment.partial ? <span>live</span> : null}
                    </div>
                    <p>{segment.text}</p>
                    <time>{formatTimeRange(segment.start, segment.end)}</time>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="demo-panel demo-tips-panel">
          <div className="demo-panel-head">
            <h2>CX Assistant Tips</h2>
            <span>{tips.filter((tip) => tip.done).length}/{tips.length}</span>
          </div>

          <div className="demo-tips-list">
            {tips.map((tip) => (
              <article key={tip.label} className={`demo-tip demo-tip-${tip.tone}`}>
                <span className={tip.done ? "is-done" : ""}>{tip.done ? "OK" : ""}</span>
                <p>{tip.label}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="demo-call-footer">
        <a href="/">Complete</a>
      </footer>
    </div>
  );
}

export default DemoCallPage;
