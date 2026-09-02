/**
 * The wallet login page (INTEGRATION.md P1.6 + P2.1/P2.1.1): a **static**
 * page served by the bridge on its own origin — the interaction uid comes
 * from the URL and everything else from the same-origin JSON interaction API
 * (`/interaction/:uid/data`, `/dc-api/start`, `/dc-api/verify`, `/status`,
 * `/complete`). Same-origin fetches carry the `_interaction` cookie, which is
 * what enforces the §3.3 binding rule (the design decision recorded in
 * P2.1.1: this page must never move to another origin).
 *
 * P2.1 — the page feature-detects the Digital Credentials API and prefers it
 * (same-device, origin-bound); the cross-device QR + polling path (P1.6.3)
 * remains the fallback. Deliberately unstyled: the interaction UI does wallet
 * login only (§6 risk "Interaction UI scope creep").
 */
export const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in with wallet</title></head>
<body>
<h1>Sign in with your wallet</h1>
<section id="dc-api" hidden>
  <p><button id="dc-api-button" type="button">Sign in with the wallet on this device</button></p>
  <p id="dc-api-status" role="status"></p>
  <p><a id="show-qr" href="#">Show a QR code instead</a></p>
</section>
<section id="qr" hidden>
  <p>Scan the QR code with your wallet app, or open it on this device.</p>
  <p><img id="qr-image" alt="Wallet sign-in QR code" width="260" height="260" hidden></p>
  <p><a id="deep-link" hidden>Open wallet on this device</a></p>
  <p id="qr-status" role="status">Loading&hellip;</p>
</section>
<script>
  (function () {
    var uidMatch = window.location.pathname.match(/\\/interaction\\/([^/]+)/);
    var base = '/interaction/' + (uidMatch ? uidMatch[1] : '');
    var completeUrl = base + '/complete';

    var dcApiSection = document.getElementById('dc-api');
    var dcApiButton = document.getElementById('dc-api-button');
    var dcApiStatus = document.getElementById('dc-api-status');
    var qrSection = document.getElementById('qr');
    var qrImage = document.getElementById('qr-image');
    var deepLink = document.getElementById('deep-link');
    var qrStatus = document.getElementById('qr-status');
    var qrStarted = false;

    function getJson(url, options) {
      return fetch(url, options).then(function (res) { return res.json(); });
    }

    // Feature detection (P2.1): the DC API surface must exist, and where the
    // browser can tell us, it must route the OpenID4VP protocol ids we emit.
    function dcApiSupported() {
      if (!('credentials' in navigator) || typeof navigator.credentials.get !== 'function') return false;
      if (!('DigitalCredential' in window)) return false;
      var allows = window.DigitalCredential.userAgentAllowsProtocol;
      if (typeof allows !== 'function') return true;
      return allows.call(window.DigitalCredential, 'openid4vp-v1-signed')
        || allows.call(window.DigitalCredential, 'openid4vp-v1-unsigned');
    }

    // Cross-device fallback (P1.6.3): fetch the QR/deep-link data — this is
    // what creates the direct_post verification session — then poll status.
    function startQr() {
      qrSection.hidden = false;
      if (qrStarted) return;
      qrStarted = true;
      getJson(base + '/data')
        .then(function (data) {
          if (!data || !data.qrDataUrl) {
            qrStatus.textContent = (data && data.message) || 'The sign-in attempt could not be started.';
            return;
          }
          qrImage.src = data.qrDataUrl;
          qrImage.hidden = false;
          deepLink.href = data.authorizationRequest;
          deepLink.hidden = false;
          qrStatus.textContent = 'Waiting for the wallet presentation…';
          setTimeout(poll, 2000);
        })
        .catch(function () {
          qrStatus.textContent = 'The sign-in attempt could not be started.';
        });
    }

    function poll() {
      getJson(base + '/status', { headers: { accept: 'application/json' } })
        .then(function (data) {
          if (data.status === 'verified') {
            qrStatus.textContent = 'Presentation verified — signing you in…';
            window.location.href = completeUrl;
          } else if (data.status === 'error') {
            qrStatus.textContent = data.message || 'Sign-in failed.';
          } else {
            setTimeout(poll, 2000);
          }
        })
        .catch(function () { setTimeout(poll, 5000); });
    }

    // Same-device DC API path (P2.1): create a dc_api session, hand the
    // request to the OS credential picker, and forward the wallet's response
    // to the bridge, which verifies it via the identity service's origin-bound
    // verify endpoint. Requires a user gesture, hence the button.
    function startDcApi() {
      dcApiButton.disabled = true;
      dcApiStatus.textContent = 'Waiting for your wallet…';
      getJson(base + '/dc-api/start', { method: 'POST' })
        .then(function (start) {
          if (!start || !start.request) throw new Error((start && start.message) || 'start-failed');
          return navigator.credentials.get({
            digital: { requests: [{ protocol: start.protocol, data: start.request }] },
          });
        })
        .then(function (credential) {
          if (!credential || !credential.data) throw new Error('no-credential');
          var data = credential.data;
          var authorizationResponse = typeof data === 'string' ? JSON.parse(data) : data;
          dcApiStatus.textContent = 'Verifying the presentation…';
          return getJson(base + '/dc-api/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorizationResponse: authorizationResponse }),
          });
        })
        .then(function (result) {
          if (result.status !== 'verified') {
            throw new Error(result.message || 'The presentation could not be verified.');
          }
          dcApiStatus.textContent = 'Presentation verified — signing you in…';
          window.location.href = completeUrl;
        })
        .catch(function (error) {
          dcApiButton.disabled = false;
          var name = error && error.name;
          if (name === 'NotAllowedError' || name === 'AbortError') {
            // picker dismissed / no credential chosen — let the user retry or fall back
            dcApiStatus.textContent = 'Sign-in was cancelled — try again or use the QR code.';
          } else {
            var message = (error && error.message) || '';
            if (message === 'start-failed' || message === 'no-credential') message = '';
            dcApiStatus.textContent = message || 'Sign-in failed — try the QR code instead.';
          }
          startQr();
        });
    }

    if (dcApiSupported()) {
      dcApiSection.hidden = false;
      dcApiButton.addEventListener('click', startDcApi);
      document.getElementById('show-qr').addEventListener('click', function (event) {
        event.preventDefault();
        startQr();
      });
    } else {
      startQr();
    }
  })();
</script>
</body>
</html>`
