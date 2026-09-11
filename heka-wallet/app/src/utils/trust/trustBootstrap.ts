import {
  loadCachedTrustSources,
  refreshTrustSources,
  TrustCacheLoadResult,
  TrustRefreshOptions,
  TrustSourceRefreshResult,
  TrustVerifyAgent,
} from './loteTrustSource'
import { TrustSourceCache } from './trustSourceCache'
import { TrustSourceConfig } from './trustSources'

/** Upper bound for the one awaited network refresh when a source has no usable cache. */
export const DEFAULT_TRUST_REFRESH_TIMEOUT_MS = 3000

export interface TrustBootstrapOptions extends TrustRefreshOptions {
  cache: TrustSourceCache
  refreshTimeoutMs?: number
}

export interface TrustBootstrapResult {
  /** Per-source outcome of the cache load. */
  loaded: TrustCacheLoadResult[]
  /**
   * `awaited`: some refreshable source had no usable cache, so one network refresh was awaited (up to
   * the bound); `background`: every source loaded but at least one is stale, refresh fired without
   * awaiting; `none`: nothing to do.
   */
  refresh: 'awaited' | 'background' | 'none'
  /** Results of the awaited refresh, or `'timed-out'` when the bound elapsed first (it keeps running). */
  refreshed?: TrustSourceRefreshResult[] | 'timed-out'
}

/** A source the loader would actually fetch (one without URL or pins is skipped by design). */
const isRefreshable = (source: TrustSourceConfig): boolean => Boolean(source.url) && source.pinnedSigners.length > 0

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timed-out'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

/**
 * Make the configured trust anchors available in **this** runtime as fast as possible while never
 * blocking on the network beyond a bound: load the on-device cache (re-verified, no network); if a
 * refreshable source has no usable cache, await one refresh for at most `refreshTimeoutMs`; if every
 * source loaded but one is stale, refresh in the background; otherwise do nothing. A refresh that
 * outlives the bound still completes and updates the store + cache for next time. Never throws.
 */
export async function ensureTrustAnchors(
  agent: TrustVerifyAgent,
  sources: TrustSourceConfig[],
  options: TrustBootstrapOptions
): Promise<TrustBootstrapResult> {
  const { cache, refreshTimeoutMs = DEFAULT_TRUST_REFRESH_TIMEOUT_MS, ...refreshOptions } = options
  const loaded = await loadCachedTrustSources(agent, sources, cache, refreshOptions.now)

  const refreshable = sources.filter(isRefreshable)
  if (refreshable.length === 0) return { loaded, refresh: 'none' }

  const isLoaded = (source: TrustSourceConfig): boolean =>
    loaded.some((result) => result.sourceId === source.id && result.ok)
  const missing = refreshable.some((source) => !isLoaded(source))
  const stale = loaded.some((result) => result.ok && result.stale)

  if (missing) {
    const refreshed = await withTimeout(
      refreshTrustSources(agent, sources, { ...refreshOptions, cache }),
      refreshTimeoutMs
    )
    return { loaded, refresh: 'awaited', refreshed }
  }
  if (stale) {
    void refreshTrustSources(agent, sources, { ...refreshOptions, cache }).catch(() => undefined)
    return { loaded, refresh: 'background' }
  }
  return { loaded, refresh: 'none' }
}

/** One-line log summary of a bootstrap outcome. */
export function summarizeTrustBootstrap(result: TrustBootstrapResult): string {
  const cache = result.loaded
    .map((entry) =>
      entry.ok
        ? `${entry.sourceId}=${entry.anchorCount} anchor(s)${entry.stale ? ' (stale)' : ''}`
        : `${entry.sourceId}=${entry.reason}`
    )
    .join(', ')
  const refreshed =
    result.refreshed === undefined
      ? ''
      : result.refreshed === 'timed-out'
        ? ' (timed out)'
        : ` (${result.refreshed.filter((entry) => entry.ok).length}/${result.refreshed.length} ok)`
  return `cache: ${cache || 'none'}; refresh: ${result.refresh}${refreshed}`
}
