import ipaddr from 'ipaddr.js'

const EXTRA_BLOCK_V4_CIDRS = ['192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24', '198.18.0/15'] as const

const EXTRA_BLOCK_V6_CIDRS = ['2001:db8::/32'] as const

/**
 * Addresses that must not receive notification webhooks: non-global-unicast (`ipaddr` ranges),
 * plus TEST-NET, benchmarking (RFC2544), RFC3849 IPv6 docs, IPv4-translated tails.
 */
export function addressIsBlockedForWebhook(ipString: string): boolean {
  if (!ipaddr.isValid(ipString)) return true
  try {
    const addr = ipaddr.process(ipString)

    if (addr.range() !== 'unicast') return true

    if (addr instanceof ipaddr.IPv4) return matchesAnyCidrIpv4(addr)
    if (addr instanceof ipaddr.IPv6) return matchesAnyCidrIpv6(addr)

    return true
  } catch {
    return true
  }
}

function matchesAnyCidrIpv4(addr: ipaddr.IPv4): boolean {
  for (const spec of EXTRA_BLOCK_V4_CIDRS) {
    const [net, bits] = ipaddr.parseCIDR(spec)
    if (net.kind() === 'ipv4' && addr.match(net, bits)) return true
  }
  return false
}

function matchesAnyCidrIpv6(addr: ipaddr.IPv6): boolean {
  for (const spec of EXTRA_BLOCK_V6_CIDRS) {
    const [net, bits] = ipaddr.parseCIDR(spec)
    if (net.kind() === 'ipv6' && addr.match(net, bits)) return true
  }
  return false
}

const RESERVED_HOSTS = new Set(
  ['localhost', 'metadata.google.internal', 'metadata.goog', 'kubernetes.default', 'kubernetes.default.svc'].map((h) =>
    h.toLowerCase(),
  ),
)

export function hostnameIsExplicitlyBlocked(hostname: string, allowInternalDnsNames: boolean): boolean {
  const h = hostname.toLowerCase().trimEnd()
  if (RESERVED_HOSTS.has(h)) return true

  if (!allowInternalDnsNames) {
    if (h.endsWith('.local')) return true
    if (h.endsWith('.internal')) return true
    if (h.endsWith('.localhost')) return true
  }

  return false
}
