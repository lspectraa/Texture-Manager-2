import { useEffect, useMemo, useRef, useState } from "react";
import { generateIconGlowFromPng } from "../services/tauriIconGlow";
import {
  glowGenJobsSignature,
  type GeneratedGlowFrame,
  type GlowGenJob,
} from "../utils/iconEditorGeneratedGlow";

const GENERATE_DEBOUNCE_MS = 180;

const canvasToPngDataUrl = (canvas: HTMLCanvasElement): string => canvas.toDataURL("image/png");

const buildCanvasFromDataUrl = async (pngDataUrl: string): Promise<HTMLCanvasElement> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("failed to decode generated glow"));
    next.src = pngDataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth);
  canvas.height = Math.max(1, image.naturalHeight);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("failed to create glow canvas");
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  return canvas;
};

type UseIconEditorGeneratedGlowArgs = {
  jobs: readonly GlowGenJob[];
  plistPath: string | null;
  onFramesChange: (frames: GeneratedGlowFrame[]) => void;
};

export function useIconEditorGeneratedGlow({
  jobs,
  plistPath,
  onFramesChange,
}: UseIconEditorGeneratedGlowArgs) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFramesChangeRef = useRef(onFramesChange);
  onFramesChangeRef.current = onFramesChange;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const signature = useMemo(() => glowGenJobsSignature(jobs), [jobs]);

  useEffect(() => {
    onFramesChangeRef.current([]);
    setError(null);
    setIsGenerating(false);
  }, [plistPath]);

  useEffect(() => {
    const enabledJobs = jobsRef.current.filter((job) => job.enabled && job.sourceCanvas);
    if (enabledJobs.length === 0) {
      onFramesChangeRef.current([]);
      setIsGenerating(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsGenerating(true);
      void (async () => {
        try {
          const frames: GeneratedGlowFrame[] = [];
          for (const job of enabledJobs) {
            if (!job.sourceCanvas) {
              continue;
            }
            const result = await generateIconGlowFromPng(
              canvasToPngDataUrl(job.sourceCanvas),
              job.thickness,
            );
            if (cancelled) {
              return;
            }
            if ("error" in result) {
              setError(result.error);
              setIsGenerating(false);
              return;
            }
            const canvas = await buildCanvasFromDataUrl(result.dataUrl);
            frames.push({
              key: job.key,
              frameName: job.glowFrameName,
              canvas,
              spriteSize: { width: canvas.width, height: canvas.height },
              spriteOffset: { ...job.glowOffset },
              isNewFrame: job.isNewFrame,
              partId: job.partId,
            });
          }
          if (cancelled) {
            return;
          }
          setError(null);
          onFramesChangeRef.current(frames);
          setIsGenerating(false);
        } catch (err) {
          if (cancelled) {
            return;
          }
          setError(err instanceof Error ? err.message : "glow generation failed");
          setIsGenerating(false);
        }
      })();
    }, GENERATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [signature]);

  return { isGenerating, error };
}
