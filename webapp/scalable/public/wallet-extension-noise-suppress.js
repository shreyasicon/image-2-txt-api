/**
 * Runs before React — MetaMask (and similar) inject inpage.js and reject promises;
 * suppress so Next dev overlay / console are not flooded.
 */
(function () {
  function isNoise(msg, src) {
    var m = (msg || '').toLowerCase()
    var s = (src || '').toLowerCase()
    if (m.indexOf('metamask') !== -1) return true
    if (m.indexOf('failed to connect') !== -1) return true
    if (s.indexOf('nkbihfbeogaeaoehlefnkodbefgpgknn') !== -1) return true
    if (s.indexOf('inpage.js') !== -1) return true
    return false
  }
  function reasonToMsg(r) {
    if (r == null) return ''
    if (typeof r === 'string') return r
    try {
      if (typeof r.message === 'string') return r.message
      if (r && typeof r === 'object' && typeof r.reason === 'string') return r.reason
    } catch (e) {}
    try {
      return String(r)
    } catch (e2) {
      return ''
    }
  }
  globalThis.addEventListener(
    'unhandledrejection',
    function (e) {
      if (isNoise(reasonToMsg(e.reason), '')) e.preventDefault()
    },
    true,
  )
  globalThis.addEventListener(
    'error',
    function (e) {
      if (isNoise(e.message || '', e.filename || '')) {
        e.preventDefault()
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
      }
    },
    true,
  )
})()
