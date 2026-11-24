// Camera QR scanner: reads frames from the camera into a canvas and decodes
// them with jsQR (pure JavaScript, works in every modern browser).
// The decoded text is only a pass code; the DATABASE decides if it's valid.
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff } from 'lucide-react';

export function QrScanner({ onCode, paused }: { onCode: (text: string) => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let lastScan = 0;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser can’t use the camera here. Type the pass code below instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setError('Camera permission was refused or no camera was found. Type the pass code below instead.');
        return;
      }
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        // ~8 scans a second is plenty and keeps phones cool.
        if (now - lastScan < 125 || pausedRef.current || video.readyState < 2) return;
        lastScan = now;
        const canvas = canvasRef.current!;
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, w, h);
        const result = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (!result?.data) return;
        // Ignore the same code for 3 s so one pass isn't submitted repeatedly.
        const last = lastRef.current;
        if (last && last.text === result.data && Date.now() - last.at < 3000) return;
        lastRef.current = { text: result.data, at: Date.now() };
        onCode(result.data);
      };
      raf = requestAnimationFrame(tick);
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());   // always release the camera
    };
  }, [onCode]);

  if (error) {
    return <p className="flex items-start gap-2 rounded-2xl bg-cream p-4 text-sm text-plum-soft"><CameraOff className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>;
  }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-plum-deep">
      <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Camera preview for scanning passes" />
      <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_999px_rgb(52_31_37/0.35)]" aria-hidden />
      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </div>
  );
}
