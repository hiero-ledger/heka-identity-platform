import { loadPage, renderPage } from '../../src/oidc'

/**
 * Bridge-page templates: the four documents live as
 * `.html` files in `src/oidc/pages/` (copied to dist by nest-cli assets) and
 * are rendered with `{{key}}` placeholder substitution.
 */
describe('bridge-page templates', () => {
  test('all hook templates load and link the shared (built) stylesheet', () => {
    for (const name of ['logout-auto.html', 'logout-confirm.html', 'logout-success.html', 'error.html']) {
      const html = loadPage(name)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('/interaction/assets/styles.css')
    }
  })

  test('the built login page loads and references its bundle', () => {
    // requires `yarn ui:build` — loadPage errors with that hint when missing
    const html = loadPage('ui/login.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('/interaction/assets/login.js')
    expect(html).toContain('/interaction/assets/styles.css')
  })

  test('renderPage inserts values verbatim — no $-pattern mangling, no re-scanning', () => {
    // the XSRF form must be embedded exactly as the library built it
    const form = '<form id="op.logoutForm"><input name="xsrf" value="a$&b{{host}}"/></form>'
    const html = renderPage('logout-confirm.html', { form, host: 'sso.example.com' })

    expect(html).toContain(form) // `$&` stays literal, inserted `{{host}}` is not re-substituted
    expect(html).toContain('Do you want to sign out from sso.example.com?')
  })

  test('unknown placeholders are left in place, not blanked', () => {
    expect(renderPage('error.html', {})).toContain('{{details}}')
  })
})
