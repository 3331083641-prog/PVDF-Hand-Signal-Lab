import type { ImageAsset } from '../data/imageAssets'

export function ImageNotice({ asset }: { asset: ImageAsset }) {
  return <p className="mt-3 max-w-[65ch] text-xs leading-5 text-[var(--muted)]">{asset.caption ?? asset.disclaimer}</p>
}
