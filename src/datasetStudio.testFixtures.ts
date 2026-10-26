import type { AnnotationOptions } from "./datasetStudioTypes";

export const annotationOptionsFixture: AnnotationOptions = {
  providers: [
    { provider: "gcp", models: ["chirp_3", "chirp_2"], defaultModel: "chirp_3" },
    { provider: "openai", models: [
      "gpt-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15",
      "gpt-4o-transcribe-diarize", "whisper-1",
    ], defaultModel: "gpt-transcribe" },
    { provider: "custom", models: [], defaultModel: null },
  ],
};
