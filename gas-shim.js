/**
 * gas-shim.js — makes `google.script.run` work on GitHub Pages by sending each call
 * to your Apps Script web app (Api.gs). Loaded in <head> of index.html before the app script.
 * If you later set APP_PASSWORD in Apps Script, a password screen appears automatically
 * and the device is remembered for 30 days.
 */
(function () {
  'use strict';

  // >>> Paste your Apps Script Web App URL (ends with /exec)
  var API_URL = 'https://script.google.com/macros/s/AKfycbzii72bCTGyR_j_69eANKclU3wxHpGm-c6sb3RPDtZt4yni6RfsTh7lOLVUxfTlnLY8/exec?m=1';

  var TOKEN_KEY = 'gas_token', EXP_KEY = 'gas_token_exp';

  function getToken() {
    try {
      var t = localStorage.getItem(TOKEN_KEY), exp = Number(localStorage.getItem(EXP_KEY) || 0);
      if (t && Date.now() < exp) return t;
    } catch (e) {}
    return null;
  }
  function setToken(t, exp) { try { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(EXP_KEY, String(exp)); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EXP_KEY); } catch (e) {} }

  // text/plain avoids the CORS preflight that Apps Script cannot answer.
  function post(body) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw new Error('Network error ' + r.status);
      return r.json();
    });
  }

  // ---- password screen (only shown if the server asks for it) ----
  var loginPromise = null;
  function showLogin(message) {
    if (loginPromise) return loginPromise;
    loginPromise = new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
      wrap.innerHTML =
        '<form style="background:#fff;border-radius:14px;padding:28px;width:100%;max-width:340px">' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#0f172a">Sign in</h2>' +
        '<p data-msg style="margin:0 0 16px;font-size:13px;color:#64748b">This device will stay signed in for 30 days.</p>' +
        '<input type="password" autocomplete="current-password" placeholder="Password" required style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #cbd5e1;border-radius:8px">' +
        '<button type="submit" style="margin-top:12px;width:100%;padding:12px;font-size:16px;border:0;border-radius:8px;background:#5457d6;color:#fff">Continue</button></form>';
      document.body.appendChild(wrap);
      var form = wrap.querySelector('form'), input = wrap.querySelector('input'), msg = wrap.querySelector('[data-msg]');
      if (message) { msg.textContent = message; msg.style.color = '#b91c1c'; }
      input.focus();
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Checking…';
        post({ action: 'login', password: input.value }).then(function (res) {
          if (res.ok) { setToken(res.token, res.exp); wrap.remove(); loginPromise = null; resolve(); return; }
          btn.disabled = false; btn.textContent = 'Continue'; msg.style.color = '#b91c1c';
          msg.textContent = res.error === 'LOCKED' ? 'Too many attempts. Try again in 15 minutes.' : 'Wrong password.';
          input.value = ''; input.focus();
        }).catch(function () {
          btn.disabled = false; btn.textContent = 'Continue'; msg.style.color = '#b91c1c';
          msg.textContent = 'Could not reach the server.';
        });
      });
    });
    return loginPromise;
  }

  function call(fn, args, retried) {
    return post({ action: 'call', token: getToken(), fn: fn, args: args }).then(function (res) {
      if (res.ok) return res.result;
      if (res.error === 'AUTH' && !retried) {
        clearToken();
        return showLogin('Please sign in.').then(function () { return call(fn, args, true); });
      }
      throw new Error(res.error || 'Unknown error');
    });
  }

  // ---- google.script.run emulation ----
  function makeRunner(onOk, onErr, userObj) {
    return new Proxy({}, {
      get: function (_, name) {
        if (typeof name !== 'string') return undefined;
        if (name === 'withSuccessHandler') return function (f) { return makeRunner(f, onErr, userObj); };
        if (name === 'withFailureHandler') return function (f) { return makeRunner(onOk, f, userObj); };
        if (name === 'withUserObject') return function (o) { return makeRunner(onOk, onErr, o); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          call(name, args).then(function (r) { if (onOk) onOk(r, userObj); })
            .catch(function (e) { if (onErr) onErr(e, userObj); else console.error('[gas-shim]', name, e); });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: makeRunner(), host: { close: function () {}, setHeight: function () {}, setWidth: function () {} } };
  window.gasLogout = function () { clearToken(); location.reload(); };
})();
