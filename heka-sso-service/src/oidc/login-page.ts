/**
 * The wallet login page (INTEGRATION.md P1.6): QR (cross-device) + deep link
 * (same-device) + status polling (P1.6.3). Served by the bridge on its own
 * origin — the page's `status`/`complete` calls ride the `_interaction`
 * cookie, which is what enforces the §3.3 binding rule. Deliberately unstyled:
 * the interaction UI does wallet login only (§6 risk "Interaction UI scope
 * creep"); the DC API same-device path lands in Phase 2 (P2.1).
 */

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

export function renderLoginPage(interactionUid: string, authorizationRequest: string, qrDataUrl: string): string {
  const statusUrl = `/interaction/${encodeURIComponent(interactionUid)}/status`
  const completeUrl = `/interaction/${encodeURIComponent(interactionUid)}/complete`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in with wallet</title></head>
<body>
<h1>Sign in with your wallet</h1>
<p>Scan the QR code with your wallet app, or open it on this device.</p>
<p><img src="${qrDataUrl}" alt="Wallet sign-in QR code" width="260" height="260"></p>
<p><a href="${escapeHtml(authorizationRequest)}">Open wallet on this device</a></p>
<p id="status" role="status">Waiting for the wallet presentation&hellip;</p>
<script>
  (function () {
    var statusEl = document.getElementById('status');
    function poll() {
      fetch(${JSON.stringify(statusUrl)}, { headers: { accept: 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.status === 'verified') {
            statusEl.textContent = 'Presentation verified — signing you in…';
            window.location.href = ${JSON.stringify(completeUrl)};
          } else if (data.status === 'error') {
            statusEl.textContent = data.message || 'Sign-in failed.';
          } else {
            setTimeout(poll, 2000);
          }
        })
        .catch(function () { setTimeout(poll, 5000); });
    }
    setTimeout(poll, 2000);
  })();
</script>
</body>
</html>`
}
