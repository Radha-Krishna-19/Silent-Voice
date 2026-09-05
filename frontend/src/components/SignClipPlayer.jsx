import { useEffect, useRef, useState } from "react";
import LandmarkOverlay from "./LandmarkOverlay";
import { cn } from "../lib/utils";

/**
 * Sign-clip player.
 * When `videoUrl` is provided → renders <video>. Otherwise renders the animated
 * skeleton placeholder so the UI works before the real INCLUDE-dataset clips
 * are uploaded to object storage.
 */
export const SignClipPlayer = ({
  videoUrl,
  posterUrl,
  label,
  playing = true,
  muted = true,
  className = "",
  overlayColor = "#6EE7F2",
  showOverlay = true,
  aspect = "aspect-video",
  onEnded,
}) => {
  const ref = useRef(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || !videoUrl) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, videoUrl]);

  const useVideo = Boolean(videoUrl) && !errored;

  return (
    <div
      className={cn("relative rounded-sm overflow-hidden bg-black border border-cream/10", aspect, className)}
      data-testid="sign-clip-player"
    >
      {useVideo ? (
        <video
          ref={ref}
          src={videoUrl}
          poster={posterUrl}
          muted={muted}
          playsInline
          loop
          onEnded={onEnded}
          onError={() => setErrored(true)}
          className="absolute inset-0 w-full h-full object-cover"
          data-testid="sign-clip-video"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, rgba(201,123,74,0.10), transparent 55%), radial-gradient(ellipse at 50% 90%, rgba(110,231,242,0.05), transparent 60%), #050506",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)",
            }}
          />
          {showOverlay && <LandmarkOverlay color={overlayColor} />}
        </>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent pointer-events-none" />

      {label && (
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div>
            <div className="micro-caps mb-1 text-cream/60">Now signing</div>
            <div className="font-display text-3xl md:text-4xl text-cream copper-glow">{label}</div>
          </div>
          {!useVideo && (
            <div className="micro-caps text-cream/40" data-testid="clip-placeholder-badge">
              Preview · clip pending
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SignClipPlayer;
