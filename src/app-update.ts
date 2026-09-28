export type AppVersion = { version: string; build: string };
export const currentVersion: AppVersion = {
  version: import.meta.env.VITE_APP_VERSION,
  build: import.meta.env.VITE_APP_BUILD,
};

export async function checkAppUpdate(current: AppVersion, signal?: AbortSignal): Promise<AppVersion | null> {
  const response = await fetch('/version.json', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('更新を確認できませんでした。通信を確認して、もう一度お試しください。');
  const latest: unknown = await response.json();
  if (!latest || typeof latest !== 'object' || !('version' in latest) || !('build' in latest)
    || typeof latest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(latest.version)
    || typeof latest.build !== 'string' || !/^[a-f0-9]{16}$/.test(latest.build)) {
    throw new Error('更新情報を取得できませんでした。もう一度お試しください。');
  }
  return latest.build === current.build ? null : { version: latest.version, build: latest.build };
}
