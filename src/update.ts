import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

export interface Update { build: number; url: string }
/** This app's build number (set when the APK is built). 0 when running from source. */
export const BUILD = Number(__BUILD__) || 0;

/** Look for a newer build on GitHub. Silent if offline, or if this is not a release build. */
export async function checkUpdate(): Promise<Update | null> {
  if (!BUILD || !Capacitor.isNativePlatform()) return null;
  try {
    const ctl = new AbortController(); const t = window.setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('https://api.github.com/repos/rowdel-ctrl/PDX/releases?per_page=5', { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } });
    window.clearTimeout(t);
    if (!r.ok) return null;
    const list = (await r.json()) as { tag_name: string; draft: boolean; assets: { name: string; browser_download_url: string }[] }[];
    let best: Update | null = null;
    for (const rel of list) {
      const m = /^build-(\d+)$/.exec(rel.tag_name); const apk = rel.assets.find((a) => a.name.endsWith('.apk'));
      if (!m || rel.draft || !apk) continue;
      const n = Number(m[1]); if (n > BUILD && (!best || n > best.build)) best = { build: n, url: apk.browser_download_url };
    }
    return best;
  } catch { return null; }
}

/** Open the APK link. The phone downloads it, then tap the download to install over this app. */
export async function downloadUpdate(u: Update) {
  try { await AppLauncher.openUrl({ url: u.url }); } catch { window.open(u.url, '_blank'); }
}
