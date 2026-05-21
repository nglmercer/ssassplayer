import { h } from 'preact';
import { useState } from 'preact/hooks';
import { VideoPlayer } from './VideoPlayer';
import './styles.css';

export function App() {
    const [videoUrl, setVideoUrl] = useState('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    const [inputValue, setInputValue] = useState(videoUrl);

    const sampleStreams = [
        { label: 'HLS: Mux (with thumbnails)', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
        { label: 'HLS: Sintel', url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
        { label: 'DASH: Big Buck Bunny', url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd' },
    ];

    const sampleSubtitles = [
        {
            id: 'demo-ass',
            label: 'English',
            lang: 'en',
            format: 'ass' as const,
            content: `[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Welcome to ssassplayer demo!\nDialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,{\\c&H00FFFF&}Yellow subtitle text using ASS.js`
        }
    ];

    const handleLoad = () => {
        setVideoUrl(inputValue);
    };

    return (
        <div class="container">
            <header class="header">
                <h1>ssassplayer</h1>
                <p>Premium HLS Media Experience</p>
            </header>

            <div class="url-input-container">
                <input
                    type="text"
                    class="url-input"
                    placeholder="Enter HLS/DASH URL..."
                    value={inputValue}
                    onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                />
                <button class="load-btn" onClick={handleLoad}>
                    <span>Load Video</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
            </div>

            <div class="sample-streams">
                {sampleStreams.map(stream => (
                    <button
                        key={stream.url}
                        class="stream-btn"
                        onClick={() => { setInputValue(stream.url); setVideoUrl(stream.url); }}
                    >
                        {stream.label}
                    </button>
                ))}
            </div>

            <main class="player-card">
                <VideoPlayer 
                    key={videoUrl} 
                    src={videoUrl} 
                    autoplay={true} 
                    subtitles={sampleSubtitles} 
                />
            </main>
        </div>
    );
}
