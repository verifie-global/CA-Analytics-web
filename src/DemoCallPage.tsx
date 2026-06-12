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
  RoleMapping,
  TipsMessage,
  TranscriptMessage,
  TranscriptSegment,
} from "./realtimeAsrService";

type DemoTranscriptSegment = TranscriptSegment & {
  id: string;
  partial: boolean;
  updatedAt: number;
};

type AgentTipsState = {
  topic: string;
  customerIntent: string;
  tips: string[];
  roleMapping: Record<string, string>;
  roleConfidence: number | null;
  updatedAt: string | null;
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
  detectionMode: "mediapipe" | "local" | "none";
  attributes: FaceAttribute[];
};

type FaceStatsSummary = {
  framesAnalyzed: number;
  faceDetectedFrames: number;
  facePresenceRatio: number;
  averageFaceScore: number;
  dominantEmotion: string;
  emotionDistribution: Record<string, number>;
  averageAttributes: Record<string, number>;
  quality: {
    averageBrightness: number;
    averageMovement: number;
    averageCentering: number;
  };
  latest: FaceEmotionState;
};

type FaceStatsAccumulator = {
  framesAnalyzed: number;
  faceDetectedFrames: number;
  scoreTotal: number;
  emotionCounts: Record<string, number>;
  attributeTotals: Record<string, number>;
  latest: FaceEmotionState;
};

type StoredDemoSettings = {
  baseUrl?: string;
  accessToken?: string;
  companyId?: string;
};

type FinalizeDemoCallPayload = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  roleMapping: RoleMapping;
  diarizationDialogue: Array<{
    start: number;
    end: number;
    rawSpeaker?: string;
    role: string;
    speaker?: string;
    roleConfidence?: number;
    roleReason?: string;
    text: string;
  }>;
  transcriptText: string;
  videoStats: FaceStatsSummary;
  agentTipsHistory: AgentTipsState[];
};

type FinalizeDemoCallResponse = {
  ok?: boolean;
  conversationId?: string;
  sessionId?: string;
  dialogueSegmentsStored?: number;
};

const defaultSpeakerLabels: Record<string, string> = {
  SPEAKER_0: "Agent",
  SPEAKER_1: "Customer",
};

const SETTINGS_STORAGE_KEY = "ca-analytics-settings";
const DEFAULT_API_BASE_URL = "https://ca.satisfai.cx";

const emptyAgentTips: AgentTipsState = {
  topic: "",
  customerIntent: "",
  tips: [],
  roleMapping: {},
  roleConfidence: null,
  updatedAt: null,
};

const speakerEditorKeys = ["SPEAKER_0", "SPEAKER_1"] as const;

const emptyFaceEmotion: FaceEmotionState = {
  mood: "NO FACE",
  score: 0,
  detectionMode: "none",
  attributes: [
    { label: "Presence", value: 0 },
    { label: "Movement", value: 0 },
    { label: "Brightness", value: 0 },
    { label: "Warmth", value: 0 },
    { label: "Centering", value: 0 },
  ],
};

const createEmptyFaceStats = (): FaceStatsSummary => ({
  framesAnalyzed: 0,
  faceDetectedFrames: 0,
  facePresenceRatio: 0,
  averageFaceScore: 0,
  dominantEmotion: "NO FACE",
  emotionDistribution: {},
  averageAttributes: {
    presence: 0,
    movement: 0,
    brightness: 0,
    warmth: 0,
    centering: 0,
  },
  quality: {
    averageBrightness: 0,
    averageMovement: 0,
    averageCentering: 0,
  },
  latest: emptyFaceEmotion,
});

const createFaceStatsAccumulator = (): FaceStatsAccumulator => ({
  framesAnalyzed: 0,
  faceDetectedFrames: 0,
  scoreTotal: 0,
  emotionCounts: {},
  attributeTotals: {},
  latest: emptyFaceEmotion,
});

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

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const generateDemoSessionId = () =>
  `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeMetricKey = (label: string) => {
  const words = label
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return words
    .map((word, index) => (index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join("");
};

const summarizeFaceStats = (stats: FaceStatsAccumulator): FaceStatsSummary => {
  const detectedFrames = Math.max(0, stats.faceDetectedFrames);
  const emotionDistribution = Object.fromEntries(
    Object.entries(stats.emotionCounts).map(([emotion, count]) => [
      emotion,
      detectedFrames > 0 ? count / detectedFrames : 0,
    ]),
  );
  const dominantEmotion =
    Object.entries(stats.emotionCounts).sort((first, second) => second[1] - first[1])[0]?.[0] ??
    "NO FACE";
  const averageAttributes = Object.fromEntries(
    Object.entries(stats.attributeTotals).map(([attribute, total]) => [
      attribute,
      detectedFrames > 0 ? total / detectedFrames : 0,
    ]),
  );

  return {
    framesAnalyzed: stats.framesAnalyzed,
    faceDetectedFrames: detectedFrames,
    facePresenceRatio: stats.framesAnalyzed > 0 ? detectedFrames / stats.framesAnalyzed : 0,
    averageFaceScore: detectedFrames > 0 ? stats.scoreTotal / detectedFrames : 0,
    dominantEmotion,
    emotionDistribution,
    averageAttributes,
    quality: {
      averageBrightness: averageAttributes.brightness ?? 0,
      averageMovement: averageAttributes.movement ?? 0,
      averageCentering: averageAttributes.centering ?? 0,
    },
    latest: stats.latest,
  };
};

const readStoredDemoSettings = (): StoredDemoSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as StoredDemoSettings) : {};
  } catch {
    return {};
  }
};

const finalizeDemoCallSession = async (payload: FinalizeDemoCallPayload) => {
  const settings = readStoredDemoSettings();
  const baseUrl = trimSlash(settings.baseUrl || DEFAULT_API_BASE_URL);
  const conversationId = payload.sessionId;

  if (!settings.companyId) {
    throw new Error("Company ID is required before sending demo call analysis.");
  }

  if (!settings.accessToken) {
    throw new Error("Authorization token is required before sending demo call analysis.");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.accessToken}`,
  };

  const response = await fetch(
    `${baseUrl}/api/companies/${encodeURIComponent(settings.companyId)}/calls/${encodeURIComponent(
      conversationId,
    )}/finalize-transcript`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Demo call finalize failed with status ${response.status}`);
  }

  const finalizeResult = (await response.json()) as FinalizeDemoCallResponse;
  const detailResponse = await fetch(
    `${baseUrl}/api/companies/${encodeURIComponent(settings.companyId)}/calls/${encodeURIComponent(
      conversationId,
    )}`,
    { headers },
  );

  if (!detailResponse.ok) {
    const text = await detailResponse.text();
    throw new Error(text || `Unable to load finalized call with status ${detailResponse.status}`);
  }

  return {
    ...finalizeResult,
    conversationId: finalizeResult.conversationId || conversationId,
  };
};

const getSegmentRawSpeaker = (segment: TranscriptSegment) =>
  segment.raw_speaker ?? (segment.speaker?.startsWith("SPEAKER_") ? segment.speaker : undefined);

const getSegmentIdentitySpeaker = (segment: TranscriptSegment) =>
  getSegmentRawSpeaker(segment) ?? segment.speaker ?? segment.role ?? "UNKNOWN";

const getSegmentKey = (segment: TranscriptSegment) =>
  `${getSegmentIdentitySpeaker(segment)}:${segment.start.toFixed(2)}:${segment.end.toFixed(2)}`;

const mergeRoleMappings = (current: RoleMapping, incoming?: RoleMapping) =>
  incoming ? { ...current, ...incoming } : current;

const applyRoleMappingToSegment = (
  segment: DemoTranscriptSegment,
  roleMapping: RoleMapping,
): DemoTranscriptSegment => {
  const rawSpeaker = getSegmentRawSpeaker(segment);
  const mappedRole = rawSpeaker ? roleMapping[rawSpeaker] : undefined;

  if (!mappedRole) {
    return segment;
  }

  return {
    ...segment,
    role: mappedRole,
    speaker: segment.speaker?.startsWith("SPEAKER_") ? mappedRole : segment.speaker,
  };
};

const applyRoleMappingToSegments = (
  segments: DemoTranscriptSegment[],
  roleMapping: RoleMapping,
) => segments.map((segment) => applyRoleMappingToSegment(segment, roleMapping));

const mergeTranscriptMessage = (
  currentSegments: DemoTranscriptSegment[],
  message: TranscriptMessage,
  roleMapping: RoleMapping,
) => {
  const nextSegmentsById = new Map(currentSegments.map((segment) => [segment.id, segment]));

  message.segments.forEach((segment) => {
    const id = getSegmentKey(segment);
    const mergedSegment = {
      ...nextSegmentsById.get(id),
      ...segment,
      id,
      partial: message.type === "partial",
      updatedAt: Date.now(),
    };

    nextSegmentsById.set(id, applyRoleMappingToSegment(mergedSegment, roleMapping));
  });

  return applyRoleMappingToSegments([...nextSegmentsById.values()], roleMapping).sort((first, second) => {
    if (first.start !== second.start) {
      return first.start - second.start;
    }

    return first.end - second.end;
  });
};

const speakerEditorKeyFor = (speaker: string): (typeof speakerEditorKeys)[number] | null => {
  const normalized = speaker.trim().toUpperCase();
  if (normalized === "SPEAKER_0" || normalized === "AGENT") {
    return "SPEAKER_0";
  }

  if (normalized === "SPEAKER_1" || normalized === "CUSTOMER") {
    return "SPEAKER_1";
  }

  return null;
};

const getSegmentDisplayLabel = (segment: TranscriptSegment) =>
  segment.role ?? segment.speaker ?? segment.raw_speaker ?? "Unknown";

const formatPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(clamp01(value) * 100)}%`
    : "";

const createAgentTips = (message: TipsMessage): AgentTipsState => ({
  topic: message.topic || "general",
  customerIntent: message.customer_intent || "unknown",
  tips: Array.isArray(message.tips) ? message.tips : [],
  roleMapping: message.role_mapping || {},
  roleConfidence: message.role_confidence ?? null,
  updatedAt: new Date().toISOString(),
});

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
    return null;
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

function LocalFaceAnalyzer({
  active,
  onStatsChange,
}: {
  active: boolean;
  onStatsChange?: (stats: FaceStatsSummary) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousLumaFrameRef = useRef<Float32Array | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const faceStatsRef = useRef<FaceStatsAccumulator>(createFaceStatsAccumulator());
  const onStatsChangeRef = useRef(onStatsChange);
  const [analysis, setAnalysis] = useState<FaceEmotionState>(emptyFaceEmotion);
  const [cameraError, setCameraError] = useState("");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16 / 9");

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const resetFaceStats = useCallback(() => {
    faceStatsRef.current = createFaceStatsAccumulator();
    onStatsChangeRef.current?.(createEmptyFaceStats());
  }, []);

  const recordFaceStats = useCallback((emotion: FaceEmotionState, hasFace: boolean) => {
    const stats = faceStatsRef.current;
    stats.framesAnalyzed += 1;
    stats.latest = emotion;

    if (hasFace) {
      stats.faceDetectedFrames += 1;
      stats.scoreTotal += emotion.score;
      stats.emotionCounts[emotion.mood] = (stats.emotionCounts[emotion.mood] ?? 0) + 1;
      emotion.attributes.forEach((attribute) => {
        const key = normalizeMetricKey(attribute.label);
        stats.attributeTotals[key] = (stats.attributeTotals[key] ?? 0) + attribute.value;
      });
    }

    onStatsChangeRef.current?.(summarizeFaceStats(stats));
  }, []);

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

      const moodFontSize = Math.max(22, canvas.width * 0.018);
      const moodWidth = Math.min(440, canvas.width - safePad * 2);
      const moodHeight = Math.max(42, moodFontSize * 1.8);
      const moodX = clampNumber(mirroredX, safePad, canvas.width - moodWidth - safePad);
      const moodY = clampNumber(box.y - moodHeight - 10, safePad, canvas.height - moodHeight - safePad);
      context.fillStyle = "#050505";
      context.fillRect(moodX, moodY, moodWidth, moodHeight);
      context.fillStyle = "#ffffff";
      context.font = `${moodFontSize}px 'Input Mono', monospace`;
      context.fillText(`customerMood = "${emotion.mood}"`, moodX + 18, moodY + moodHeight * 0.66);

      const scoreWidth = Math.min(340, canvas.width - safePad * 2);
      const scoreHeight = 104;
      const preferredScoreX = mirroredX + box.width - scoreWidth + 34;
      const preferredScoreY = box.y + box.height - 70;
      const scoreX = clampNumber(preferredScoreX, safePad, canvas.width - scoreWidth - safePad);
      const scoreY = clampNumber(preferredScoreY, safePad, canvas.height - scoreHeight - safePad);
      context.fillStyle = "rgba(255, 255, 255, 0.94)";
      context.fillRect(scoreX, scoreY, scoreWidth, scoreHeight);
      context.fillStyle = "#050505";
      context.font = "18px 'Input Mono', monospace";
      context.fillText("FACE", scoreX + 22, scoreY + 32);
      context.fillText("ANALYSIS", scoreX + 22, scoreY + 54);
      context.fillText("SCORE", scoreX + 22, scoreY + 76);
      context.font = "62px 'Input Mono', monospace";
      context.fillText(`${Math.round(emotion.score * 100)}%`, scoreX + 158, scoreY + 72);
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
      resetFaceStats();
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
        const mediaPipeLandmarks = mediaPipeResult?.faceLandmarks[0];
        const box = mediaPipeLandmarks
          ? getLandmarkFaceBox(mediaPipeLandmarks, video)
          : faceLandmarkerRef.current
            ? null
            : detectLocalFaceBox(video, sampleCanvas, sampleContext);

        if (!box) {
          previousLumaFrameRef.current = null;
          setAnalysis(emptyFaceEmotion);
          recordFaceStats(emptyFaceEmotion, false);
          clearOverlay();
          return;
        }

        const mediaPipeEmotion = mediaPipeResult ? analyzeMediaPipeBlendshapes(mediaPipeResult) : null;
        const nextAnalysis = mediaPipeEmotion ?? analyzeAttributes(video, box);
        setAnalysis(nextAnalysis);
        recordFaceStats(nextAnalysis, true);
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
        } catch (error) {
          console.warn("MediaPipe Face Landmarker failed to load", error);
          faceLandmarkerRef.current = null;
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
      }
    };

    void startCamera();
    resetFaceStats();

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
  }, [active, analyzeAttributes, drawOverlay, recordFaceStats, resetFaceStats]);

  return (
    <div className="demo-face-analyzer">
      <div className="demo-video-frame" style={{ aspectRatio: videoAspectRatio }}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="demo-video"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
            }
          }}
        />
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
    </div>
  );
}

function DemoCallPage() {
  const asrService = useMemo(() => new RealtimeAsrService(), []);
  const [status, setStatus] = useState<RealtimeAsrStatus>("Disconnected");
  const [segments, setSegments] = useState<DemoTranscriptSegment[]>([]);
  const [speakerLabels, setSpeakerLabels] = useState<Record<string, string>>(defaultSpeakerLabels);
  const [agentTips, setAgentTips] = useState<AgentTipsState>(emptyAgentTips);
  const [agentTipsHistory, setAgentTipsHistory] = useState<AgentTipsState[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [completeMessage, setCompleteMessage] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);
  const roleMappingRef = useRef<RoleMapping>(defaultSpeakerLabels);
  const agentTipsRef = useRef<AgentTipsState>(emptyAgentTips);
  const videoStatsRef = useRef<FaceStatsSummary>(createEmptyFaceStats());
  const sessionIdRef = useRef(generateDemoSessionId());
  const sessionStartedAtIsoRef = useRef<string | null>(null);

  const refreshInputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      setInputDevices((devices ?? []).filter((device) => device.kind === "audioinput"));
    } catch {
      setInputDevices([]);
    }
  }, []);

  const handleFaceStatsChange = useCallback((nextStats: FaceStatsSummary) => {
    videoStatsRef.current = nextStats;
  }, []);

  useEffect(() => {
    const updateRoleMapping = (incoming?: RoleMapping) => {
      const nextRoleMapping = mergeRoleMappings(roleMappingRef.current, incoming);

      if (incoming) {
        roleMappingRef.current = nextRoleMapping;
        setSpeakerLabels(nextRoleMapping);
      }

      return nextRoleMapping;
    };

    const unsubscribeStatus = asrService.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus === "Recording" && recordingStartedAtMsRef.current == null) {
        recordingStartedAtMsRef.current = Date.now();
      }
      if (nextStatus === "Disconnected" || nextStatus === "Error") {
        recordingStartedAtMsRef.current = null;
      }
    });
    const unsubscribeTranscript = asrService.onTranscript((message) => {
      const nextRoleMapping = updateRoleMapping(message.role_mapping);
      setSegments((current) => mergeTranscriptMessage(current, message, nextRoleMapping));
    });
    const unsubscribeTips = asrService.onTips((message) => {
      const nextRoleMapping = updateRoleMapping(message.role_mapping);

      if (message.role_mapping) {
        setSegments((current) => applyRoleMappingToSegments(current, nextRoleMapping));
      }

      const previousAgentTips = agentTipsRef.current;
      const nextAgentTips = createAgentTips(message);
      agentTipsRef.current = nextAgentTips;
      setAgentTips(nextAgentTips);

      if (previousAgentTips.updatedAt) {
        setAgentTipsHistory((current) => [previousAgentTips, ...current].slice(0, 3));
      }
    });
    const unsubscribeError = asrService.onError((error) => {
      setErrorMessage(error.message);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeTranscript();
      unsubscribeTips();
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
      if (recordingStartedAtMsRef.current != null) {
        setElapsedSeconds(Math.floor((Date.now() - recordingStartedAtMsRef.current) / 1000));
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
    agentTipsRef.current = emptyAgentTips;
    setAgentTips(emptyAgentTips);
    setAgentTipsHistory([]);
    setErrorMessage("");
    setCompleteMessage("");
    setElapsedSeconds(0);
    recordingStartedAtMsRef.current = null;
    sessionStartedAtIsoRef.current = new Date().toISOString();
    sessionIdRef.current = generateDemoSessionId();
    videoStatsRef.current = createEmptyFaceStats();
    await asrService.startRecording({
      deviceId: selectedInputDeviceId || undefined,
      chunkMs: 250,
    });
    void refreshInputDevices();
  };

  const buildFinalizePayload = useCallback(
    (endedAt: Date): FinalizeDemoCallPayload => {
      const startedAt = sessionStartedAtIsoRef.current ?? endedAt.toISOString();
      const startedAtMs = new Date(startedAt).getTime();
      const endedAtMs = endedAt.getTime();
      const durationMs =
        Number.isFinite(startedAtMs) && endedAtMs >= startedAtMs
          ? endedAtMs - startedAtMs
          : Math.max(0, Math.round(Math.max(elapsedSeconds, segments.at(-1)?.end ?? 0) * 1000));
      const agentTipsHistoryPayload = [
        ...(agentTips.updatedAt ? [agentTips] : []),
        ...agentTipsHistory,
      ];

      return {
        sessionId: sessionIdRef.current,
        startedAt,
        endedAt: endedAt.toISOString(),
        durationMs,
        roleMapping: roleMappingRef.current,
        diarizationDialogue: segments.map((segment) => {
          const rawSpeaker = getSegmentRawSpeaker(segment);
          const role = getSegmentDisplayLabel(segment);

          return {
            start: segment.start,
            end: segment.end,
            rawSpeaker,
            role,
            speaker: segment.speaker,
            roleConfidence: segment.role_confidence,
            roleReason: segment.role_reason,
            text: segment.text,
          };
        }),
        transcriptText: segments.map((segment) => segment.text).join(" "),
        videoStats: videoStatsRef.current,
        agentTipsHistory: agentTipsHistoryPayload,
      };
    },
    [agentTips, agentTipsHistory, elapsedSeconds, segments],
  );

  const completeDemoCall = async () => {
    if (completeSubmitting) {
      return;
    }

    setCompleteSubmitting(true);
    setCompleteMessage("Sending session for analysis...");
    setErrorMessage("");

    try {
      const payload = buildFinalizePayload(new Date());

      if (canStop) {
        await asrService.stopRecording();
      }

      const result = await finalizeDemoCallSession(payload);
      const conversationId = result.conversationId || payload.sessionId;
      setCompleteMessage("Session sent for analysis.");
      window.location.href = `/?conversationId=${encodeURIComponent(conversationId)}`;
    } catch (error) {
      setCompleteMessage("");
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send demo call for analysis.",
      );
    } finally {
      setCompleteSubmitting(false);
    }
  };

  const customSpeakers = useMemo(
    () =>
      [...new Set(segments.map(getSegmentRawSpeaker).filter((speaker): speaker is string => Boolean(speaker)))].filter(
        (speaker) => !speakerEditorKeyFor(speaker),
      ),
    [segments],
  );
  const speakerEditorItems = useMemo(
    () => [...new Set([...speakerEditorKeys, ...Object.keys(speakerLabels), ...customSpeakers])],
    [customSpeakers, speakerLabels],
  );
  const lastSegmentEnd = segments.at(-1)?.end ?? elapsedSeconds;
  const canStart = status !== "Connecting" && status !== "Recording";
  const canStop = status === "Connecting" || status === "Connected" || status === "Recording";
  const faceAnalysisActive =
    status === "Connecting" || status === "Connected" || status === "Recording";
  const statusClass = status.toLowerCase();
  const assistStatus =
    status === "Recording"
      ? agentTips.updatedAt
        ? "Updated"
        : segments.length > 0
          ? "Generating tips"
          : "Listening"
      : agentTips.updatedAt
        ? "Updated"
        : "Listening";

  const handleSpeakerLabelChange = (speaker: string, value: string) => {
    const nextRoleMapping = {
      ...roleMappingRef.current,
      [speaker]: value.trim() || speaker,
    };
    roleMappingRef.current = nextRoleMapping;
    setSpeakerLabels(nextRoleMapping);
    setSegments((current) => applyRoleMappingToSegments(current, nextRoleMapping));
  };

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
          <LocalFaceAnalyzer active={faceAnalysisActive} onStatsChange={handleFaceStatsChange} />

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
                <button
                  type="button"
                  onClick={() => void completeDemoCall()}
                  disabled={!canStop || completeSubmitting}
                >
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
            <div className="demo-panel-actions">
              <button
                type="button"
                className={showDebug ? "is-active" : ""}
                onClick={() => setShowDebug((current) => !current)}
              >
                Debug
              </button>
              <span>{segments.length} segments</span>
            </div>
          </div>

          <div className="demo-speaker-labels">
            {speakerEditorItems.map((speaker) => (
              <label key={speaker}>
                <span>{speaker}</span>
                <input
                  value={speakerLabels[speaker] ?? speaker}
                  onChange={(event) => handleSpeakerLabelChange(speaker, event.target.value)}
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
                const label = getSegmentDisplayLabel(segment);
                const confidence = formatPercent(segment.role_confidence);
                const rawSpeaker = getSegmentRawSpeaker(segment);
                const roleClass = label.toLowerCase().includes("customer")
                  ? "customer"
                  : label.toLowerCase().includes("unknown")
                    ? "unknown"
                    : "agent";

                return (
                  <article
                    key={segment.id}
                    className={`demo-transcript-card demo-role-${roleClass} ${
                      segment.partial ? "is-partial" : ""
                    }`}
                  >
                    <div>
                      <strong>
                        {label}
                        {showDebug && confidence ? ` ${confidence}` : ""}
                      </strong>
                      {segment.partial ? <span>live</span> : null}
                    </div>
                    <p>{segment.text}</p>
                    {showDebug ? (
                      <small>
                        {rawSpeaker ? `raw: ${rawSpeaker}` : "raw: unknown"}
                        {segment.role_reason ? ` / reason: ${segment.role_reason}` : ""}
                      </small>
                    ) : null}
                    <time>{formatTimeRange(segment.start, segment.end)}</time>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="demo-panel demo-tips-panel">
          <div className="demo-panel-head">
            <h2>Agent Assist</h2>
            <span>{assistStatus}</span>
          </div>

          {agentTips.updatedAt ? (
            <div className="demo-agent-assist">
              <div className="demo-assist-meta">
                <span>Topic</span>
                <strong>{agentTips.topic}</strong>
                <span>Customer intent</span>
                <strong>{agentTips.customerIntent}</strong>
                {formatPercent(agentTips.roleConfidence ?? undefined) ? (
                  <>
                    <span>Role confidence</span>
                    <strong>{formatPercent(agentTips.roleConfidence ?? undefined)}</strong>
                  </>
                ) : null}
              </div>

              <ol className="demo-tips-list">
                {agentTips.tips.length > 0 ? (
                  agentTips.tips.map((tip, index) => (
                    <li key={`${agentTips.updatedAt}-${index}`}>{tip}</li>
                  ))
                ) : (
                  <li>No tips returned yet.</li>
                )}
              </ol>

              <small className="demo-assist-updated">
                Updated: {new Date(agentTips.updatedAt).toLocaleTimeString()}
              </small>

              {agentTipsHistory.length > 0 ? (
                <details className="demo-tips-history">
                  <summary>Last {agentTipsHistory.length} updates</summary>
                  <div>
                    {agentTipsHistory.map((block) => (
                      <article key={block.updatedAt ?? block.topic}>
                        <strong>{block.topic || "Unknown topic"}</strong>
                        <span>
                          {block.updatedAt
                            ? new Date(block.updatedAt).toLocaleTimeString()
                            : "Unknown time"}
                        </span>
                        <ol>
                          {block.tips.map((tip, index) => (
                            <li key={`${block.updatedAt}-${index}`}>{tip}</li>
                          ))}
                        </ol>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="demo-empty-assist">
              <strong>{status === "Recording" ? "Listening" : "No tips yet"}</strong>
              <p>Waiting for tips...</p>
            </div>
          )}
        </section>
      </main>

      <footer className="demo-call-footer">
        {completeMessage ? <span className="demo-complete-status">{completeMessage}</span> : null}
        <button type="button" onClick={() => void completeDemoCall()} disabled={completeSubmitting}>
          {completeSubmitting ? "Sending..." : "Complete"}
        </button>
      </footer>
    </div>
  );
}

export default DemoCallPage;
