//import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Player, createControls, createGestures, createShakaPlugin, createVttThumbnailPlugin, createAssJsPlugin, Menu, Controls, type TextTrack as APTextTrack } from '../../src';
import type { MenuGroup } from '../../src';
import ASS from 'assjs';
import '../../dist/player.css';

// Generate a mock sprite sheet as a data URI for demo purposes
// Creates a 4x1 grid of colored thumbnails with time labels
function generateMockSpriteSheet(): string {
    const canvas = document.createElement('canvas');
    const tileW = 160;
    const tileH = 180;
    const cols = 4;
    const rows = 1;
    canvas.width = tileW * cols;
    canvas.height = tileH * rows;
    const ctx = canvas.getContext('2d')!;

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
    const labels = ['0:00', '0:10', '0:20', '0:30'];

    for (let i = 0; i < cols; i++) {
        // Background gradient
        const grad = ctx.createLinearGradient(i * tileW, 0, (i + 1) * tileW, tileH);
        grad.addColorStop(0, colors[i]);
        grad.addColorStop(1, colors[(i + 1) % colors.length]);
        ctx.fillStyle = grad;
        ctx.fillRect(i * tileW, 0, tileW, tileH);

        // Play icon circle
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(i * tileW + tileW / 2, tileH / 2 - 10, 30, 0, Math.PI * 2);
        ctx.fill();

        // Play triangle
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(i * tileW + tileW / 2 - 8, tileH / 2 - 20);
        ctx.lineTo(i * tileW + tileW / 2 - 8, tileH / 2);
        ctx.lineTo(i * tileW + tileW / 2 + 12, tileH / 2 - 10);
        ctx.closePath();
        ctx.fill();

        // Time label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], i * tileW + tileW / 2, tileH - 30);
    }

    return canvas.toDataURL('image/jpeg', 0.8);
}

export interface CustomSubtitleTrack {
  id: string;
  label: string;
  lang: string;
  format: 'ass' | 'ssa' | 'srt';
  content?: string;
  url?: string;
}

interface PlayerProps {
  src: string;
  poster?: string;
  autoplay?: boolean;
  subtitles?: CustomSubtitleTrack[];
  onEnded?: () => void;
}

export const VideoPlayer = ({ src, poster, autoplay, subtitles, onEnded }: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!videoRef.current || !containerRef.current) return;

    const player = new Player({
      media: videoRef.current,
      container: containerRef.current,
      autoplay: false // Handle explicitly after plugins/source
    });

    const setupPlugins = async () => {
      try {
        // 1. Install Shaka plugin (supports HLS + DASH)
        await player.usePlugin(createShakaPlugin({
          shakaConfig: {
            streaming: { bufferingGoal: 60 },
            abr: { enabled: true },
          }
        }));

        // 2. Install thumbnail preview plugin with inline mock sprite sheet
        // This creates a working demo without needing external sprite sheets
        const mockSpriteUrl = generateMockSpriteSheet();
        await player.usePlugin(createVttThumbnailPlugin({
          sprites: [{
            url: mockSpriteUrl,
            width: 640,   // 4 tiles x 160px
            height: 180,  // 1 row x 180px
            tileWidth: 160,
            tileHeight: 180,
            interval: 10
          }]
        }));

        const controls = (await player.usePlugin(createControls())) as Controls;
        await player.usePlugin(createGestures());

        // Build menu with quality and subtitle options
        const updateMenu = () => {
          const groups: MenuGroup[] = [];

          // Quality options
          const qualityProvider = player.getAPI().getQualityProvider();
          if (qualityProvider) {
            const qualities = qualityProvider.getAvailableQualities();
            const currentQuality = qualityProvider.getCurrentQuality();
            if (qualities.length > 0) {
              groups.push({
                label: "Quality",
                items: [
                  {
                    type: "select",
                    id: "quality",
                    label: "Select Quality",
                    value: String(currentQuality?.id ?? -1),
                    options: [
                      { value: "-1", label: "Auto" },
                      ...qualities.map((q) => ({ value: String(q.id), label: q.label }))
                    ],
                    onChange: (val: string) => qualityProvider.setQuality(parseInt(val))
                  }
                ]
              });
            }
          }

          // Subtitle options
          const textProvider = player.getAPI().getTextTrackProvider();
          const nativeTracks = videoRef.current?.textTracks;
          
          if (textProvider || (nativeTracks && nativeTracks.length > 0)) {
            const trackOptions: { value: string, label: string }[] = [];
            
            // Native tracks
            if (nativeTracks) {
              for (let i = 0; i < nativeTracks.length; i++) {
                const track = nativeTracks[i];
                trackOptions.push({ value: `native:${i}`, label: track.label || `Native Track ${i}` });
              }
            }
            
            // Plugin tracks (ASS, etc.)
            const pluginTracks = textProvider?.getTextTracks() || ([] as APTextTrack[]);
            for (const track of pluginTracks) {
                trackOptions.push({ value: `plugin:${track.id}`, label: `${track.label} (${track.language})` });
            }

            const activeTrack = textProvider?.getActiveTrack();
            let currentValue = "-1";
            
            if (activeTrack) {
                currentValue = `plugin:${activeTrack.id}`;
            } else if (nativeTracks) {
                const nativeIdx = Array.from(nativeTracks).findIndex(t => t.mode === 'showing');
                if (nativeIdx >= 0) currentValue = `native:${nativeIdx}`;
            }

            groups.push({
              label: "Subtitles",
              items: [
                {
                  type: "select",
                  id: "subtitles",
                  label: "Select Subtitle",
                  value: currentValue,
                  options: [
                    { value: "-1", label: "Off" },
                    ...trackOptions
                  ],
                  onChange: (val: string) => {
                    // Turn off everything first
                    if (nativeTracks) {
                        for (let i = 0; i < nativeTracks.length; i++) nativeTracks[i].mode = 'hidden';
                    }
                    if (textProvider) textProvider.setActiveTrack(null);
                    
                    if (val.startsWith('native:')) {
                        const idx = parseInt(val.split(':')[1]);
                        if (nativeTracks && nativeTracks[idx]) nativeTracks[idx].mode = 'showing';
                    } else if (val.startsWith('plugin:')) {
                        const id = val.split(':')[1];
                        textProvider?.setActiveTrack(id);
                    }
                  }
                }
              ]
            });
          }

          // Playback options
          groups.push({
            label: "Playback",
            items: [
              {
                type: "toggle",
                id: "loop",
                label: "Loop Video",
                value: false,
                onChange: (val: boolean) => { if (videoRef.current) videoRef.current.loop = val; }
              },
              {
                type: "select",
                id: "speed",
                label: "Playback Speed",
                value: "1",
                options: [
                  { value: "0.5", label: "0.5x" },
                  { value: "1", label: "Normal" },
                  { value: "1.5", label: "1.5x" },
                  { value: "2", label: "2x" }
                ],
                onChange: (val: string) => player.setRate(parseFloat(val))
              }
            ]
          });

          return groups;
        };

        const menu = new Menu(containerRef.current!, updateMenu());

        // Connect settings button to menu
        controls.getSettingsButton().onclick = (e: Event) => {
          e.stopPropagation();
          menu.setGroups(updateMenu());
          menu.toggle();
        };

        // 2. Install Subtitle Plugin if needed
        if (subtitles && subtitles.some(s => s.format === 'ass' || s.format === 'ssa')) {
            await player.usePlugin(createAssJsPlugin({ ass: ASS as any }));
            
            const provider = player.getAPI().getTextTrackProvider();
            if (provider) {
                for (const sub of subtitles) {
                    provider.addTrack({
                        id: sub.id,
                        label: sub.label,
                        language: sub.lang,
                        content: sub.content,
                        src: sub.url,
                        kind: 'subtitles',
                        active: false
                    });
                }
            }
        }

        // 3. Set source — the HLS plugin's sourcechange listener will handle .m3u8
        if (src) {
          player.setSource(src);
        }

        // 3. Handle autoplay — wait for the media to be ready
        // Firefox requires the MediaSource to be fully attached and manifest parsed
        // before play() can be called. Use canplay event which fires after hls.js
        // has attached and parsed the manifest.
        if (autoplay) {
          const attemptPlay = () => {
            player.play().catch(e => {
              console.warn("Autoplay blocked, muting video to allow playback");
              if (videoRef.current) {
                videoRef.current.muted = true;
                player.play().catch(err => console.log("Muted autoplay also blocked:", err));
              }
            });
          };

          // Wait for canplay — this fires after hls.js has attached MediaSource
          // and parsed the manifest on all browsers including Firefox
          if (videoRef.current!.readyState >= 3) {
            attemptPlay();
          } else {
            videoRef.current!.addEventListener('canplay', attemptPlay, { once: true });
          }
        }
      } catch (error) {
        console.error("Error setting up player plugins:", error);
      }
    }

    setupPlugins();

    const handleEnded = () => onEnded?.();
    videoRef.current.addEventListener('ended', handleEnded);

    playerRef.current = player;

    return () => {
      videoRef.current?.removeEventListener('ended', handleEnded);
      player.destroy();
    };
  }, [src, autoplay]); // Depend on src to re-init if key is not used, though App.tsx uses key

  return (
    <div
      ref={containerRef}
      className="player-wrapper"
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        crossorigin="anonymous"
        playsinline
      />
    </div>
  );
};

