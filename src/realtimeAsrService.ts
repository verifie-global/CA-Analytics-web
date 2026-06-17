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
  source?: string;
  role?: Role;
  speaker?: Role;
  role_confidence?: number;
  role_reason?: string;
  text: string;
};

export type TranscriptMessage = {
  type: "partial" | "transcript.final";
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
  agentDeviceId?: string;
  customerDeviceId?: string;
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

export function stereoFloatToInterleaved16BitPCM(
  agentSamples: Float32Array,
  customerSamples: Float32Array,
) {
  const sampleCount = Math.max(agentSamples.length, customerSamples.length);
  const buffer = new ArrayBuffer(sampleCount * 2 * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < sampleCount; index += 1) {
    const agentSample = Math.max(-1, Math.min(1, agentSamples[index] ?? 0));
    const customerSample = Math.max(-1, Math.min(1, customerSamples[index] ?? 0));
    view.setInt16(
      index * 4,
      agentSample < 0 ? agentSample * 0x8000 : agentSample * 0x7fff,
      true,
    );
    view.setInt16(
      index * 4 + 2,
      customerSample < 0 ? customerSample * 0x8000 : customerSample * 0x7fff,
      true,
    );
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
      const source = normalizeOptionalString(raw.source);
      const role = normalizeOptionalString(raw.role);
      const roleReason = normalizeOptionalString(raw.role_reason);
      const text = normalizeOptionalString(raw.text);

      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
        return null;
      }

      return {
        start,
        end,
        raw_speaker:
          rawSpeaker ?? source ?? (speaker?.startsWith("SPEAKER_") ? speaker : undefined),
        source,
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

const normalizeTranscriptFinalMessage = (value: unknown): TranscriptMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    type?: unknown;
    role?: unknown;
    source?: unknown;
    speaker?: unknown;
    text?: unknown;
    timestamp_ms?: unknown;
    is_final?: unknown;
  };

  if (candidate.type !== "transcript.final") {
    return null;
  }

  const text = normalizeOptionalString(candidate.text);
  const role = normalizeOptionalString(candidate.role);
  const source = normalizeOptionalString(candidate.source);
  const timestampMs = normalizeOptionalNumber(candidate.timestamp_ms) ?? 0;

  if (!text) {
    return null;
  }

  const timestampSeconds = Math.max(0, timestampMs / 1000);

  return {
    type: "transcript.final",
    offset: timestampSeconds,
    segments: [
      {
        start: timestampSeconds,
        end: timestampSeconds,
        raw_speaker: source,
        source,
        role: role ?? "Unknown",
        speaker: role ?? normalizeOptionalString(candidate.speaker) ?? source ?? "Unknown",
        text,
      },
    ],
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
  private agentSourceNode: MediaStreamAudioSourceNode | null = null;
  private customerSourceNode: MediaStreamAudioSourceNode | null = null;
  private channelMergerNode: ChannelMergerNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silentGainNode: GainNode | null = null;
  private agentMediaStream: MediaStream | null = null;
  private customerMediaStream: MediaStream | null = null;
  private webSocket: WebSocket | null = null;
  private pendingAgentSourceSamples = new Float32Array(0);
  private pendingCustomerSourceSamples = new Float32Array(0);
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
    this.pendingAgentSourceSamples = new Float32Array(0);
    this.pendingCustomerSourceSamples = new Float32Array(0);
    this.audioChunksSent = 0;
    this.audioBytesSent = 0;
    this.emitStatus("Connecting");

    try {
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this browser.");
      }

      this.agentMediaStream = await mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
          deviceId: options.agentDeviceId ? { exact: options.agentDeviceId } : undefined,
        },
      });

      this.customerMediaStream = await mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
          deviceId: options.customerDeviceId ? { exact: options.customerDeviceId } : undefined,
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
    this.pendingAgentSourceSamples = new Float32Array(0);
    this.pendingCustomerSourceSamples = new Float32Array(0);

    this.processorNode?.disconnect();
    this.agentSourceNode?.disconnect();
    this.customerSourceNode?.disconnect();
    this.channelMergerNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.processorNode = null;
    this.agentSourceNode = null;
    this.customerSourceNode = null;
    this.channelMergerNode = null;
    this.silentGainNode = null;

    this.agentMediaStream?.getTracks().forEach((track) => track.stop());
    this.customerMediaStream?.getTracks().forEach((track) => track.stop());
    this.agentMediaStream = null;
    this.customerMediaStream = null;

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
    if (!this.agentMediaStream || !this.customerMediaStream) {
      throw new Error("Both Agent and Customer microphone streams are required.");
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

    this.agentSourceNode = this.audioContext.createMediaStreamSource(this.agentMediaStream);
    this.customerSourceNode = this.audioContext.createMediaStreamSource(this.customerMediaStream);
    this.channelMergerNode = this.audioContext.createChannelMerger(2);
    this.processorNode = this.audioContext.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      2,
      1,
    );
    this.silentGainNode = this.audioContext.createGain();
    this.silentGainNode.gain.value = 0;

    this.agentSourceNode.connect(this.channelMergerNode, 0, 0);
    this.customerSourceNode.connect(this.channelMergerNode, 0, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (this.stopRequested || this.webSocket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const frameCount = inputBuffer.length;
      const agentSamples = new Float32Array(inputBuffer.getChannelData(0));
      const customerSamples =
        inputBuffer.numberOfChannels > 1
          ? new Float32Array(inputBuffer.getChannelData(1))
          : new Float32Array(frameCount);

      this.pendingAgentSourceSamples = appendFloat32(
        this.pendingAgentSourceSamples,
        agentSamples,
      );
      this.pendingCustomerSourceSamples = appendFloat32(
        this.pendingCustomerSourceSamples,
        customerSamples,
      );

      while (
        this.pendingAgentSourceSamples.length >= chunkSourceSampleCount &&
        this.pendingCustomerSourceSamples.length >= chunkSourceSampleCount
      ) {
        const agentSourceChunk = this.pendingAgentSourceSamples.slice(0, chunkSourceSampleCount);
        const customerSourceChunk = this.pendingCustomerSourceSamples.slice(0, chunkSourceSampleCount);
        this.pendingAgentSourceSamples =
          this.pendingAgentSourceSamples.slice(chunkSourceSampleCount);
        this.pendingCustomerSourceSamples =
          this.pendingCustomerSourceSamples.slice(chunkSourceSampleCount);
        const pcmBuffer = stereoFloatToInterleaved16BitPCM(
          resampleTo16Khz(agentSourceChunk, sourceSampleRate),
          resampleTo16Khz(customerSourceChunk, sourceSampleRate),
        );

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

    this.channelMergerNode.connect(this.processorNode);
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
          console.log("WS message:", parsedMessage);

          if (parsedMessage.type === "partial") {
            const message = normalizeTranscriptMessage(parsedMessage);
            if (message) {
              this.transcriptCallbacks.forEach((callback) => callback(message));
            }
            return;
          }

          if (parsedMessage.type === "transcript.final") {
            const message = normalizeTranscriptFinalMessage(parsedMessage);
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
