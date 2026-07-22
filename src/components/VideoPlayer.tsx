'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

// Ported from the old site's VideoPlayer.jsx — same HLS tuning and lazy
// loading strategy. Media comes from a single-region S3 REST endpoint (no
// CDN), so loading follows scroll position and retries transient failures.
const HLS_CONFIG = {
  autoStartLoad: false, // hold loading until pickStartLevel() sets the level
  maxBufferLength: 20,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 800,
  levelLoadingMaxRetry: 4,
  fragLoadingMaxRetry: 6,
};

type HlsLevel = { height?: number };

// Playing videos start at the lowest rendition ≥480p (not blurry); thumbnails
// (preferLowest) start at the lightest rendition — they only need one frame.
function pickStartLevel(hls: Hls, levels: HlsLevel[], preferLowest = false) {
  const list = levels || [];
  const hasHeights = list.some((l) => (l.height || 0) > 0);
  let idx = -1;
  if (hasHeights) {
    if (preferLowest) {
      list.forEach((l, i) => {
        if (idx < 0 || (l.height || 0) < (list[idx].height || 0)) idx = i;
      });
    } else {
      list.forEach((l, i) => {
        if ((l.height || 0) >= 480 && (idx < 0 || (l.height || 0) < (list[idx].height || 0))) idx = i;
      });
      if (idx < 0)
        list.forEach((l, i) => {
          if (idx < 0 || (l.height || 0) > (list[idx].height || 0)) idx = i;
        });
    }
  }
  hls.startLevel = idx;
  hls.startLoad();
}

type VideoPlayerProps = {
  videoUrl: string;
  className?: string;
  autoPlay?: boolean;
  defaultMuted?: boolean;
  showMuteButton?: boolean;
  enableHoverPlay?: boolean;
  clickToPlay?: boolean;
  priority?: boolean;
};

export default function VideoPlayer({
  videoUrl,
  className = '',
  autoPlay = true,
  defaultMuted = true,
  showMuteButton = true,
  enableHoverPlay = false,
  clickToPlay = false,
  priority = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const attachedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(defaultMuted);
  const [activated, setActivated] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Phase 1 — load the playlist and attach media as the card APPROACHES the
  // viewport (300px rootMargin), so grids fill top-to-bottom without
  // over-subscribing the S3 connection pool. Priority heroes load immediately.
  useEffect(() => {
    if (clickToPlay || !videoUrl) return;
    const container = containerRef.current;
    if (!container) return;

    const beginLoad = () => {
      if (attachedRef.current) return;
      attachedRef.current = true;
      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls(autoPlay ? HLS_CONFIG : { ...HLS_CONFIG, maxBufferLength: 8 });
        hlsRef.current = hls;
        hls.loadSource(videoUrl);
        if (video) {
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            pickStartLevel(hls, data.levels, !autoPlay);
            if (autoPlay) video.play().catch(() => {});
            else
              setTimeout(() => {
                video.currentTime = 0.1; // first frame = thumbnail
              }, 100);
          });
        }
      } else if (video?.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl; // Safari native HLS
        if (autoPlay) video.play().catch(() => {});
        else
          setTimeout(() => {
            video.currentTime = 0.1;
          }, 100);
      }
    };

    let observer: IntersectionObserver | null = null;
    if (priority) {
      beginLoad();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0].isIntersecting) return;
          observer?.disconnect();
          beginLoad();
        },
        { rootMargin: '300px 0px' },
      );
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      attachedRef.current = false;
    };
  }, [videoUrl, clickToPlay, autoPlay, priority]);

  // Phase 2 — autoPlay videos play only while ≥25% visible.
  useEffect(() => {
    if (clickToPlay || !autoPlay) return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const video = videoRef.current;
        if (!video) return;
        const { intersectionRatio } = entries[0];
        if (intersectionRatio >= 0.25) video.play().catch(() => {});
        else if (intersectionRatio < 0.1) video.pause();
      },
      { threshold: [0, 0.1, 0.25, 0.5, 1.0] },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [autoPlay, clickToPlay]);

  // clickToPlay — load + attach + play on demand.
  useEffect(() => {
    if (!clickToPlay || !activated) return;
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        pickStartLevel(hls, data.levels);
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      video.play().catch(() => {});
    }
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [activated, clickToPlay, videoUrl]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (enableHoverPlay) (e.target as HTMLVideoElement).play().catch(() => {});
  };
  const handleMouseLeave = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (enableHoverPlay) {
      const v = e.target as HTMLVideoElement;
      v.pause();
      v.currentTime = 0;
    }
  };

  const isAbsolute = className.includes('absolute');
  const showSkeleton = !videoReady && (autoPlay || !isAbsolute);
  const needsAspectRatio = showSkeleton && !isAbsolute && !/\bh-\d+\b/.test(className);

  if (clickToPlay && !activated) {
    return (
      <div
        ref={containerRef}
        className={`relative flex items-center justify-center bg-bg-deep aspect-video cursor-pointer group ${className.replace('h-auto', '')}`}
        onClick={() => setActivated(true)}
        role="button"
        aria-label="Play video"
      >
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/25 transition-all duration-200">
          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${isAbsolute ? '' : 'relative'} ${needsAspectRatio ? 'aspect-video bg-bg-deep' : ''}`}
    >
      {showSkeleton && <div className="absolute inset-0 bg-bg-deep animate-pulse z-10" />}
      <video
        className={className}
        ref={videoRef}
        autoPlay={autoPlay}
        loop
        muted={isMuted}
        playsInline
        preload={priority ? 'auto' : 'none'}
        onLoadedData={() => setVideoReady(true)}
        onPlaying={() => setVideoReady(true)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      {showMuteButton && (
        <button
          onClick={() => setIsMuted((prev) => !prev)}
          className="absolute right-0 bottom-3/4 -translate-y-3/4 bg-black/10 text-white px-3 py-1 rounded-l-lg text-sm z-30"
        >
          {isMuted ? 'Unmute 🔊' : 'Mute 🔇'}
        </button>
      )}
    </div>
  );
}
