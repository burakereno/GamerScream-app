// Lucide MicOff paths, matching the renderer's lucide-react microphone icon.
export const MUTE_OVERLAY_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Microphone muted</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;user-select:none}
body{padding:2px;-webkit-app-region:no-drag}
main{width:100%;height:100%;display:grid;place-items:center;border-radius:20px;
background:rgba(15,15,18,.94);border:2px solid rgba(239,68,68,.55);color:#ef4444}
svg{display:block;filter:drop-shadow(0 0 6px rgba(239,68,68,.25))}
</style></head><body>
<main role="status" aria-label="Microphone muted">
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"
fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m2 2 20 20"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
<path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
<path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3m-4 0h8"/>
</svg></main></body></html>`
