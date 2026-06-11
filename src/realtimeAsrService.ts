export type RealtimeAsrStatus =
  | "Connecting"
  | "Connected"
  | "Recording"
  | "Disconnected"
  | "Error";

export type Role = "Agent" | "Customer" | "Unknown" | string;

export type RoleMapping = Record<string, Role>;

export type TranscriptSegment = {
  start: number;
  end: number;
  raw_speaker?: string;
  role?: Role;
  speaker?: Role;
  role_confidence?: number;
  role_reason?: string;
  text: string;
};

export type TranscriptMessage = {
  type: "partial";
  offset?: number;
  segments: TranscriptSegment[];
  role_mapping?: RoleMapping;
};

export type TipsMessage = {
  type: "tips";
  offset?: number;
  topic?: string;
  customer_intent?: string;
  tips: string[];
  role_mapping?: RoleMapping;
  role_confidence?: number;
};

type RealtimeAsrOptions = {
  deviceId?: string;
  chunkMs?: number;
  url?: string;
};

type AudioContextConstructor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor;
  }
}

const DEFAULT_STREAM_URL = "wss://demostt.satisfai.cx/stream";
const TARGET_SAMPLE_RATE = 16000;
const DEFAULT_CHUNK_MS = 250;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const MAX_BUFFERED_BYTES = 1_000_000;

export function floatTo16BitPCM(float32Array: Float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

const resampleTo16Khz = (source: Float32Array, sourceSampleRate: number) => {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return source;
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(source.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const previousIndex = Math.floor(sourceIndex);
    const nextIndex = Math.min(previousIndex + 1, source.length - 1);
    const interpolation = sourceIndex - previousIndex;
    output[index] =
      source[previousIndex] * (1 - interpolation) + source[nextIndex] * interpolation;
  }

  return output;
};

const appendFloat32 = (first: Float32Array, second: Float32Array) => {
  const merged = new Float32Array(first.length + second.length);
  merged.set(first, 0);
  merged.set(second, first.length);
  return merged;
};

const normalizeOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeOptionalNumber = (value: unknown) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
};

const normalizeRoleMapping = (value: unknown): RoleMapping | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const mapping = Object.entries(value).reduce<RoleMapping>((result, [rawSpeaker, role]) => {
    const normalizedRawSpeaker = normalizeOptionalString(rawSpeaker);
    const normalizedRole = normalizeOptionalString(role);

    if (normalizedRawSpeaker && normalizedRole) {
      result[normalizedRawSpeaker] = normalizedRole;
    }

    return result;
  }, {});

  return Object.keys(mapping).length > 0 ? mapping : undefined;
};

const normalizeTranscriptMessage = (value: unknown): TranscriptMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TranscriptMessage>;
  if (candidate.type !== "partial") {
    return null;
  }

  if (!Array.isArray(candidate.segments)) {
    return null;
  }

  const segments = candidate.segments
    .map((segment): TranscriptSegment | null => {
      if (!segment || typeof segment !== "object") {
        return null;
      }

      const raw = segment as Partial<TranscriptSegment>;
      const start = Number(raw.start);
      const end = Number(raw.end);
      const speaker = normalizeOptionalString(raw.speaker);
      const rawSpeaker = normalizeOptionalString(raw.raw_speaker);
      const role = normalizeOptionalString(raw.role);
      const roleReason = normalizeOptionalString(raw.role_reason);
      const text = normalizeOptionalString(raw.text);

      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
        return null;
      }

      return {
        start,
        end,
        raw_speaker: rawSpeaker ?? (speaker?.startsWith("SPEAKER_") ? speaker : undefined),
        role,
        speaker,
        role_confidence: normalizeOptionalNumber(raw.role_confidence),
        role_reason: roleReason,
        text,
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));

  return {
    type: "partial",
    offset: normalizeOptionalNumber(candidate.offset),
    segments,
    role_mapping: normalizeRoleMapping(candidate.role_mapping),
  };
};

const normalizeTipsMessage = (value: unknown): TipsMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TipsMessage>;
  if (candidate.type !== "tips" || !Array.isArray(candidate.tips)) {
    return null;
  }

  const tips = candidate.tips
    .map((tip) => normalizeOptionalString(tip))
    .filter((tip): tip is string => Boolean(tip));

  return {
    type: "tips",
    offset: normalizeOptionalNumber(candidate.offset),
    topic: normalizeOptionalString(candidate.topic),
    customer_intent: normalizeOptionalString(candidate.customer_intent),
    tips,
    role_mapping: normalizeRoleMapping(candidate.role_mapping),
    role_confidence: normalizeOptionalNumber(candidate.role_confidence),
  };
};

export class RealtimeAsrService {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silentGainNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private webSocket: WebSocket | null = null;
  private pendingSourceSamples = new Float32Array(0);
  private audioChunksSent = 0;
  private audioBytesSent = 0;
  private stopRequested = false;
  private statusCallbacks = new Set<(status: RealtimeAsrStatus) => void>();
  private transcriptCallbacks = new Set<(message: TranscriptMessage) => void>();
  private tipsCallbacks = new Set<(message: TipsMessage) => void>();
  private errorCallbacks = new Set<(error: Error) => void>();
  private currentStatus: RealtimeAsrStatus = "Disconnected";

  get status() {
    return this.currentStatus;
  }

  onStatusChange(callback: (status: RealtimeAsrStatus) => void) {
    this.statusCallbacks.add(callback);
    callback(this.currentStatus);
    return () => this.statusCallbacks.delete(callback);
  }

  onTranscript(callback: (message: TranscriptMessage) => void) {
    this.transcriptCallbacks.add(callback);
    return () => this.transcriptCallbacks.delete(callback);
  }

  onTips(callback: (message: TipsMessage) => void) {
    this.tipsCallbacks.add(callback);
    return () => this.tipsCallbacks.delete(callback);
  }

  onError(callback: (error: Error) => void) {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  async startRecording(options: RealtimeAsrOptions = {}) {
    if (this.currentStatus === "Connecting" || this.currentStatus === "Recording") {
      return;
    }

    this.stopRequested = false;
    this.pendingSourceSamples = new Float32Array(0);
    this.audioChunksSent = 0;
    this.audioBytesSent = 0;
    this.emitStatus("Connecting");

    try {
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this browser.");
      }

      this.mediaStream = await mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        },
      });

      await this.openWebSocket(options.url ?? DEFAULT_STREAM_URL);
      this.emitStatus("Connected");
      await this.startAudioPipeline(options.chunkMs ?? DEFAULT_CHUNK_MS);
      this.emitStatus("Recording");
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error("Unable to start live transcription.");
      this.emitError(normalizedError);
      await this.stopRecording("Error");
    }
  }

  async stopRecording(finalStatus: RealtimeAsrStatus = "Disconnected") {
    this.stopRequested = true;
    this.pendingSourceSamples = new Float32Array(0);

    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.processorNode = null;
    this.sourceNode = null;
    this.silentGainNode = null;

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch (error) {
        this.emitError(error instanceof Error ? error : new Error("Unable to close audio context."));
      }
    }
    this.audioContext = null;

    if (
      this.webSocket &&
      (this.webSocket.readyState === WebSocket.OPEN ||
        this.webSocket.readyState === WebSocket.CONNECTING)
    ) {
      this.webSocket.close();
    }
    this.webSocket = null;

    this.emitStatus(finalStatus);
  }

  private async startAudioPipeline(chunkMs: number) {
    if (!this.mediaStream) {
      throw new Error("Microphone stream is not available.");
    }

    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext is not supported in this browser.");
    }

    this.audioContext = new AudioContextCtor();
    await this.audioContext.resume();

    const sourceSampleRate = this.audioContext.sampleRate;
    const chunkSourceSampleCount = Math.max(
      1,
      Math.round(sourceSampleRate * (Math.max(250, Math.min(1000, chunkMs)) / 1000)),
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processorNode = this.audioContext.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );
    this.silentGainNode = this.audioContext.createGain();
    this.silentGainNode.gain.value = 0;

    this.processorNode.onaudioprocess = (event) => {
      if (this.stopRequested || this.webSocket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const frameCount = inputBuffer.length;
      const channelCount = inputBuffer.numberOfChannels;
      const monoSamples = new Float32Array(frameCount);

      for (let channel = 0; channel < channelCount; channel += 1) {
        const channelData = inputBuffer.getChannelData(channel);
        for (let index = 0; index < frameCount; index += 1) {
          monoSamples[index] += channelData[index] / channelCount;
        }
      }

      this.pendingSourceSamples = appendFloat32(this.pendingSourceSamples, monoSamples);

      while (this.pendingSourceSamples.length >= chunkSourceSampleCount) {
        const sourceChunk = this.pendingSourceSamples.slice(0, chunkSourceSampleCount);
        this.pendingSourceSamples = this.pendingSourceSamples.slice(chunkSourceSampleCount);
        const pcmBuffer = floatTo16BitPCM(resampleTo16Khz(sourceChunk, sourceSampleRate));

        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        if (this.webSocket.bufferedAmount > MAX_BUFFERED_BYTES) {
          this.emitError(new Error("WebSocket audio buffer is full. Stop and start again."));
          void this.stopRecording("Error");
          return;
        }

        try {
          this.webSocket.send(pcmBuffer);
          this.audioChunksSent += 1;
          this.audioBytesSent += pcmBuffer.byteLength;
        } catch (error) {
          this.emitError(error instanceof Error ? error : new Error("Unable to send audio chunk."));
          void this.stopRecording("Error");
          return;
        }
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGainNode);
    this.silentGainNode.connect(this.audioContext.destination);
  }

  private openWebSocket(url: string) {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const webSocket = new WebSocket(url);
      webSocket.binaryType = "arraybuffer";
      this.webSocket = webSocket;

      webSocket.onopen = () => {
        settled = true;
        resolve();
      };

      webSocket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          const parsedMessage = JSON.parse(event.data) as { type?: unknown; message?: unknown };

          if (parsedMessage.type === "partial") {
            const message = normalizeTranscriptMessage(parsedMessage);
            if (message) {
              this.transcriptCallbacks.forEach((callback) => callback(message));
            }
            return;
          }

          if (parsedMessage.type === "tips") {
            const message = normalizeTipsMessage(parsedMessage);
            if (message) {
              this.tipsCallbacks.forEach((callback) => callback(message));
            }
            return;
          }

          if (parsedMessage.type === "error") {
            this.emitError(
              new Error(normalizeOptionalString(parsedMessage.message) ?? "ASR service error."),
            );
          }
        } catch (error) {
          console.warn("Invalid ASR message", error, event.data);
        }
      };

      webSocket.onerror = () => {
        const error = new Error("WebSocket connection error.");
        this.emitError(error);

        if (!settled) {
          settled = true;
          reject(error);
        } else {
          void this.stopRecording("Error");
        }
      };

      webSocket.onclose = (event) => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `WebSocket closed before connection was established. Code ${event.code}${
                event.reason ? `: ${event.reason}` : ""
              }`,
            ),
          );
          return;
        }

        if (!this.stopRequested) {
          const closeDetail = [
            `code ${event.code}`,
            event.reason ? `reason: ${event.reason}` : "",
            `clean: ${event.wasClean ? "yes" : "no"}`,
            `chunks sent: ${this.audioChunksSent}`,
            `bytes sent: ${this.audioBytesSent}`,
          ]
            .filter(Boolean)
            .join(", ");

          console.warn(`ASR WebSocket closed unexpectedly (${closeDetail}).`);
          this.emitError(new Error(`ASR WebSocket closed unexpectedly (${closeDetail}).`));
          void this.stopRecording("Error");
        }
      };
    });
  }

  private emitStatus(status: RealtimeAsrStatus) {
    this.currentStatus = status;
    this.statusCallbacks.forEach((callback) => callback(status));
  }

  private emitError(error: Error) {
    this.errorCallbacks.forEach((callback) => callback(error));
  }
}
