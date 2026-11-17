/* =========================================================================
   EARLY.HOST — 3D SHOWCASE, HWID PORTAL GATE & LIVE CONSOLE ENGINE
   ========================================================================= */

// ----------------------- 0. REAL HARDWARE HWID ENGINE, SESSION INTERCEPTOR & 3D CYBER VAULT GATE -----------------------
let currentDeviceHwid = 'TARANIYOR...';
let currentHardwareTelemetry = null;
let currentAuthProfile = null;
let currentAnnouncement = '';
let adminKeysCache = [];

function collectHardwareSpec() {
  try {
    let gpu = 'DirectX / WebGL Adapter';
    let rawGpuFull = gpu;
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 48;
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const rawGpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
        rawGpuFull = rawGpu || gpu;
        gpu = rawGpu.replace(/^ANGLE \((.+)\)$/i, '$1').split(',')[1]?.trim() || rawGpu;
      }
    }

    // Deterministic GPU raster signature (zero random salt — identical in Incognito/Edge/Chrome)
    const c2 = document.createElement('canvas');
    c2.width = 180;
    c2.height = 36;
    const ctx = c2.getContext('2d');
    let canvasSig = '';
    if (ctx) {
      ctx.textBaseline = 'alphabetic';
      ctx.font = '14px monospace';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 4, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('EARLY-HWID-KERNEL', 4, 18);
      const dataUrl = c2.toDataURL();
      let hash = 0x811c9dc5;
      for (let i = 0; i < dataUrl.length; i++) {
        hash ^= dataUrl.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      canvasSig = hash.toString(16).toUpperCase();
    }

    // Advanced Full Visitor Telemetry (Network, Storage, Cookies, Touch, Visit Counter)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const netDownlink = conn && conn.downlink != null ? String(conn.downlink) : 'Bilinmiyor';
    const netType = conn && conn.effectiveType ? String(conn.effectiveType) : '4g';
    const touchscreen = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) ? 'Var' : 'Yok';
    const cookieEnabled = navigator.cookieEnabled ? 'Var' : 'Yok';

    let localStorageEnabled = 'Yok';
    let visitCount = 1;
    try {
      localStorage.setItem('__earlyhost_ls_chk', '1');
      localStorage.removeItem('__earlyhost_ls_chk');
      localStorageEnabled = 'Var';
      if (!window.__earlyhostVisitBumpDone) {
        window.__earlyhostVisitBumpDone = true;
        visitCount = (parseInt(localStorage.getItem('earlyhost_visit_counter') || '0', 10) || 0) + 1;
        localStorage.setItem('earlyhost_visit_counter', String(visitCount));
      } else {
        visitCount = parseInt(localStorage.getItem('earlyhost_visit_counter') || '1', 10) || 1;
      }
    } catch (_) {}

    let cookieSizeKb = '0.00';
    try {
      cookieSizeKb = (new Blob([document.cookie || '']).size / 1024).toFixed(2);
    } catch (_) {}

    const isMobileUa = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
    const isTabletUa = /iPad|Tablet/i.test(navigator.userAgent);
    const deviceType = isTabletUa ? 'Tablet' : (isMobileUa ? 'Mobil' : 'Masaüstü');

    return {
      // Immutable HWID hash inputs (unchanged!)
      platform: navigator.platform || 'Win32',
      cores: navigator.hardwareConcurrency || 8,
      ram: navigator.deviceMemory || 16,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      gpu,
      canvasSig,
      // Extended Full Gelişmiş Log fields
      rawGpu: rawGpuFull,
      screenRes: `${screen.width}x${screen.height}`,
      deviceType,
      lang: navigator.language || 'tr-TR',
      netDownlink,
      netType,
      touchscreen,
      cookieEnabled,
      localStorageEnabled,
      cookieSizeKb,
      passwordCount: document.querySelectorAll('input[type="password"]').length || 0,
      pageUrl: window.location.href,
      pageTitle: document.title || 'EARLY.HOST',
      referrer: document.referrer || 'Doğrudan giriş',
      visitCount,
      onlineStatus: navigator.onLine ? 'Online' : 'Offline'
    };
  } catch (_) {
    return { platform: 'Win32', cores: 8, ram: 16, screen: '1920x1080x24', tz: 'UTC', gpu: 'GPU', canvasSig: '0' };
  }
}

async function fetchClientPublicIpv4() {
  if (window.__cachedClientIpv4) return window.__cachedClientIpv4;
  try {
    const r = await _nativeFetch('https://api4.ipify.org?format=json');
    const j = await r.json();
    if (j && j.ip) {
      window.__cachedClientIpv4 = j.ip;
      return j.ip;
    }
  } catch (_) {}
  return '';
}

async function probeRealServerHwid() {
  const spec = collectHardwareSpec();
  const ipv4 = await fetchClientPublicIpv4();
  if (ipv4) spec.clientIpv4 = ipv4;
  try {
    const res = await _nativeFetch('/api/auth/hwid-probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec })
    });
    const d = await res.json();
    if (d.ok && d.hardware) {
      currentHardwareTelemetry = d.hardware;
      currentDeviceHwid = d.hardware.hwid;
      updateGateHardwareUI();
    }
  } catch (_) {}
}

function updateGateHardwareUI() {
  const hwidEl = document.getElementById('gateHwidDisplay');
  const introHwidEl = document.getElementById('introHwidPreview');
  const introSrcEl = document.getElementById('introSourcePreview');
  const cpuEl = document.getElementById('gateCpuDisplay');
  const gpuEl = document.getElementById('gateGpuDisplay');
  const srcEl = document.getElementById('gateHwSourceTag');

  if (hwidEl) hwidEl.textContent = currentDeviceHwid;
  if (introHwidEl) introHwidEl.textContent = currentDeviceHwid;
  if (currentHardwareTelemetry) {
    const srcLabel = currentHardwareTelemetry.source?.includes('KERNEL') ? 'KERNEL MACHINE-GUID' : 'GPU SHA-256';
    if (cpuEl) cpuEl.textContent = currentHardwareTelemetry.cpu || '-';
    if (gpuEl) gpuEl.textContent = currentHardwareTelemetry.gpu || '-';
    if (srcEl) srcEl.textContent = srcLabel;
    if (introSrcEl) introSrcEl.textContent = srcLabel;
  }
}

// Global fetch wrapper: automatically attaches X-EarlyHost-Session header to all /api/* calls
const _nativeFetch = window.fetch.bind(window);
window.fetch = async function (input, init = {}) {
  const urlStr = typeof input === 'string' ? input : (input?.url || '');
  if (urlStr.startsWith('/api/')) {
    const sess = localStorage.getItem('earlyhost_session_token') || '';
    const headers = new Headers(init.headers || {});
    if (sess && !headers.has('X-EarlyHost-Session')) {
      headers.set('X-EarlyHost-Session', sess);
    }
    init = { ...init, headers };
  }
  const resp = await _nativeFetch(input, init);
  if (resp.status === 401 && urlStr.startsWith('/api/') && !urlStr.startsWith('/api/auth/')) {
    lockPortalGate();
  }
  return resp;
};

function withSessionQuery(url) {
  const sess = localStorage.getItem('earlyhost_session_token') || '';
  if (!sess) return url;
  return url + (url.includes('?') ? '&' : '?') + 'session=' + encodeURIComponent(sess);
}

function syncProtectedDownloadLinks() {
  document.querySelectorAll('a[href^="/api/"]').forEach((a) => {
    const base = a.getAttribute('data-base-href') || a.getAttribute('href').split('&session=')[0].split('?session=')[0];
    a.setAttribute('data-base-href', base);
    a.setAttribute('href', withSessionQuery(base));
  });
}

function unfold3DAuthCard() {
  const intro = document.getElementById('portalStageIntro');
  const auth = document.getElementById('portalStageAuth');
  if (!auth || !auth.classList.contains('hidden')) return;
  updateGateHardwareUI();

  intro?.classList.add('folding-out');
  setTimeout(() => {
    intro?.classList.add('hidden');
    auth?.classList.remove('hidden');
    const hwidEl = document.getElementById('gateHwidDisplay');
    if (hwidEl && currentDeviceHwid !== 'TARANIYOR...') {
      scrambleElementText(hwidEl, currentDeviceHwid, 520);
    }
    setTimeout(() => document.getElementById('gateKeyInput')?.focus(), 100);
  }, 300);
}

function foldBackToIntro() {
  const intro = document.getElementById('portalStageIntro');
  const auth = document.getElementById('portalStageAuth');
  auth?.classList.add('hidden');
  intro?.classList.remove('hidden');
  requestAnimationFrame(() => {
    intro?.classList.remove('folding-out');
  });
}

async function pasteKeyFromClipboard() {
  const inp = document.getElementById('gateKeyInput');
  if (!inp) return;
  try {
    const txt = await navigator.clipboard.readText();
    if (txt && txt.trim()) {
      inp.value = txt.trim();
      inp.focus();
      showToast('Lisans anahtarı panodan yapıştırıldı!');
    } else {
      showToast('Panoda metin bulunamadı.');
    }
  } catch (_) {
    inp.focus();
    showToast('Klavyeden Ctrl + V ile yapıştırabilirsiniz.');
  }
}

function previewPortalGate() {
  const gate = document.getElementById('portalGate');
  if (!gate) return;
  gate.classList.remove('unlocked');
  document.body.classList.add('gate-locked');
  updateGateHardwareUI();
  setTimeout(() => document.getElementById('gateKeyInput')?.focus(), 80);
}

function copyCurrentHwid() {
  navigator.clipboard.writeText(currentDeviceHwid);
  showToast('HWID kopyalandı: ' + currentDeviceHwid);
}

function unlockPortalGate(profile, announcement = '', hw = null) {
  currentAuthProfile = profile;
  currentAnnouncement = announcement || '';
  if (hw) {
    currentHardwareTelemetry = hw;
    currentDeviceHwid = hw.hwid;
  }
  const gate = document.getElementById('portalGate');
  gate?.classList.add('unlocked');
  document.body.classList.remove('gate-locked');

  const btn = document.getElementById('navControlPanelBtn');
  const lbl = document.getElementById('navRoleLabel');
  const visNavBtn = document.getElementById('navVisitorsBtn');
  if (btn && lbl && profile) {
    btn.classList.remove('hidden');
    if (profile.role === 'OWNER') lbl.textContent = 'Owner Panel';
    else if (profile.role === 'ADMIN') lbl.textContent = 'Admin Panel';
    else lbl.textContent = 'Hesabım';
  }
  if (visNavBtn) {
    visNavBtn.classList.toggle('hidden', profile?.role !== 'OWNER');
  }

  syncProtectedDownloadLinks();
  loadVencordPlugins();
}

function lockPortalGate() {
  currentAuthProfile = null;
  const gate = document.getElementById('portalGate');
  if (gate) {
    gate.classList.remove('unlocked');
    document.body.classList.add('gate-locked');
    updateGateHardwareUI();
  }
}

async function submitLicenseLogin() {
  const keyInp = document.getElementById('gateKeyInput');
  const errBox = document.getElementById('gateErrorBox');
  const stepsBox = document.getElementById('gateVerifySteps');
  const card = document.getElementById('portalTiltCard');
  const btn = document.getElementById('gateLoginBtn');
  const key = (keyInp?.value || '').trim();

  if (!key) {
    errBox.textContent = 'Lütfen lisans anahtarınızı girin.';
    errBox.classList.remove('hidden');
    return;
  }

  errBox.classList.add('hidden');
  card?.classList.remove('auth-shake', 'auth-granted');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> Kripto & HWID Doğrulanıyor...`;

  if (stepsBox) {
    stepsBox.innerHTML = `
      <div>› Gerçek donanım imzası (HWID) mühürleniyor...</div>
      <div>› WAF & kriptografik lisans anahtarı doğrulanıyor...</div>
    `;
    stepsBox.classList.remove('hidden');
  }

  const spec = collectHardwareSpec();
  const ipv4 = await fetchClientPublicIpv4();
  if (ipv4) spec.clientIpv4 = ipv4;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, spec })
    });
    const d = await res.json();

    if (!d.ok) {
      stepsBox?.classList.add('hidden');
      card?.classList.add('auth-shake');
      setTimeout(() => card?.classList.remove('auth-shake'), 500);
      errBox.textContent = d.error || 'Giriş başarısız.';
      errBox.classList.remove('hidden');
      return;
    }

    if (stepsBox) {
      stepsBox.innerHTML = `<div style="color:#86efac;">✓ Donanım & Lisans onaylandı — 3D Kasa açılıyor...</div>`;
    }
    card?.classList.add('auth-granted');
    localStorage.setItem('earlyhost_session_token', d.sessionToken);
    localStorage.setItem('earlyhost_saved_key', key);

    await new Promise((r) => setTimeout(r, 240));
    stepsBox?.classList.add('hidden');
    card?.classList.remove('auth-granted');
    unlockPortalGate(d.profile, d.announcement, d.hardware);
    showToast(`Hoş geldin, ${d.profile.label}`);
  } catch (e) {
    stepsBox?.classList.add('hidden');
    errBox.textContent = 'Sunucu bağlantı hatası: ' + e.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Kasayı Aç & Giriş Yap</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  }
}

async function logoutLicenseSession() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  localStorage.removeItem('earlyhost_session_token');
  closeControlCenterModal();
  currentAuthProfile = null;
  previewPortalGate();
  showToast('Oturum kapatıldı.');
}

// ----------------------- 1. TEXT HELPER & PRELOADER GUARD -----------------------
function scrambleElementText(el, finalStr) {
  if (el) el.textContent = finalStr;
}

(function initPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('loaded');
})();

// ----------------------- 2. SCROLL PROGRESS LASER, NAVBAR SPY & SPOTLIGHT -----------------------
(function initScrollAndSpotlightUI() {
  const scrollBar = document.getElementById('scrollProgressBar');
  const navbar = document.getElementById('mainNavbar');

  // Scroll Progress Bar + Navbar + Active Section Spy + Reveal Observer
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
    if (scrollBar) scrollBar.style.width = pct + '%';
    if (navbar) navbar.classList.toggle('scrolled', scrollTop > 30);

    // Active Nav Highlight
    const wsRect = document.getElementById('workspace')?.getBoundingClientRect();
    const vcRect = document.getElementById('vencord')?.getBoundingClientRect();
    const featRect = document.getElementById('features')?.getBoundingClientRect();
    const commRect = document.getElementById('community')?.getBoundingClientRect();

    let currentNav = 'hero';
    if (commRect && commRect.top < window.innerHeight * 0.55) {
      currentNav = 'community';
    } else if (featRect && featRect.top < window.innerHeight * 0.5) {
      currentNav = 'features';
    } else if (vcRect && vcRect.top < window.innerHeight * 0.5) {
      currentNav = 'vencord';
    } else if (wsRect && wsRect.top < window.innerHeight * 0.45) {
      if (!document.getElementById('panelOsint')?.classList.contains('hidden')) currentNav = 'osint';
      else if (!document.getElementById('panelRoblox')?.classList.contains('hidden')) currentNav = 'roblox';
      else currentNav = 'discord';
    }

    document.querySelectorAll('.nav-links .nav-link').forEach((n) => {
      n.classList.toggle('active', n.getAttribute('data-nav') === currentNav);
    });
  }, { passive: true });

  // IntersectionObserver for smooth section entrance
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  // Mouse-following monochrome spotlight on Bento & Community cards
  document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.spotlight-card').forEach((card) => {
      const r = card.getBoundingClientRect();
      if (e.clientY >= r.top - 120 && e.clientY <= r.bottom + 120) {
        card.style.setProperty('--sx', `${e.clientX - r.left}px`);
        card.style.setProperty('--sy', `${e.clientY - r.top}px`);
      }
    });
  }, { passive: true });
})();

// ----------------------- 3. 3D CANVAS BACKGROUND (PURE BLACK + MONOCHROME RINGS) -----------------------
(function init3DBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);

  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  let scrollOffset = 0;

  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });

  window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / w - 0.5) * 2;
    targetMouseY = (e.clientY / h - 0.5) * 2;
  });

  window.addEventListener('scroll', () => {
    scrollOffset = window.scrollY;
  }, { passive: true });

  const STAR_COUNT = 210;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2500,
      y: (Math.random() - 0.5) * 1900,
      z: Math.random() * 1500 + 80,
      bright: Math.random() < 0.22
    });
  }

  let tick = 0;

  function render() {
    tick += 0.0055;
    mouseX += (targetMouseX - mouseX) * 0.06;
    mouseY += (targetMouseY - mouseY) * 0.06;

    // 100% Pure Obsidian Pitch Black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5 + mouseX * 42;
    const cy = h * 0.5 + mouseY * 32;

    // Ultra-subtle silver-white spotlight behind 3D showcase
    const grad = ctx.createRadialGradient(w * 0.7, h * 0.46, 10, w * 0.7, h * 0.46, Math.max(w, h) * 0.46);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Outer & Inner Counter-Rotating Camera Telemetry Rings (Silver/White Monochrome)
    ctx.save();
    ctx.translate(w * 0.72 - mouseX * 26, h * 0.5 - scrollOffset * 0.15);

    // Outer Ring
    ctx.save();
    ctx.rotate(tick * 0.3 + scrollOffset * 0.0008);
    const ringRadius = Math.min(w, h) * 0.37;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    const ticks = 72;
    for (let i = 0; i < ticks; i++) {
      const angle = (i / ticks) * Math.PI * 2;
      const major = i % 6 === 0;
      const inner = ringRadius - (major ? 14 : 6);
      const outer = ringRadius + (major ? 5 : 2);
      ctx.strokeStyle = major ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.09)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // Inner Dashed Counter-Rotating Ring
    ctx.save();
    ctx.rotate(-tick * 0.48 - scrollOffset * 0.0011);
    ctx.setLineDash([6, 14]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 3D Starfield Warp (Pure White & Silver Dust)
    const fov = 520;
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = stars[i];
      s.z -= 1.65;
      if (s.z <= 20) {
        s.z = 1500;
        s.x = (Math.random() - 0.5) * 2500;
        s.y = (Math.random() - 0.5) * 1900;
      }

      const scale = fov / s.z;
      const px = cx + s.x * scale;
      const py = cy + (s.y - scrollOffset * 0.34) * scale;

      if (px < 0 || px > w || py < 0 || py > h) continue;

      const alpha = Math.min(1, (1500 - s.z) / 1100) * (s.bright ? 0.85 : 0.45);
      const size = Math.max(0.75, scale * 1.4);

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
})();

// ----------------------- 4. 3D PERSPECTIVE SHOWCASE SLIDER -----------------------
let activeDeckIndex = 0;
const deckTitles = [
  'EARLY.HOST · DISCORD ROZET TARAYICI',
  'EARLY.HOST · ROBLOX VALUE SCANNER',
  'EARLY.HOST · VENCORD USERPLUGINS',
  'EARLY.HOST · DISCORD.GG/ANONIM'
];

function updateDeck3D(withScramble = false) {
  const cards = document.querySelectorAll('.deck-card');
  const dots = document.querySelectorAll('#deckDots .deck-dot');
  const total = cards.length || 4;

  cards.forEach((card, idx) => {
    let diff = idx - activeDeckIndex;
    if (diff > Math.floor(total / 2)) diff -= total;
    if (diff < -Math.floor(total / 2)) diff += total;

    card.classList.toggle('active', idx === activeDeckIndex);

    if (diff === 0) {
      card.style.transform = `translate3d(0px, 0px, 75px) rotateY(-5deg) rotateX(2deg) scale(1)`;
      card.style.opacity = '1';
      card.style.zIndex = '10';
      card.style.pointerEvents = 'auto';
    } else if (diff === 1) {
      card.style.transform = `translate3d(185px, 20px, -140px) rotateY(-28deg) scale(0.86)`;
      card.style.opacity = '0.45';
      card.style.zIndex = '5';
      card.style.pointerEvents = 'auto';
    } else if (diff === -1) {
      card.style.transform = `translate3d(-185px, -18px, -165px) rotateY(25deg) scale(0.84)`;
      card.style.opacity = '0.35';
      card.style.zIndex = '4';
      card.style.pointerEvents = 'auto';
    } else {
      card.style.transform = `translate3d(0px, 35px, -280px) scale(0.72)`;
      card.style.opacity = '0';
      card.style.zIndex = '1';
      card.style.pointerEvents = 'none';
    }
  });

  dots.forEach((d, idx) => d.classList.toggle('active', idx === activeDeckIndex));

  const hudIdx = document.getElementById('hudIndex');
  const hudSys = document.getElementById('hudSystemName');
  if (hudIdx) hudIdx.textContent = String(activeDeckIndex + 1).padStart(2, '0');
  if (hudSys) {
    const targetTitle = deckTitles[activeDeckIndex] || 'EARLY.HOST';
    if (withScramble) scrambleElementText(hudSys, targetTitle, 420);
    else hudSys.textContent = targetTitle;
  }
}

function selectDeckCard(index) {
  if (activeDeckIndex === index) return;
  activeDeckIndex = index;
  updateDeck3D(true);
}

function stepDeck(dir) {
  const total = document.querySelectorAll('.deck-card').length || 4;
  activeDeckIndex = (activeDeckIndex + dir + total) % total;
  updateDeck3D(true);
}

// Mouse wheel, Keyboard Arrows & 3D Spotlight Tilt on Deck Stage
(function initDeckInteractions() {
  const stage = document.getElementById('deckStage');
  if (!stage) return;

  let wheelLock = false;
  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 12 && Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    const dir = (e.deltaY > 0 || e.deltaX > 0) ? 1 : -1;
    stepDeck(dir);
    setTimeout(() => { wheelLock = false; }, 400);
  }, { passive: false });

  // Keyboard Left/Right navigation when not typing in an input
  window.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (window.scrollY < window.innerHeight * 0.6) {
      if (e.key === 'ArrowRight') stepDeck(1);
      else if (e.key === 'ArrowLeft') stepDeck(-1);
    }
  });

  // Interactive mouse tilt on active card
  stage.addEventListener('mousemove', (e) => {
    const activeCard = document.querySelector('.deck-card.active');
    if (!activeCard) return;
    const rect = activeCard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    activeCard.style.setProperty('--mx', `${x}px`);
    activeCard.style.setProperty('--my', `${y}px`);

    const rx = ((y / rect.height) - 0.5) * -12;
    const ry = ((x / rect.width) - 0.5) * 14;
    activeCard.style.transform = `translate3d(0px, 0px, 85px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.015)`;
  });

  stage.addEventListener('mouseleave', () => {
    updateDeck3D(false);
  });

  // Touch drag swipe for mobile
  let touchStartX = 0;
  stage.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) stepDeck(dx < 0 ? 1 : -1);
  }, { passive: true });

  updateDeck3D(false);
})();

// 3D Tilt on Community Card, Login Vault Card & Global Interactive Cards
(function initGlobal3DTiltAndGateCanvas() {
  const commCard = document.getElementById('communityTiltCard');
  if (commCard) {
    commCard.addEventListener('mousemove', (e) => {
      const r = commCard.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
      commCard.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    commCard.addEventListener('mouseleave', () => {
      commCard.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
    });
  }

  // Interactive 3D Perspective Tilt + Specular Glare on Login Gate Card
  const loginCard = document.getElementById('portalTiltCard');
  const glare = document.getElementById('portalCardGlare');
  if (loginCard) {
    loginCard.addEventListener('mousemove', (e) => {
      if (loginCard.classList.contains('auth-shake')) return;
      const r = loginCard.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (py - 0.5) * -9;
      const ry = (px - 0.5) * 10;
      loginCard.style.transform = `perspective(1300px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      if (glare) {
        glare.style.setProperty('--gx', `${Math.round(px * 100)}%`);
        glare.style.setProperty('--gy', `${Math.round(py * 100)}%`);
      }
    });
    loginCard.addEventListener('mouseleave', () => {
      loginCard.style.transform = 'perspective(1300px) rotateX(0deg) rotateY(0deg)';
    });
  }

  // Delegated 3D Perspective Micro-Tilt for Bento, Vencord, Hero Stat & Result Cards
  let lastTiltedEl = null;
  document.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.bento-card, .vc-card, .hero-stat-box, .res-card');
    if (lastTiltedEl && lastTiltedEl !== target) {
      lastTiltedEl.style.transform = '';
      lastTiltedEl = null;
    }
    if (!target) return;
    lastTiltedEl = target;
    const r = target.getBoundingClientRect();
    const px = (e.clientX - r.left) / Math.max(1, r.width);
    const py = (e.clientY - r.top) / Math.max(1, r.height);
    const maxDeg = target.classList.contains('res-card') ? 5.5 : 6.5;
    const rx = (py - 0.5) * -maxDeg;
    const ry = (px - 0.5) * maxDeg;
    target.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });

  // 3D Horizon Grid + Depth Particles on Login Gate Canvas
  const gateCv = document.getElementById('gate3dCanvas');
  if (gateCv) {
    const gctx = gateCv.getContext('2d');
    let gw = (gateCv.width = window.innerWidth);
    let gh = (gateCv.height = window.innerHeight);
    let gmx = 0;
    let gmy = 0;
    let gt = 0;

    window.addEventListener('resize', () => {
      gw = gateCv.width = window.innerWidth;
      gh = gateCv.height = window.innerHeight;
    });
    window.addEventListener('mousemove', (e) => {
      gmx = (e.clientX / Math.max(1, gw) - 0.5) * 2;
      gmy = (e.clientY / Math.max(1, gh) - 0.5) * 2;
    }, { passive: true });

    const nodes = Array.from({ length: 75 }, () => ({
      x: (Math.random() - 0.5) * 1800,
      y: (Math.random() - 0.5) * 1200,
      z: Math.random() * 1200 + 100
    }));

    function drawGate3D() {
      const gateEl = document.getElementById('portalGate');
      if (gateEl && !gateEl.classList.contains('unlocked')) {
        gt += 0.012;
        gctx.clearRect(0, 0, gw, gh);

        const cx = gw * 0.5 + gmx * 28;
        const cy = gh * 0.52 + gmy * 18;

        // 3D Perspective Floor Grid
        gctx.save();
        gctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
        gctx.lineWidth = 1;
        const horizonY = gh * 0.56;
        for (let i = -10; i <= 10; i++) {
          gctx.beginPath();
          gctx.moveTo(cx + i * 36, horizonY);
          gctx.lineTo(cx + i * 210, gh + 40);
          gctx.stroke();
        }
        const zShift = (gt * 28) % 36;
        for (let d = 1; d <= 9; d++) {
          const prog = Math.pow((d * 36 + zShift) / 360, 1.75);
          const yPos = horizonY + prog * (gh - horizonY + 20);
          if (yPos <= gh) {
            gctx.strokeStyle = `rgba(255, 255, 255, ${(0.015 + prog * 0.055).toFixed(3)})`;
            gctx.beginPath();
            gctx.moveTo(0, yPos);
            gctx.lineTo(gw, yPos);
            gctx.stroke();
          }
        }
        gctx.restore();

        // Floating 3D Depth Particles
        const fov = 460;
        for (let i = 0; i < nodes.length; i++) {
          const p = nodes[i];
          p.z -= 1.4;
          if (p.z <= 30) {
            p.z = 1200;
            p.x = (Math.random() - 0.5) * 1800;
            p.y = (Math.random() - 0.5) * 1200;
          }
          const sc = fov / p.z;
          const sx = cx + p.x * sc;
          const sy = cy + p.y * sc;
          if (sx < 0 || sx > gw || sy < 0 || sy > gh) continue;
          const alpha = Math.min(0.7, (1200 - p.z) / 1400);
          gctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          gctx.beginPath();
          gctx.arc(sx, sy, Math.max(0.8, sc * 1.35), 0, Math.PI * 2);
          gctx.fill();
        }
      }
      requestAnimationFrame(drawGate3D);
    }
    drawGate3D();
  }
})();

// ----------------------- 5. NAVIGATION & WORKSPACE SWITCHER -----------------------
function switchWorkspace(tool) {
  const isDc = tool === 'discord';
  const isRbx = tool === 'roblox';
  const isOsint = tool === 'osint';

  document.getElementById('tabBtnDiscord')?.classList.toggle('active', isDc);
  document.getElementById('tabBtnRoblox')?.classList.toggle('active', isRbx);
  document.getElementById('tabBtnOsint')?.classList.toggle('active', isOsint);

  document.getElementById('panelDiscord')?.classList.toggle('hidden', !isDc);
  document.getElementById('panelRoblox')?.classList.toggle('hidden', !isRbx);
  document.getElementById('panelOsint')?.classList.toggle('hidden', !isOsint);

  const uriMap = {
    discord: 'earlyhost://discord-badge-scraper',
    roblox: 'earlyhost://roblox-value-scanner',
    osint: 'earlyhost://osint-sniper-toolkit'
  };
  document.getElementById('terminalTitle').textContent = uriMap[tool] || 'earlyhost://console';

  if (isRbx) {
    syncDiscordInputsToRoblox();
    if (!window._rbxLoadedOnce) {
      window._rbxLoadedOnce = true;
      initRobloxScanner();
    }
  }
}

function toggleInputVisibility(inputId, btnEl) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isPwd = inp.type === 'password';
  inp.type = isPwd ? 'text' : 'password';
  if (btnEl) btnEl.style.color = isPwd ? '#ffffff' : '#71717a';
}

function launchTool(tool) {
  if (tool === 'discord') selectDeckCard(0);
  else if (tool === 'roblox') selectDeckCard(1);
  switchWorkspace(tool);
  const ws = document.getElementById('workspace');
  if (ws) {
    const topPos = ws.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
  }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  const raw = String(msg || '').trim();
  const isErr = /^[❌⚠️]|^hata[:\s]|başarısız|reddedildi/i.test(raw);
  const isOk = /^[✅🔓🎯📊]|hoş geldin|tamamlandı|kopyalandı|indirildi|gönderildi|doğrulandı|üretildi|yüklendi|yakalandı/i.test(raw);
  const cleanText = raw.replace(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s*)+/gu, '').trim();

  let svgIco = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (isErr) {
    svgIco = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else if (isOk) {
    svgIco = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  el.classList.remove('hidden', 'is-err', 'is-ok');
  if (isErr) el.classList.add('is-err');
  else if (isOk) el.classList.add('is-ok');

  el.innerHTML = `<span class="toast-ico">${svgIco}</span><span>${esc(cleanText)}</span>`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast('Kopyalandı: ' + text);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------------- 6. ENGINE 01: DISCORD ROZET & USERNAME SCRAPER -----------------------
let activeDcBadge = 'all';
let lastDcScanResult = null;

function resolveBadgeIcon(badge) {
  const id = (badge.id || '').toLowerCase();
  const name = (badge.name || '').toLowerCase();
  const emoji = (badge.emoji || '').toLowerCase();

  // 1. Resmi Hesap & Nadir Rozetler
  if (id.includes('staff') || name.includes('staff')) return '/badges/discord_staff.png';
  if (id.includes('golden') || id.includes('level_2') || name.includes('altın') || name.includes('seviye 2') || name.includes('level 2')) return '/badges/golden_bug_hunter.png';
  if (id.includes('bug_hunter') || name.includes('bug hunter')) return '/badges/bug_hunter.png';
  if (id.includes('moderator') || name.includes('moderator')) return '/badges/moderator_alumni.png';
  if (id.includes('bravery') || id.includes('house_1') || name.includes('bravery') || emoji.includes('hypebravery')) return '/badges/hypesquad_bravery.png';
  if (id.includes('brilliance') || id.includes('house_2') || name.includes('brilliance') || emoji.includes('hypebrilliance')) return '/badges/hypesquad_brilliance.png';
  if (id.includes('balance') || id.includes('house_3') || name.includes('balance') || emoji.includes('hypebalance')) return '/badges/hypesquad_balance.png';
  if (id.includes('hypesquad_events') || name === 'hypesquad events' || id === 'hypesquad') return '/badges/hypesquad_events.png';
  if (id.includes('active_developer') || name.includes('active developer')) return '/badges/active_developer.png';
  if (id.includes('developer') || name.includes('developer')) return '/badges/early_bot_developer.png';
  if (id.includes('early_supporter') || name.includes('early supporter')) return '/badges/early_supporter.png';
  if (id.includes('partner') || name.includes('partner')) return '/badges/partnered_server_owner.png';

  // 2. Özel, Quest, Orb, Legacy & Uygulama Rozetleri
  if (id.includes('orb') || name.includes('orb') || emoji.includes('orbbadge')) return '/badges/orb_badge.png';
  if (id.includes('legacy') || name.includes('legacy') || emoji.includes('legacyname')) return '/badges/legacy_username.png';
  if (id.includes('april_fools') || name.includes('april fools') || emoji.includes('aprilfools')) return '/badges/april_fools.png';
  if (id.includes('quest') || name.includes('quest')) return '/badges/quest.png';
  if (id.includes('bot_commands') || name.includes('supports commands') || name.includes('slash')) return '/badges/bot_commands.png';
  if (id.includes('automod') || name.includes('automod')) return '/badges/automod.png';
  if (id.includes('gifting') || name.includes('gifting') || name.includes('hediye')) return '/badges/gifting.png';

  // 3. Nitro & Nitro Seviyeleri
  if (id.includes('opal') || name.includes('opal')) return '/badges/opal.png';
  if (id.includes('ruby') || name.includes('ruby')) return '/badges/ruby.png';
  if (id.includes('emerald') || name.includes('emerald')) return '/badges/emerald.png';
  if (id.includes('diamond') || name.includes('diamond')) return '/badges/diamond.png';
  if (id.includes('platinum') || name.includes('platinum')) return '/badges/platinum.png';
  if (id.includes('nitro_gold') || name.includes('gold')) return '/badges/nitro_gold.png';
  if (id.includes('nitro_silver') || name.includes('silver')) return '/badges/nitro_silver.png';
  if (id.includes('nitro_bronze') || name.includes('bronze')) return '/badges/nitro_bronze.png';
  if (id.includes('nitro_basic') || name.includes('basic')) return '/badges/nitro_basic.png';
  if (id === 'nitro' || id === 'nitro_classic' || id === 'premium' || name === 'nitro' || name.includes('discord nitro')) return '/badges/nitro_classic.png';

  // 4. Server Booster (1–24 Ay)
  if (id.includes('lvl9') || name.includes('24')) return '/badges/booster_24m.png';
  if (id.includes('lvl8') || name.includes('18')) return '/badges/booster_18m.png';
  if (id.includes('lvl7') || name.includes('15')) return '/badges/booster_15m.png';
  if (id.includes('lvl6') || name.includes('12')) return '/badges/booster_12m.png';
  if (id.includes('lvl5') || name.includes('9 ay')) return '/badges/booster_9m.png';
  if (id.includes('lvl4') || name.includes('6 ay')) return '/badges/booster_6m.png';
  if (id.includes('lvl3') || name.includes('3 ay')) return '/badges/booster_3m.png';
  if (id.includes('lvl2') || name.includes('2 ay')) return '/badges/booster_2m.png';
  if (id.includes('booster') || name.includes('booster') || emoji.includes('booster')) return '/badges/booster_1m.png';

  // 5. Discord'a gelecekte eklenebilecek yeni resmi rozetler için doğrudan resmi CDN hash desteği
  if (badge.iconHash && /^[a-z0-9_]+$/i.test(badge.iconHash)) {
    return `https://cdn.discordapp.com/badge-icons/${badge.iconHash}.png`;
  }

  // Son çare yedek rozet görseli (Yıldız yerine resmi Discord rozeti)
  return '/badges/quest.png';
}

const MONO_STAR_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

function saveDcConfig() {
  localStorage.setItem('earlyhost_dc_cfg', JSON.stringify({
    token: document.getElementById('dcTokenInput').value.trim(),
    webhook: document.getElementById('dcWebhookInput').value.trim(),
    autoWebhook: document.getElementById('dcAutoWebhookChk').checked
  }));
}

function loadDcConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('earlyhost_dc_cfg') || '{}');
    if (c.token) document.getElementById('dcTokenInput').value = c.token;
    if (c.webhook) document.getElementById('dcWebhookInput').value = c.webhook;
    if (c.autoWebhook) document.getElementById('dcAutoWebhookChk').checked = true;
  } catch (_) {}
}

function selectDcBadge(el) {
  activeDcBadge = el.getAttribute('data-badge') || 'all';
  document.querySelectorAll('#dcBadgeChips .chip').forEach((c) => c.classList.toggle('active', c === el));
  document.getElementById('dcStatFilter').textContent = el.textContent.trim();
}

async function fetchUserGuilds() {
  const token = document.getElementById('dcTokenInput').value.trim();
  const btn = document.getElementById('loadGuildsBtn');
  btn.disabled = true;
  btn.textContent = 'Bağlanıyor...';

  try {
    const res = await fetch('/api/discord/guilds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!data.ok) {
      showToast('❌ ' + data.error);
      return;
    }

    const connEl = document.getElementById('dcConnectedUser');
    connEl.textContent = `● @${data.account.username} (${data.guilds.length} sunucu)`;
    connEl.classList.remove('hidden');
    const sel = document.getElementById('dcGuildSelect');
    sel.classList.remove('hidden');
    const optsHtml = `<option value="">Sunucu Seç (${data.guilds.length})...</option>` +
      data.guilds.map((g) => `<option value="${esc(g.id)}">${esc(g.name)} (${g.memberCount || '?'})</option>`).join('');
    sel.innerHTML = optsHtml;

    const rbxSel = document.getElementById('rbxDcGuildSelect');
    if (rbxSel) {
      rbxSel.classList.remove('hidden');
      rbxSel.innerHTML = optsHtml;
    }
    const rbxConn = document.getElementById('rbxDcConnectedUser');
    if (rbxConn) {
      rbxConn.textContent = `● @${data.account.username} (${data.guilds.length} sunucu)`;
      rbxConn.classList.remove('hidden');
    }
    syncDiscordInputsToRoblox();

    showToast(`✅ @${data.account.username} hesabındaki ${data.guilds.length} sunucu yüklendi!`);
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Sunucularımı Çek`;
  }
}

function onSelectDiscordGuild() {
  const val = document.getElementById('dcGuildSelect').value;
  if (val) document.getElementById('dcGuildIdInput').value = val;
}

async function startDiscordScan() {
  const token = document.getElementById('dcTokenInput').value.trim();
  const guildId = document.getElementById('dcGuildIdInput').value.trim();
  const webhookUrl = document.getElementById('dcWebhookInput').value.trim();
  const autoWebhook = document.getElementById('dcAutoWebhookChk').checked;

  if (!guildId) {
    showToast('⚠️ Lütfen taranacak Discord Sunucu ID girin veya listeden seçin.');
    return;
  }

  const scanBtn = document.getElementById('dcScanBtn');
  const progBox = document.getElementById('dcProgressBox');
  const progMsg = document.getElementById('dcProgressMsg');
  const progPct = document.getElementById('dcProgressPct');
  const progFill = document.getElementById('dcProgressFill');

  scanBtn.disabled = true;
  scanBtn.innerHTML = `<span class="spin"></span> TARANIYOR...`;
  progBox.classList.remove('hidden');
  progFill.style.width = '5%';
  progPct.textContent = '5%';
  progMsg.textContent = 'Tarama oturumu başlatılıyor...';

  const resetDcBtn = () => {
    scanBtn.disabled = false;
    scanBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> SUNUCUYU TARA`;
  };

  try {
    const startRes = await fetch('/api/discord/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        guildId,
        filterBadge: activeDcBadge,
        webhookUrl,
        autoWebhook
      })
    });
    const startData = await startRes.json();
    if (!startData.ok) {
      showToast('❌ ' + startData.error);
      resetDcBtn();
      progBox.classList.add('hidden');
      return;
    }

    const sess = localStorage.getItem('earlyhost_session_token') || '';
    const ev = new EventSource(`/api/discord/stream?jobId=${encodeURIComponent(startData.jobId)}&session=${encodeURIComponent(sess)}`);

    ev.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.status === 'running') {
          progFill.style.width = `${msg.progress || 10}%`;
          progPct.textContent = `${msg.progress || 10}%`;
          progMsg.textContent = msg.message || 'Taranıyor...';
        } else if (msg.status === 'done') {
          ev.close();
          progFill.style.width = '100%';
          progPct.textContent = '100%';
          progMsg.textContent = '✓ Tarama tamamlandı';
          lastDcScanResult = msg.result;
          renderDiscordResults(msg.result);
          resetDcBtn();
          if (msg.result?.webhookSent) {
            showToast('Sonuçlar Discord Webhook adresine de gönderildi!');
          } else {
            showToast(`${msg.result?.foundCount || 0} nadir hesap bulundu!`);
          }
        } else if (msg.status === 'error') {
          ev.close();
          progMsg.textContent = '✗ Hata: ' + msg.error;
          showToast('Hata: ' + msg.error);
          resetDcBtn();
        }
      } catch (_) {}
    };

    ev.onerror = () => {
      ev.close();
      resetDcBtn();
    };
  } catch (err) {
    showToast('Hata: ' + err.message);
    resetDcBtn();
  }
}

function renderDiscordResults(res) {
  const area = document.getElementById('dcResultsArea');
  if (!res) return;

  document.getElementById('dcStatGuild').textContent = res.guildName || '-';
  document.getElementById('dcStatScanned').textContent = (res.totalScanned || 0).toLocaleString('tr-TR');
  document.getElementById('dcStatFound').textContent = (res.foundCount || 0).toLocaleString('tr-TR');

  const users = res.users || [];
  if (!users.length) {
    area.innerHTML = `<div class="pro-empty-state"><h5>Sonuç Bulunamadı</h5><p><b>${esc(res.guildName)}</b> sunucusunda taranan ${res.totalScanned} üye arasında bu rozet filtresine uyan hesap bulunamadı.</p></div>`;
    return;
  }

  area.innerHTML = `<div class="results-grid">${users.map((u, idx) => {
    const badgesHtml = (u.badges || []).map((b) => {
      const icon = resolveBadgeIcon(b);
      return `<span class="b-pill">${icon ? `<img src="${icon}" alt=""/>` : MONO_STAR_SVG} ${esc(b.name)}</span>`;
    }).join('');

    const shortTag = u.username && u.username.length <= 3
      ? `<span class="tr-badge">${u.username.length} HARF</span>`
      : '';

    const delayMs = Math.min(idx * 28, 360);

    return `
      <div class="res-card" style="animation-delay:${delayMs}ms">
        <span class="res-rank">#${String(idx + 1).padStart(2, '0')}</span>
        <div class="res-head">
          <img class="res-avatar" src="${esc(u.avatarUrl)}" alt="" loading="lazy" />
          <div class="res-user">
            <div class="res-uname-row">
              <span class="res-uname">@${esc(u.username)}</span>
              ${shortTag}
              <button class="mini-btn" onclick="copyText('${esc(u.username)}')">Kopyala</button>
            </div>
            <div class="res-sub">
              <span>${esc(u.displayName)}</span> • <span>${esc(u.id)}</span>
            </div>
          </div>
        </div>

        <div class="badge-pills">${badgesHtml}</div>

        <div class="res-foot">
          <a class="foot-btn" href="${esc(u.profileUrl)}" target="_blank" rel="noopener">
            Profili Aç
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </a>
          <button class="foot-btn" onclick="copyText('${esc(u.id)}')">ID Kopyala</button>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

async function sendLastDcScanToWebhook() {
  if (!lastDcScanResult) return showToast('Önce bir sunucu taraması yapın.');
  const webhookUrl = document.getElementById('dcWebhookInput').value.trim();
  if (!webhookUrl) return showToast('Lütfen Webhook URL girin.');

  try {
    showToast('Webhook gönderiliyor...');
    const res = await fetch('/api/discord/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, scanResult: lastDcScanResult })
    });
    const d = await res.json();
    if (d.ok) showToast('✅ Rapor başarıyla Discord Webhook\'a gönderildi!');
    else showToast('❌ ' + d.error);
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

function copyDiscordResults() {
  if (!lastDcScanResult || !lastDcScanResult.users?.length) {
    return showToast('Kopyalanacak sonuç yok.');
  }
  const text = lastDcScanResult.users.map((u, i) => {
    const b = (u.badges || []).map((x) => x.name).join(', ');
    return `${i + 1}. @${u.username} (${u.id}) — [${b}]`;
  }).join('\n');
  navigator.clipboard.writeText(text);
  showToast(`✅ ${lastDcScanResult.users.length} hesap panoya kopyalandı!`);
}

// ----------------------- 7. ENGINE 02: ROBLOX & DISCORD LINKED SCANNER -----------------------
const rbxStore = new Map();
const rbxActivePills = new Set(['any']);
const rbxSentWebhooks = new Set();

function openRbxSubTab(sub) {
  ['guild', 'manual', 'scan', 'settings'].forEach((s) => {
    document.getElementById('rbxSub-' + s)?.classList.toggle('hidden', s !== sub);
  });
  document.querySelectorAll('#panelRoblox .pro-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-rsub') === sub);
  });
}

function syncDiscordInputsToRoblox() {
  const dcTok = document.getElementById('dcTokenInput')?.value.trim() || '';
  const rbxTok = document.getElementById('rbxDcTokenInput');
  if (rbxTok && !rbxTok.value.trim() && dcTok) {
    rbxTok.value = dcTok;
  }

  const dcGuild = document.getElementById('dcGuildIdInput')?.value.trim() || '';
  const rbxGuild = document.getElementById('rbxDcGuildIdInput');
  if (rbxGuild && !rbxGuild.value.trim() && dcGuild) {
    rbxGuild.value = dcGuild;
  }

  const dcWh = document.getElementById('dcWebhookInput')?.value.trim() || '';
  const rbxWh = document.getElementById('rbxWebhookInput');
  if (rbxWh && !rbxWh.value.trim() && dcWh) {
    rbxWh.value = dcWh;
  }
}

function syncRbxDcToken() {
  const rbxTok = document.getElementById('rbxDcTokenInput')?.value.trim() || '';
  const dcTokEl = document.getElementById('dcTokenInput');
  if (dcTokEl && rbxTok) {
    dcTokEl.value = rbxTok;
    saveDcConfig();
  }
}

async function fetchRbxUserGuilds() {
  const token = (document.getElementById('rbxDcTokenInput')?.value || document.getElementById('dcTokenInput')?.value || '').trim();
  const btn = document.getElementById('rbxLoadGuildsBtn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Bağlanıyor...';

  try {
    const res = await fetch('/api/discord/guilds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!data.ok) {
      showToast('Hata: ' + data.error);
      return;
    }

    const labelText = `● @${data.account.username} (${data.guilds.length} sunucu)`;
    const optsHtml = `<option value="">Sunucu Seç (${data.guilds.length})...</option>` +
      data.guilds.map((g) => `<option value="${esc(g.id)}">${esc(g.name)} (${g.memberCount || '?'})</option>`).join('');

    const rbxConn = document.getElementById('rbxDcConnectedUser');
    if (rbxConn) {
      rbxConn.textContent = labelText;
      rbxConn.classList.remove('hidden');
    }
    const rbxSel = document.getElementById('rbxDcGuildSelect');
    if (rbxSel) {
      rbxSel.classList.remove('hidden');
      rbxSel.innerHTML = optsHtml;
    }

    const dcConn = document.getElementById('dcConnectedUser');
    if (dcConn) {
      dcConn.textContent = labelText;
      dcConn.classList.remove('hidden');
    }
    const dcSel = document.getElementById('dcGuildSelect');
    if (dcSel) {
      dcSel.classList.remove('hidden');
      dcSel.innerHTML = optsHtml;
    }

    showToast(`@${data.account.username} hesabındaki ${data.guilds.length} sunucu yüklendi!`);
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Sunucularımı Çek`;
  }
}

function onSelectRbxDiscordGuild() {
  const val = document.getElementById('rbxDcGuildSelect')?.value || '';
  if (val) {
    document.getElementById('rbxDcGuildIdInput').value = val;
    const dcInput = document.getElementById('dcGuildIdInput');
    if (dcInput && !dcInput.value.trim()) dcInput.value = val;
  }
}

function getRbxDiscordCfg() {
  return {
    guildId: document.getElementById('rbxCfgGuildId')?.value.trim() || document.getElementById('rbxDcGuildIdInput')?.value.trim() || '',
    bloxlinkKey: document.getElementById('rbxCfgBloxlink')?.value.trim() || '',
    roverKey: document.getElementById('rbxCfgRover')?.value.trim() || '',
    discordBotToken: document.getElementById('rbxCfgBotToken')?.value.trim() || ''
  };
}

function saveRbxCfg() {
  localStorage.setItem('earlyhost_rbx_cfg', JSON.stringify({
    ...getRbxDiscordCfg(),
    webhook: document.getElementById('rbxWebhookInput')?.value.trim() || '',
    autoWebhook: Boolean(document.getElementById('rbxAutoWebhook')?.checked)
  }));
}

function loadRbxCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('earlyhost_rbx_cfg') || '{}');
    if (document.getElementById('rbxCfgGuildId')) document.getElementById('rbxCfgGuildId').value = c.guildId || '';
    if (document.getElementById('rbxCfgBloxlink')) document.getElementById('rbxCfgBloxlink').value = c.bloxlinkKey || '';
    if (document.getElementById('rbxCfgRover')) document.getElementById('rbxCfgRover').value = c.roverKey || '';
    if (document.getElementById('rbxCfgBotToken')) document.getElementById('rbxCfgBotToken').value = c.discordBotToken || '';
    if (document.getElementById('rbxWebhookInput')) document.getElementById('rbxWebhookInput').value = c.webhook || '';
    if (document.getElementById('rbxAutoWebhook')) document.getElementById('rbxAutoWebhook').checked = Boolean(c.autoWebhook);
  } catch (_) {}
}

async function initRobloxScanner() {
  loadRbxCfg();
  syncDiscordInputsToRoblox();
  try {
    const res = await fetch('/api/roblox/presets');
    const data = await res.json();
    if (data.games && document.getElementById('rbxPresetSelect')) {
      document.getElementById('rbxPresetSelect').innerHTML = data.games
        .map((g) => `<option value="${g.id}">${esc(g.name)}</option>`)
        .join('');
    }
  } catch (_) {}
}

async function onRbxPresetChange() {
  const pid = document.getElementById('rbxPresetSelect')?.value;
  if (!pid) return;
  document.getElementById('rbxPlaceId').value = pid;
  try {
    const res = await fetch(`/api/roblox/game-info?placeId=${pid}`);
    const d = await res.json();
    if (d.ok) {
      document.getElementById('rbxStatGame').textContent = d.game.name;
      document.getElementById('rbxStatPlaying').textContent = (d.game.playing || 0).toLocaleString('tr-TR');
      document.getElementById('rbxStatPlayingWrap')?.classList.remove('hidden');
    }
  } catch (_) {}
}

function toggleRbxPill(el) {
  const f = el.getAttribute('data-rf');
  if (f === 'any') {
    rbxActivePills.clear();
    rbxActivePills.add('any');
  } else {
    rbxActivePills.delete('any');
    if (rbxActivePills.has(f)) rbxActivePills.delete(f);
    else rbxActivePills.add(f);
    if (rbxActivePills.size === 0) rbxActivePills.add('any');
    const minInp = document.getElementById('rbxMinValue');
    if (rbxActivePills.has('sshf_stitch') && minInp && parseInt(minInp.value, 10) > 4000) {
      minInp.value = 4000;
    }
  }
  document.querySelectorAll('#rbxPills .chip').forEach((c) => {
    c.classList.toggle('active', rbxActivePills.has(c.getAttribute('data-rf')));
  });
  renderRbxResults();
}

async function runRbxGuildScan() {
  const token = (document.getElementById('rbxDcTokenInput')?.value || document.getElementById('dcTokenInput')?.value || '').trim();
  const guildId = (document.getElementById('rbxDcGuildIdInput')?.value || '').trim();
  const scanLimit = parseInt(document.getElementById('rbxGuildScanLimit')?.value || '300', 10);
  const minValue = parseInt(document.getElementById('rbxGuildMinVal')?.value || '0', 10);
  const includeNicknames = Boolean(document.getElementById('rbxIncludeNickChk')?.checked);
  const webhookUrl = (document.getElementById('rbxWebhookInput')?.value || document.getElementById('dcWebhookInput')?.value || '').trim();
  const autoWebhook = Boolean(document.getElementById('rbxAutoWebhook')?.checked);

  if (!guildId) {
    showToast('Lütfen taranacak Discord Sunucu ID girin veya sunucu listesinden seçin.');
    return;
  }

  const scanBtn = document.getElementById('rbxGuildScanBtn');
  const progBox = document.getElementById('rbxGuildProgressBox');
  const progMsg = document.getElementById('rbxGuildProgressMsg');
  const progPct = document.getElementById('rbxGuildProgressPct');
  const progFill = document.getElementById('rbxGuildProgressFill');

  scanBtn.disabled = true;
  scanBtn.innerHTML = `<span class="spin"></span> SUNUCU TARANIYOR...`;
  progBox.classList.remove('hidden');
  progFill.style.width = '5%';
  progPct.textContent = '5%';
  progMsg.textContent = 'Discord sunucusuna bağlanılıyor...';

  const resetBtn = () => {
    scanBtn.disabled = false;
    scanBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> SUNUCUDAKİ ROBLOX HESAPLARINI TARA`;
  };

  try {
    const startRes = await fetch('/api/roblox/guild-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        guildId,
        scanLimit,
        minValue,
        includeNicknames,
        webhookUrl,
        autoWebhook
      })
    });
    const startData = await startRes.json();
    if (!startData.ok) {
      showToast('Hata: ' + startData.error);
      resetBtn();
      progBox.classList.add('hidden');
      return;
    }

    const sess = localStorage.getItem('earlyhost_session_token') || '';
    const ev = new EventSource(`/api/discord/stream?jobId=${encodeURIComponent(startData.jobId)}&session=${encodeURIComponent(sess)}`);

    ev.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.status === 'running') {
          const pct = Math.max(4, Math.min(99, Number(msg.progress || 10)));
          progFill.style.width = `${pct}%`;
          progPct.textContent = `${pct}%`;
          progMsg.textContent = msg.message || 'Taranıyor...';
        } else if (msg.status === 'done') {
          ev.close();
          progFill.style.width = '100%';
          progPct.textContent = '100%';
          progMsg.textContent = 'Tarama tamamlandı';

          const resObj = msg.result || {};
          rbxStore.clear();
          for (const acc of (resObj.accounts || [])) {
            const key = `${acc.userId}_${acc.discordId || ''}`;
            rbxStore.set(key, { ...acc, _storeKey: key });
          }

          document.getElementById('rbxStatGame').textContent = resObj.guildName || 'Discord Sunucusu';
          document.getElementById('rbxStatPlayingWrap')?.classList.add('hidden');
          document.getElementById('rbxStatScanned').textContent = (resObj.scannedMembers || 0).toLocaleString('tr-TR');

          renderRbxResults();
          resetBtn();
          showToast(`${resObj.guildName || 'Sunucu'}: ${(resObj.accounts || []).length} bağlı Roblox hesabı bulundu!`);
        } else if (msg.status === 'error') {
          ev.close();
          progMsg.textContent = 'Hata: ' + (msg.error || 'Tarama durduruldu');
          showToast('Hata: ' + (msg.error || 'Tarama başarısız'));
          resetBtn();
        }
      } catch (_) {}
    };

    ev.onerror = () => {
      ev.close();
      resetBtn();
    };
  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message);
    resetBtn();
  }
}

async function runRbxScan() {
  const btn = document.getElementById('rbxScanBtn');
  const moreBtn = document.getElementById('rbxMoreBtn');
  btn.disabled = true;
  moreBtn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> TARANIYOR...`;

  try {
    const placeId = parseInt(document.getElementById('rbxPlaceId').value || '12699642568', 10);
    const regionMode = document.getElementById('rbxRegion').value;
    const minValue = parseInt(document.getElementById('rbxMinValue').value || '0', 10);
    const onlyOnline = document.getElementById('rbxOnlyOnline').checked;
    const onlyWithDiscord = document.getElementById('rbxOnlyDiscord').checked;
    const targetFilters = Array.from(rbxActivePills);
    const customKeyword = document.getElementById('rbxCustomKeyword').value.trim();

    const res = await fetch('/api/roblox/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId,
        regionMode,
        minValue,
        onlyOnline,
        onlyWithDiscord,
        targetFilters,
        customKeyword,
        discordConfig: getRbxDiscordCfg()
      })
    });

    const data = await res.json();
    if (!data.ok) {
      showToast('Hata: ' + data.error);
      return;
    }

    document.getElementById('rbxStatGame').textContent = data.game.name;
    document.getElementById('rbxStatPlaying').textContent = (data.game.playing || 0).toLocaleString('tr-TR');
    document.getElementById('rbxStatPlayingWrap')?.classList.remove('hidden');
    const prev = parseInt(document.getElementById('rbxStatScanned').textContent.replace(/\D/g, '') || '0', 10);
    document.getElementById('rbxStatScanned').textContent = (prev + (data.scannedCount || 0)).toLocaleString('tr-TR');

    const autoHook = document.getElementById('rbxAutoWebhook').checked;
    const hookUrl = document.getElementById('rbxWebhookInput').value.trim();

    for (const acc of (data.matched || [])) {
      const key = `${acc.userId}_${acc.discordId || ''}`;
      rbxStore.set(key, { ...acc, _storeKey: key });
      if (autoHook && hookUrl && !rbxSentWebhooks.has(key)) {
        rbxSentWebhooks.add(key);
        fetch('/api/roblox/send-webhook-clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: hookUrl, account: acc })
        }).catch(() => {});
      }
    }

    renderRbxResults();
    showToast(`${(data.matched || []).length} Roblox hesabı listeye eklendi!`);
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message);
  } finally {
    btn.disabled = false;
    moreBtn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> OYUN TARAMASINI BAŞLAT`;
  }
}

async function runRbxManual() {
  const usernames = document.getElementById('rbxManualInput').value.trim();
  if (!usernames) return showToast('Lütfen en az bir Roblox kullanıcı adı veya ID girin.');
  const btn = document.getElementById('rbxManualBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> SORGULANIYOR...`;

  try {
    const res = await fetch('/api/roblox/lookup-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames })
    });
    const d = await res.json();
    if (d.ok) {
      for (const a of (d.matched || [])) {
        const key = `${a.userId}_${a.discordId || ''}`;
        rbxStore.set(key, { ...a, _storeKey: key });
      }
      document.getElementById('rbxStatGame').textContent = 'Manuel Sorgu';
      document.getElementById('rbxStatPlayingWrap')?.classList.add('hidden');
      const prev = parseInt(document.getElementById('rbxStatScanned').textContent.replace(/\D/g, '') || '0', 10);
      document.getElementById('rbxStatScanned').textContent = (prev + (d.scannedCount || 0)).toLocaleString('tr-TR');
      renderRbxResults();
      showToast(`${(d.matched || []).length} Roblox hesabı sorgulandı!`);
    } else {
      showToast('Hata: ' + d.error);
    }
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> HESAPLARI SORGULA`;
  }
}

async function testRbxDiscordApis() {
  const box = document.getElementById('rbxApiTestBox');
  box.classList.remove('hidden');
  box.textContent = 'API anahtarları kontrol ediliyor...';
  try {
    const res = await fetch('/api/roblox/test-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordConfig: getRbxDiscordCfg() })
    });
    const d = await res.json();
    if (d.ok) {
      box.innerHTML = (d.messages || []).map((m) => `<div style="margin-bottom:4px;">${esc(m)}</div>`).join('');
    } else {
      box.textContent = 'Hata: ' + d.error;
    }
  } catch (e) {
    box.textContent = 'Bağlantı hatası: ' + e.message;
  }
}

async function testRbxWebhook() {
  const webhookUrl = document.getElementById('rbxWebhookInput').value.trim();
  if (!webhookUrl) return showToast('Önce Webhook URL girin.');
  try {
    const res = await fetch('/api/roblox/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl })
    });
    const d = await res.json();
    if (d.ok) showToast('Test mesajı Discord kanalına gönderildi!');
    else showToast('Hata: ' + d.error);
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function sendRbxAccountWebhook(storeKey) {
  const webhookUrl = (document.getElementById('rbxWebhookInput')?.value || document.getElementById('dcWebhookInput')?.value || '').trim();
  if (!webhookUrl) {
    openRbxSubTab('settings');
    return showToast('Önce Webhook URL girin.');
  }
  const account = rbxStore.get(storeKey);
  if (!account) return;
  try {
    const res = await fetch('/api/roblox/send-webhook-clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, account })
    });
    const d = await res.json();
    if (d.ok) showToast('Hesap bilgisi Discord kanalına gönderildi!');
    else showToast('Hata: ' + d.error);
  } catch (_) {
    showToast('Gönderilemedi.');
  }
}

function getFilteredRbxList() {
  const onlyDc = Boolean(document.getElementById('rbxOnlyDiscord')?.checked);
  const onlyTr = Boolean(document.getElementById('rbxOnlyTr')?.checked);
  const onlyOn = Boolean(document.getElementById('rbxOnlyOnline')?.checked);
  const filters = Array.from(rbxActivePills).filter((x) => x !== 'any');

  return Array.from(rbxStore.values()).filter((a) => {
    if (onlyTr && !a.isTurkish) return false;
    if (onlyDc && !(a.discordId || a.discordUsername || a.discordInvite)) return false;
    if (onlyOn && a.presenceType === 0) return false;
    if (filters.length > 0) {
      const b = (a.matchedBadges || []).join(' ').toLowerCase();
      const ok = filters.some((f) => {
        if (f === 'korblox') return b.includes('korblox');
        if (f === 'headless') return b.includes('headless');
        if (f === 'valkyrie') return b.includes('valkyrie');
        if (f === 'dominus') return b.includes('dominus');
        if (f === 'sshf_stitch') return b.includes('sshf') || b.includes('stitch');
        if (f === 'limiteds') return b.includes('limited') || (a.topItems || []).some((i) => String(i.category || '').includes('Limited'));
        return true;
      });
      if (!ok) return false;
    }
    return true;
  }).sort((a, b) => {
    const adc = Boolean(a.discordId || a.discordUsername);
    const bdc = Boolean(b.discordId || b.discordUsername);
    if (adc !== bdc) return adc ? -1 : 1;
    if ((b.totalValue || 0) !== (a.totalValue || 0)) return (b.totalValue || 0) - (a.totalValue || 0);
    return (b.verifiedLink ? 1 : 0) - (a.verifiedLink ? 1 : 0);
  });
}

function renderRbxResults() {
  const area = document.getElementById('rbxResultsArea');
  const list = getFilteredRbxList();
  const allArr = Array.from(rbxStore.values());

  document.getElementById('rbxStatFound').textContent = list.length.toLocaleString('tr-TR');
  if (document.getElementById('rbxStatTr')) {
    document.getElementById('rbxStatTr').textContent = allArr.filter((x) => x.isTurkish).length.toLocaleString('tr-TR');
  }
  document.getElementById('rbxStatDc').textContent = allArr.filter((x) => x.discordId || x.discordUsername || x.discordInvite).length.toLocaleString('tr-TR');

  if (!list.length) {
    area.innerHTML = `<div class="pro-empty-state"><h5>Henüz Eşleşen Hesap Yok</h5><p>Bu filtrede sonuç bulunamadı. <b>Discord Sunucusundan Roblox Tespiti</b> sekmesinden bir sunucu taratabilir veya <b>Roblox İsim / ID Sorgula</b> sekmesinden hesap sorgulayabilirsiniz.</p></div>`;
    return;
  }

  area.innerHTML = `<div class="results-grid">${list.map((a, idx) => {
    const live = a.presenceType === 1 || a.presenceType === 2 || a.presenceType === 3;
    const badges = (a.matchedBadges || []).map((b) => `<span class="b-pill">${esc(b)}</span>`).join('');
    const hasDc = Boolean(a.discordId || a.discordUsername || a.discordInvite);
    const storeKey = a._storeKey || `${a.userId}_${a.discordId || ''}`;
    const dcProfileLink = a.discordProfileUrl || (a.discordId ? `https://discord.com/users/${a.discordId}` : '');

    const dcHtml = hasDc ? `
      <div class="dc-linked-card">
        <div class="dc-linked-top">
          <span class="dc-linked-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>
            BAĞLI DISCORD HESABI
          </span>
          <span class="dc-source-pill">${esc(a.linkSource || a.source || 'Doğrulanmış')}</span>
        </div>

        <div class="dc-linked-body">
          ${a.discordAvatarUrl ? `<img class="dc-linked-avatar" src="${esc(a.discordAvatarUrl)}" alt="" loading="lazy" />` : ''}
          <div class="dc-linked-meta">
            ${a.discordUsername ? `
              <div class="dc-linked-uname-row">
                <strong class="dc-linked-uname">@${esc(a.discordUsername)}</strong>
                <button type="button" class="mini-btn" onclick="copyText('${esc(a.discordUsername)}')">Kopyala</button>
              </div>
            ` : ''}
            ${a.discordId ? `
              <div class="dc-linked-id-row">
                <span>ID: ${esc(a.discordId)}</span>
                <button type="button" class="mini-btn" onclick="copyText('${esc(a.discordId)}')">ID</button>
              </div>
            ` : ''}
            ${a.discordInvite ? `
              <div class="dc-linked-id-row">
                <span>Davet: ${esc(a.discordInvite)}</span>
                <button type="button" class="mini-btn" onclick="copyText('https://${esc(a.discordInvite)}')">Link</button>
              </div>
            ` : ''}
          </div>
          ${dcProfileLink ? `<a class="mini-btn dc-open-btn" href="${esc(dcProfileLink)}" target="_blank" rel="noopener">Discord ↗</a>` : ''}
        </div>
      </div>
    ` : '';

    const itemsHtml = (a.topItems || []).slice(0, 4).map((it) => `
      <div class="item-line">
        <span>${esc(it.name)}</span>
        <span>${Number(it.value || 0).toLocaleString('tr-TR')} R$</span>
      </div>
    `).join('');

    const joinBtn = (a.joinPlaceId && a.joinGameId)
      ? `<a class="foot-btn join" href="roblox://experiences/start?placeId=${a.joinPlaceId}&gameInstanceId=${a.joinGameId}">Katıl</a>`
      : '';

    const valLabel = Number(a.totalValue || 0) > 0
      ? `${Number(a.totalValue || 0).toLocaleString('tr-TR')} R$`
      : (a.inventoryPrivate ? 'Envanter Gizli / 0 R$' : '0 R$');

    return `
      <div class="res-card">
        <span class="res-rank">#${String(idx + 1).padStart(2, '0')}</span>
        <div class="res-head">
          <img class="res-avatar" src="${esc(a.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${a.userId || 1}&width=150&height=150&format=png`)}" alt="" loading="lazy" />
          <div class="res-user">
            <div class="res-uname-row">
              <span class="res-uname">@${esc(a.username)}</span>
              ${a.isTurkish ? `<span class="tr-badge">TR</span>` : ''}
              <button type="button" class="mini-btn" onclick="copyText('${esc(a.username)}')">Kopyala</button>
            </div>
            <div class="res-sub">
              <span class="live-dot ${live ? 'on' : ''}"></span>
              <span>Roblox ID: ${esc(a.userId)} • ${esc(a.statusLabel || 'Çevrimdışı')}</span>
            </div>
          </div>
        </div>

        ${dcHtml}

        <div class="robux-banner">
          <span class="robux-val">${esc(valLabel)}</span>
          <div class="badge-pills">${badges}</div>
        </div>

        ${itemsHtml ? `<div class="items-mini">${itemsHtml}</div>` : ''}

        <div class="res-foot">
          ${joinBtn}
          <a class="foot-btn" href="${esc(a.profileUrl || `https://www.roblox.com/users/${a.userId}/profile`)}" target="_blank" rel="noopener">Roblox ↗</a>
          <a class="foot-btn" href="${esc(a.rolimonsUrl || `https://www.rolimons.com/player/${a.userId}`)}" target="_blank" rel="noopener">Rolimon's</a>
          <button type="button" class="foot-btn" onclick="sendRbxAccountWebhook('${esc(storeKey)}')">Webhook</button>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function clearRbx() {
  rbxStore.clear();
  document.getElementById('rbxStatScanned').textContent = '0';
  document.getElementById('rbxGuildProgressBox')?.classList.add('hidden');
  renderRbxResults();
}

function copyAllRbx() {
  const list = getFilteredRbxList();
  if (!list.length) return showToast('Liste boş.');
  const txt = list.map((a) => {
    const dc = (a.discordUsername || a.discordId) ? ` ↔ Discord: @${a.discordUsername || '-'} (${a.discordId || '-'})` : '';
    return `Roblox: @${a.username} (${a.userId}) — ${Number(a.totalValue || 0).toLocaleString('tr-TR')} R$${dc}`;
  }).join('\n');
  navigator.clipboard.writeText(txt);
  showToast(`${list.length} eşleşen hesap panoya kopyalandı!`);
}

// ----------------------- 8. VENCORD USERPLUGINS MARKETPLACE -----------------------
const VC_PLUGIN_ICONS = {
  'vacx-fakeyt': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="3"/></svg>`,
  'vacx-yayin': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>`,
  'selfBadges': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  'copyProfile': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>`
};

let vcModalFilesCache = [];

async function loadVencordPlugins() {
  const grid = document.getElementById('vencordPluginsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/vencord/plugins');
    const data = await res.json();
    if (!data.ok || !data.plugins) return;

    grid.innerHTML = data.plugins.map((p) => {
      const iconSvg = VC_PLUGIN_ICONS[p.id] || VC_PLUGIN_ICONS['selfBadges'];
      const featuresHtml = (p.features || []).map((f) => `<li>${esc(f)}</li>`).join('');
      const filesHtml = (p.fileNames || []).slice(0, 5).map((fn) => `<span class="vc-file-chip">${esc(fn)}</span>`).join('');

      return `
        <div class="vc-card spotlight-card">
          <div class="vc-card-head">
            <div class="vc-icon-wrap">
              <div class="vc-icon-box">${iconSvg}</div>
              <div class="vc-title-group">
                <h3>${esc(p.title)}</h3>
                <span class="vc-folder-tag">src/userplugins/${esc(p.folderName)} • ${p.sizeKb} KB</span>
              </div>
            </div>

            <div class="vc-meta-badges">
              <span class="vc-pill">${esc(p.category)}</span>
              <span class="vc-pill">${esc(p.version)}</span>
              <span class="vc-pill" title="İndirilme Sayısı">↓ ${p.downloads || 0}</span>
            </div>
          </div>

          <p class="vc-summary">${esc(p.summary)}</p>

          <ul class="vc-feature-list">
            ${featuresHtml}
          </ul>

          <div class="vc-files-strip">
            <span>Paket İçeriği:</span>
            ${filesHtml}
            <span class="vc-file-chip">+ Kurulum_Baslat.bat</span>
          </div>

          <div class="vc-card-actions">
            <a href="${withSessionQuery(`/api/vencord/download?id=${encodeURIComponent(p.id)}`)}" data-base-href="/api/vencord/download?id=${encodeURIComponent(p.id)}" class="vc-dl-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Hazır Kurulum İndir (.ZIP)
            </a>
            <button type="button" class="vc-sec-btn" onclick="openVcSourceModal('${esc(p.id)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Kodları İncele
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Vencord plugins load error:', e);
  }
}

async function openVcSourceModal(pluginId) {
  const modal = document.getElementById('vcCodeModal');
  const titleEl = document.getElementById('vcModalTitle');
  const subEl = document.getElementById('vcModalSub');
  const tabsEl = document.getElementById('vcModalFileTabs');
  const codeEl = document.getElementById('vcModalCodeContent');
  const dlBtn = document.getElementById('vcModalDownloadBtn');

  modal.classList.remove('hidden');
  titleEl.textContent = 'Yükleniyor...';
  codeEl.textContent = 'Dosyalar okunuyor...';
  tabsEl.innerHTML = '';
  dlBtn.href = withSessionQuery(`/api/vencord/download?id=${encodeURIComponent(pluginId)}`);

  try {
    const res = await fetch(`/api/vencord/source?id=${encodeURIComponent(pluginId)}`);
    const d = await res.json();
    if (!d.ok) {
      codeEl.textContent = 'Hata: ' + d.error;
      return;
    }

    vcModalFilesCache = d.files || [];
    titleEl.textContent = d.plugin.title;
    subEl.textContent = `Vencord/src/userplugins/${d.plugin.folderName} (${vcModalFilesCache.length} dosya)`;

    tabsEl.innerHTML = vcModalFilesCache.map((f, idx) => `
      <button type="button" class="mini-btn" style="padding:5px 11px; ${idx === 0 ? 'background:#fff;color:#000;' : ''}" onclick="selectVcModalFile(${idx}, this)">
        ${esc(f.name)}
      </button>
    `).join('');

    if (vcModalFilesCache.length > 0) {
      codeEl.textContent = vcModalFilesCache[0].content;
    }
  } catch (e) {
    codeEl.textContent = 'Bağlantı hatası: ' + e.message;
  }
}

function selectVcModalFile(index, btn) {
  const f = vcModalFilesCache[index];
  if (!f) return;
  document.getElementById('vcModalCodeContent').textContent = f.content;
  document.querySelectorAll('#vcModalFileTabs button').forEach((b) => {
    b.style.background = '';
    b.style.color = '';
  });
  btn.style.background = '#ffffff';
  btn.style.color = '#000000';
}

function closeVcModal() {
  document.getElementById('vcCodeModal').classList.add('hidden');
}

function copyOnlineThemeLink() {
  const link = `${window.location.origin}/api/vencord/theme?raw=1`;
  navigator.clipboard.writeText(link);
  showToast('Online Theme linki kopyalandı! Vencord -> Themes -> Online Themes kutusuna yapıştırın.');
}

// ----------------------- 8B. ENGINE 03: OSINT, USERNAME SNIPER & WEBHOOK COMMANDER -----------------------
let lastSniperAvailable = [];

function openOsintSubTab(sub) {
  ['lookup', 'sniper', 'webhook', 'tokencheck', 'vanity', 'assets'].forEach((s) => {
    document.getElementById('osintSub-' + s)?.classList.toggle('hidden', s !== sub);
  });
  document.querySelectorAll('#panelOsint .pro-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-osub') === sub);
  });
}

async function runOsintLookup() {
  const query = document.getElementById('osintQueryInput').value.trim();
  if (!query) return showToast('Lütfen bir Discord Kullanıcı ID veya Davet Linki girin.');

  const btn = document.getElementById('osintLookupBtn');
  const area = document.getElementById('osintResultArea');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ANALİZ EDİLİYOR...`;

  try {
    const res = await fetch('/api/tools/osint-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const d = await res.json();
    if (!d.ok) {
      showToast('Hata: ' + d.error);
      area.innerHTML = `<div class="pro-empty-state"><h5>Sistem Uyarısı</h5><p>${esc(d.error)}</p></div>`;
      return;
    }

    if (d.kind === 'user') {
      const u = d.user;
      const createdDate = u.createdAt
        ? new Date(u.createdAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
        : 'Bilinmiyor';
      const ageDays = u.createdAt ? Math.floor((Date.now() - u.createdAt) / 86400000) : 0;

      const badgesHtml = (u.badges || []).length
        ? u.badges.map((b) => {
            const icon = resolveBadgeIcon(b);
            return `<span class="b-pill">${icon ? `<img src="${icon}" alt=""/>` : MONO_STAR_SVG} ${esc(b.name)}</span>`;
          }).join('')
        : `<span class="vc-file-chip">Açık Bayrak Rozeti Yok</span>`;

      const bannerStyle = u.bannerUrl
        ? `background-image:url('${esc(u.bannerUrl)}');`
        : (u.accentHex ? `background:linear-gradient(135deg, ${esc(u.accentHex)} 0%, #050505 100%);` : '');

      area.innerHTML = `
        <div class="osint-dossier">
          <div class="osint-banner" style="${bannerStyle}"></div>
          <div class="osint-body">
            <div class="osint-head-row">
              <div style="display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap;">
                <img class="osint-avatar" src="${esc(u.avatarUrl)}" alt="" />
                <div style="padding-bottom:4px;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <h3 style="font-family:var(--font-display); font-size:22px;">@${esc(u.username)}</h3>
                    ${u.bot ? `<span class="tr-badge">BOT</span>` : ''}
                    <button class="mini-btn" onclick="copyText('${esc(u.id)}')">ID Kopyala</button>
                  </div>
                  <span style="font-size:13px; color:#a1a1aa;">Görünen Ad: <b>${esc(u.globalName || '-')}</b></span>
                </div>
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a href="${esc(u.avatarUrl)}" target="_blank" rel="noopener" class="tool-btn">HD Avatarı Aç</a>
                ${u.bannerUrl ? `<a href="${esc(u.bannerUrl)}" target="_blank" rel="noopener" class="tool-btn">HD Banner Aç</a>` : ''}
                <a href="https://discord.com/users/${esc(u.id)}" target="_blank" rel="noopener" class="tool-btn run">Profili Aç ↗</a>
              </div>
            </div>

            <div class="badge-pills" style="margin-bottom:14px;">${badgesHtml}</div>

            <div class="osint-meta-grid">
              <div class="osint-meta-box">
                <span>KULLANICI ID (SNOWFLAKE)</span>
                <strong>${esc(u.id)}</strong>
              </div>
              <div class="osint-meta-box">
                <span>HESAP AÇILIŞ TARİHİ</span>
                <strong>${esc(createdDate)}</strong>
              </div>
              <div class="osint-meta-box">
                <span>HESAP YAŞI</span>
                <strong>${ageDays.toLocaleString('tr-TR')} Gün</strong>
              </div>
              <div class="osint-meta-box">
                <span>TEMA VURGU RENGİ</span>
                <strong>${esc(u.accentHex || 'Varsayılan (#000000)')}</strong>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (d.kind === 'invite') {
      const inv = d.invite;
      const createdDate = inv.createdAt
        ? new Date(inv.createdAt).toLocaleDateString('tr-TR', { dateStyle: 'long' })
        : 'Bilinmiyor';
      const bannerStyle = inv.bannerUrl ? `background-image:url('${esc(inv.bannerUrl)}');` : '';
      const feats = (inv.features || []).slice(0, 10).map((f) => `<span class="vc-file-chip">${esc(f)}</span>`).join('');

      area.innerHTML = `
        <div class="osint-dossier">
          <div class="osint-banner" style="${bannerStyle}"></div>
          <div class="osint-body">
            <div class="osint-head-row">
              <div style="display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap;">
                <img class="osint-avatar" src="${esc(inv.iconUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="" />
                <div style="padding-bottom:4px;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <h3 style="font-family:var(--font-display); font-size:22px;">${esc(inv.guildName)}</h3>
                    <button class="mini-btn" onclick="copyText('${esc(inv.guildId)}')">Sunucu ID Kopyala</button>
                  </div>
                  <span style="font-size:13px; color:#a1a1aa;">${esc(inv.description || 'Sunucu açıklaması yok')}</span>
                </div>
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="tool-btn" onclick="launchScraperWithGuild('${esc(inv.guildId)}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Bu Sunucuyu Rozet Tarayıcıya Aktar</button>
                <a href="https://discord.gg/${esc(inv.code)}" target="_blank" rel="noopener" class="tool-btn run">Sunucuya Katıl ↗</a>
              </div>
            </div>

            <div class="osint-meta-grid">
              <div class="osint-meta-box">
                <span>SUNUCU ID</span>
                <strong>${esc(inv.guildId)}</strong>
              </div>
              <div class="osint-meta-box">
                <span>TOPLAM / AKTİF ÜYE</span>
                <strong>${(inv.memberCount || 0).toLocaleString('tr-TR')} / ${(inv.onlineCount || 0).toLocaleString('tr-TR')} Aktif</strong>
              </div>
              <div class="osint-meta-box">
                <span>BOOST SAYISI</span>
                <strong>${inv.boostCount} Takviye</strong>
              </div>
              <div class="osint-meta-box">
                <span>KURULUŞ TARİHİ</span>
                <strong>${esc(createdDate)}</strong>
              </div>
            </div>

            ${feats ? `<div class="vc-files-strip" style="margin-top:14px;"><span>Özellikler:</span>${feats}</div>` : ''}
          </div>
        </div>
      `;
    }
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'HEDEFİ ANALİZ ET →';
  }
}

function launchScraperWithGuild(guildId) {
  document.getElementById('dcGuildIdInput').value = guildId;
  switchWorkspace('discord');
  showToast(`Sunucu ID (${guildId}) Discord Rozet Tarayıcıya aktarıldı!`);
}

let activeSniperMode = '3c';

function selectSniperMode(el) {
  activeSniperMode = el.getAttribute('data-smode') || '3c';
  document.querySelectorAll('#sniperModeChips .chip').forEach((c) => {
    c.classList.toggle('active', c === el);
  });
}

function animateCyberDecode(el, targetWord, delayMs = 0) {
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_#✦';
  const finalStr = '@' + targetWord;
  el.textContent = '@' + Array.from({ length: targetWord.length }, () => glyphs[Math.floor(Math.random() * glyphs.length)]).join('');

  setTimeout(() => {
    let step = 0;
    const maxSteps = 12;
    const timer = setInterval(() => {
      step++;
      const locked = Math.floor((step / maxSteps) * targetWord.length);
      let out = '@';
      for (let i = 0; i < targetWord.length; i++) {
        if (i < locked) out += targetWord[i];
        else out += glyphs[Math.floor(Math.random() * glyphs.length)].toLowerCase();
      }
      el.textContent = out;
      if (step >= maxSteps) {
        clearInterval(timer);
        el.textContent = finalStr;
      }
    }, 34);
  }, delayMs);
}

async function runUsernameSniper() {
  const platform = document.getElementById('sniperPlatform')?.value || 'auto';
  const onlyAvailable = document.getElementById('sniperOnlyAvailChk') ? document.getElementById('sniperOnlyAvailChk').checked : true;
  const customRaw = document.getElementById('sniperCustomList').value.trim();
  const usernames = customRaw
    ? customRaw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
    : [];

  const btn = document.getElementById('sniperRunBtn');
  const area = document.getElementById('sniperResultArea');
  const statPill = document.getElementById('sniperScanStatPill');

  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> RADAR TARANIYOR...`;

  // Live Radar Scanning Matrix Animation while API hunts unused names
  area.innerHTML = `
    <div class="sniper-radar-stage">
      <div class="sniper-radar-beam"></div>
      <div class="sniper-radar-circle">
        <div class="sniper-radar-sweep"></div>
      </div>
      <div class="sniper-radar-code" id="sniperLiveTicker">@${activeSniperMode.toUpperCase()}...</div>
      <p>Dolu isimler eleniyor · Sadece <b>KULLANILMAYAN (${activeSniperMode.toUpperCase()})</b> kombinasyonlar yakalanıyor...</p>
    </div>
  `;

  const tickerEl = document.getElementById('sniperLiveTicker');
  const tickerChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const tickLen = parseInt(activeSniperMode[0], 10) || 4;
  const tickerTimer = setInterval(() => {
    if (!tickerEl) return;
    let fake = '@';
    for (let i = 0; i < tickLen; i++) fake += tickerChars[Math.floor(Math.random() * tickerChars.length)];
    tickerEl.textContent = fake;
  }, 55);

  try {
    const res = await fetch('/api/tools/username-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: activeSniperMode,
        platform,
        onlyAvailable,
        usernames,
        count: 12
      })
    });
    const d = await res.json();
    clearInterval(tickerTimer);

    if (!d.ok) {
      showToast('Hata: ' + d.error);
      area.innerHTML = `<div class="pro-empty-state"><h5>Sistem Uyarısı</h5><p>${esc(d.error)}</p></div>`;
      return;
    }

    const list = d.results || [];
    lastSniperAvailable = list.filter((x) => x.available).map((x) => x.username);

    if (statPill) {
      statPill.textContent = `● ${d.scannedTotal || list.length} Tarandı → ${d.availableCount ?? lastSniperAvailable.length} Boşta Yakalandı`;
      statPill.classList.remove('hidden');
    }

    if (!list.length) {
      area.innerHTML = `
        <div class="pro-empty-state">
          <h5>Bu Turda Boş İsim Çıkmadı (${d.scannedTotal || 0} Kombinasyon Denendi)</h5>
          <p>Seçtiğiniz kalıp çok nadir olduğu için taranan adayların tamamı dolu çıktı. Tekrar <b>BOŞTA İSİMLERİ AVLA</b> butonuna basarak yeni bir kombinasyon dalgası taratabilirsiniz.</p>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="sniper-vault-header">
        <span>✦ YAKALANAN KULLANILMAYAN NADİR İSİMLER (${list.length})</span>
        <small>TARANAN HAVUZ: ${d.scannedTotal || list.length} ADAY</small>
      </div>
      <div class="sniper-showcase-grid">
        ${list.map((item, idx) => `
          <div class="sniper-drop-card ${item.available ? 'unused' : 'taken'}" style="animation-delay:${idx * 65}ms" onclick="copyText('${esc(item.username)}')">
            <div class="sniper-drop-glow"></div>
            <div class="sniper-drop-top">
              <span class="sniper-tier-badge">${esc(item.tag || activeSniperMode.toUpperCase())}</span>
              <span class="sniper-plat-tag">${esc(item.platform || 'MULTI')}</span>
            </div>

            <div class="sniper-drop-word" data-target-word="${esc(item.username)}">@${esc(item.username)}</div>

            <div class="sniper-drop-foot">
              <span class="sniper-avail-pill">
                <i class="sniper-avail-dot"></i>
                ${item.available ? 'KULLANILMIYOR' : esc(item.status)}
              </span>
              <button type="button" class="mini-btn" onclick="event.stopPropagation(); copyText('${esc(item.username)}')">Kopyala</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Trigger staggered cyber slot-machine decode animation on every dropped card!
    area.querySelectorAll('.sniper-drop-word').forEach((wordEl, idx) => {
      const target = wordEl.getAttribute('data-target-word') || '';
      if (target) animateCyberDecode(wordEl, target, idx * 65);
    });

    showToast(`🎯 ${lastSniperAvailable.length} adet kullanılmayan (${activeSniperMode.toUpperCase()}) isim yakalandı!`);
  } catch (e) {
    clearInterval(tickerTimer);
    showToast('Bağlantı hatası: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> BOŞTA İSİMLERİ AVLA`;
  }
}

function copyAvailableSniperNames() {
  if (!lastSniperAvailable.length) return showToast('Henüz müsait isim bulunamadı.');
  navigator.clipboard.writeText(lastSniperAvailable.join('\n'));
  showToast(`${lastSniperAvailable.length} müsait isim kopyalandı!`);
}

async function inspectTargetWebhook() {
  const webhookUrl = document.getElementById('whCmdUrl').value.trim();
  if (!webhookUrl) return showToast('Önce Webhook URL yapıştırın.');
  const box = document.getElementById('whInspectOutput');
  box.classList.remove('hidden');
  box.textContent = 'Webhook inceleniyor...';

  try {
    const res = await fetch('/api/tools/webhook-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, action: 'inspect' })
    });
    const d = await res.json();
    if (!d.ok) {
      box.textContent = '[HATA] ' + d.error;
      return;
    }
    const w = d.webhook;
    box.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${esc(w.avatarUrl)}" style="width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);" alt="" />
          <div>
            <strong style="font-size:14.5px; color:#fff;">✓ Aktif Webhook: ${esc(w.name)}</strong>
            <div style="font-family:var(--font-mono); font-size:11.5px; color:#a1a1aa;">Sunucu ID: ${esc(w.guildId)} • Kanal ID: ${esc(w.channelId)}</div>
          </div>
        </div>
        <button class="mini-btn" onclick="copyText('${esc(w.guildId)}')">Sunucu ID Kopyala</button>
      </div>
    `;
  } catch (e) {
    box.textContent = 'Hata: ' + e.message;
  }
}

async function sendCustomWebhookMsg() {
  const webhookUrl = document.getElementById('whCmdUrl').value.trim();
  if (!webhookUrl) return showToast('Önce Webhook URL girin.');
  const username = document.getElementById('whBotName').value.trim();
  const embedTitle = document.getElementById('whEmbedTitle').value.trim();
  const embedImage = document.getElementById('whEmbedImg').value.trim();
  const embedDescription = document.getElementById('whEmbedDesc').value.trim();

  const btn = document.getElementById('whSendCustomBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/tools/webhook-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        action: 'send',
        username,
        embedTitle,
        embedDescription,
        embedImage,
        embedColor: '#050505'
      })
    });
    const d = await res.json();
    if (d.ok) showToast('✅ ' + d.message);
    else showToast('❌ ' + d.error);
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function deleteTargetWebhook() {
  const webhookUrl = document.getElementById('whCmdUrl').value.trim();
  if (!webhookUrl) return showToast('Önce silinecek Webhook URL girin.');
  if (!confirm('Bu Discord Webhook\'u kalıcı olarak silmek (imha etmek) istediğinize emin misiniz?')) return;

  try {
    const res = await fetch('/api/tools/webhook-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, action: 'delete' })
    });
    const d = await res.json();
    if (d.ok) {
      showToast('💥 ' + d.message);
      document.getElementById('whInspectOutput').classList.add('hidden');
    } else {
      showToast('❌ ' + d.error);
    }
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

// ----------------------- 8C. MULTI-TOKEN CHECKER, VANITY SNIPER, CSV EXPORT & CTRL+K PALETTE -----------------------
let lastValidTokensCache = [];

async function runMultiTokenCheck() {
  const raw = document.getElementById('tokenCheckInput').value.trim();
  if (!raw) return showToast('Lütfen kontrol edilecek en az bir Discord Token girin.');

  const btn = document.getElementById('tokenCheckBtn');
  const area = document.getElementById('tokenCheckResultArea');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> KONTROL EDİLİYOR...`;

  try {
    const res = await fetch('/api/tools/token-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: raw })
    });
    const d = await res.json();
    if (!d.ok) {
      showToast('Hata: ' + d.error);
      area.innerHTML = `<div class="pro-empty-state"><h5>Sistem Uyarısı</h5><p>${esc(d.error)}</p></div>`;
      return;
    }

    lastValidTokensCache = (d.results || []).filter((x) => x.valid).map((x) => x.token);

    area.innerHTML = `
      <div class="kpi-grid kpi-4" style="margin-bottom:14px;">
        <div class="kpi-card"><span class="kpi-label">TOPLAM TOKEN</span><strong class="kpi-value">${d.total}</strong></div>
        <div class="kpi-card highlight"><span class="kpi-label">AKTİF / ÇALIŞAN</span><strong class="kpi-value" style="color:var(--green);">${d.validCount}</strong></div>
        <div class="kpi-card"><span class="kpi-label">NİTRO HESAP</span><strong class="kpi-value">${d.nitroCount}</strong></div>
        <div class="kpi-card"><span class="kpi-label">GEÇERSİZ / KİLİTLİ</span><strong class="kpi-value">${d.total - d.validCount}</strong></div>
      </div>
      <div class="results-grid">
        ${(d.results || []).map((item, idx) => {
          if (!item.valid) {
            return `
              <div class="res-card" style="opacity:0.65; animation-delay:${idx * 25}ms">
                <div class="res-head">
                  <div class="vc-icon-box" style="width:42px;height:42px;">✕</div>
                  <div class="res-user">
                    <span class="res-uname" style="font-family:var(--font-mono); font-size:13px;">${esc(item.masked)}</span>
                    <div class="res-sub" style="color:#ef4444;">${esc(item.reason)}</div>
                  </div>
                </div>
              </div>
            `;
          }

          const badgesHtml = (item.badges || []).map((b) => {
            const icon = resolveBadgeIcon(b);
            return `<span class="b-pill">${icon ? `<img src="${icon}" alt=""/>` : MONO_STAR_SVG} ${esc(b.name)}</span>`;
          }).join('');

          return `
            <div class="res-card" style="animation-delay:${idx * 25}ms">
              <span class="res-rank">${esc(item.accountType)}</span>
              <div class="res-head">
                <img class="res-avatar" src="${esc(item.avatarUrl)}" alt="" />
                <div class="res-user">
                  <div class="res-uname-row">
                    <span class="res-uname">@${esc(item.username)}</span>
                    ${item.hasNitro ? `<span class="tr-badge">${esc(item.nitro)}</span>` : ''}
                  </div>
                  <div class="res-sub">${esc(item.id)} • ${item.guildCount != null ? item.guildCount + ' Sunucu' : 'Bot'}</div>
                </div>
              </div>

              <div class="badge-pills">
                <span class="vc-file-chip">Mail: ${item.email ? '✓ Onaylı' : 'Yok'}</span>
                <span class="vc-file-chip">Tel: ${item.phone ? '✓ Var' : 'Yok'}</span>
                <span class="vc-file-chip">2FA: ${item.mfaEnabled ? 'Açık' : 'Kapalı'}</span>
              </div>

              ${badgesHtml ? `<div class="badge-pills">${badgesHtml}</div>` : ''}

              <div class="res-foot">
                <button class="foot-btn" onclick="copyText('${esc(item.token)}')">Tokeni Kopyala</button>
                <button class="foot-btn" onclick="useTokenInScraper('${esc(item.token)}')">Tarayıcıda Kullan →</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    showToast(`✅ ${d.validCount}/${d.total} aktif token doğrulandı!`);
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> TOKENLERİ DOĞRULA & ANALİZ ET`;
  }
}

function copyValidTokensOnly() {
  if (!lastValidTokensCache.length) return showToast('Henüz doğrulanmış çalışan token yok.');
  navigator.clipboard.writeText(lastValidTokensCache.join('\n'));
  showToast(`${lastValidTokensCache.length} çalışan token panoya kopyalandı!`);
}

function useTokenInScraper(tok) {
  document.getElementById('dcTokenInput').value = tok;
  saveDcConfig();
  switchWorkspace('discord');
  showToast('Token Discord Rozet Tarayıcıya aktarıldı! Şimdi "Sunucularımı Çek" diyebilirsiniz.');
}

let activeVanityMode = '2c';
let lastAvailableVanityCache = [];

function selectVanityMode(el) {
  activeVanityMode = el.getAttribute('data-vmode') || '2c';
  document.querySelectorAll('#vanityModeChips .chip').forEach((c) => {
    c.classList.toggle('active', c === el);
  });
}

function animateVanityDecode(el, targetCode, delayMs = 0) {
  const glyphs = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const finalStr = '.gg/' + targetCode;
  el.textContent = '.gg/' + Array.from({ length: targetCode.length }, () => glyphs[Math.floor(Math.random() * glyphs.length)]).join('');

  setTimeout(() => {
    let step = 0;
    const maxSteps = 12;
    const timer = setInterval(() => {
      step++;
      const locked = Math.floor((step / maxSteps) * targetCode.length);
      let out = '.gg/';
      for (let i = 0; i < targetCode.length; i++) {
        if (i < locked) out += targetCode[i];
        else out += glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      el.textContent = out;
      if (step >= maxSteps) {
        clearInterval(timer);
        el.textContent = finalStr;
      }
    }, 34);
  }, delayMs);
}

function copyAvailableVanityCodes() {
  if (!lastAvailableVanityCache.length) return showToast('Henüz alınabilir temiz URL bulunmadı.');
  navigator.clipboard.writeText(lastAvailableVanityCache.join('\n'));
  showToast(`${lastAvailableVanityCache.length} adet alınabilir URL kodu kopyalandı!`);
}

async function runVanityCheck() {
  const raw = document.getElementById('vanityCodesInput').value.trim();
  const filterMode = document.getElementById('vanityFilterSelect')?.value || 'claimable';
  const statPill = document.getElementById('vanityScanStatPill');

  const btn = document.getElementById('vanityCheckBtn');
  const area = document.getElementById('vanityResultArea');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> URL & BAN RADARI TARANIYOR...`;

  area.innerHTML = `
    <div class="sniper-radar-stage">
      <div class="sniper-radar-beam"></div>
      <div class="sniper-radar-circle">
        <div class="sniper-radar-sweep"></div>
      </div>
      <div class="sniper-radar-code" id="vanityLiveTicker">.gg/...</div>
      <p>Sunucu durumu ve Discord URL ban/kilit kuralları denetleniyor (${raw ? 'ÖZEL LİSTE' : activeVanityMode.toUpperCase()})...</p>
    </div>
  `;

  const tickerEl = document.getElementById('vanityLiveTicker');
  const tickerPool = activeVanityMode === 'years' ? '0123456789' : 'abcdefghijklmnopqrstuvwxyz0123456789';
  const tickLen = activeVanityMode === 'years' || activeVanityMode.startsWith('4') ? 4 : (activeVanityMode.startsWith('2') ? 2 : 3);
  const tickerTimer = setInterval(() => {
    if (!tickerEl) return;
    let fake = activeVanityMode === 'years' ? '.gg/19' : '.gg/';
    const rem = activeVanityMode === 'years' ? 2 : tickLen;
    for (let i = 0; i < rem; i++) fake += tickerPool[Math.floor(Math.random() * tickerPool.length)];
    tickerEl.textContent = fake;
  }, 58);

  try {
    const res = await fetch('/api/tools/vanity-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: activeVanityMode,
        codes: raw,
        filterMode,
        count: 8
      })
    });
    const d = await res.json();
    clearInterval(tickerTimer);

    if (!d.ok) {
      showToast('Hata: ' + d.error);
      area.innerHTML = `<div class="pro-empty-state"><h5>Sistem Uyarısı</h5><p>${esc(d.error)}</p></div>`;
      return;
    }

    const list = d.results || [];
    lastAvailableVanityCache = list.filter((x) => x.available && !x.banned).map((x) => x.code);

    if (statPill) {
      statPill.textContent = `● ${d.availableCount || 0} Alınabilir · ${d.bannedCount || 0} Boşta/Banlı · ${d.takenCount || 0} Dolu`;
      statPill.classList.remove('hidden');
    }

    if (!list.length) {
      area.innerHTML = `
        <div class="pro-empty-state">
          <h5>Bu Dalgada Alınabilir Temiz URL Çıkmadı (${d.scannedTotal || 0} Denendi)</h5>
          <p>Denenen kombinasyonların ${d.takenCount || 0} tanesi dolu, ${d.bannedCount || 0} tanesi ise boşta ama Discord tarafından banlı/kilitli çıktı. Tekrar <b>GERÇEK ALINABİLİR URL AVLA</b> butonuna basarak yeni kombinasyonlar avlayabilirsiniz.</p>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="kpi-grid kpi-4" style="margin-bottom:14px;">
        <div class="kpi-card"><span class="kpi-label">TARANAN URL</span><strong class="kpi-value">${d.scannedTotal || list.length}</strong></div>
        <div class="kpi-card highlight"><span class="kpi-label">%100 ALINABİLİR</span><strong class="kpi-value" style="color:var(--green);">${d.availableCount || 0}</strong></div>
        <div class="kpi-card"><span class="kpi-label">BOŞTA AMA BANLI / KİLİTLİ</span><strong class="kpi-value" style="color:#f59e0b;">${d.bannedCount || 0}</strong></div>
        <div class="kpi-card"><span class="kpi-label">DOLU (SUNUCUDA)</span><strong class="kpi-value">${d.takenCount || 0}</strong></div>
      </div>

      <div class="sniper-showcase-grid">
        ${list.map((item, idx) => {
          const isClaimable = item.available && !item.banned;
          const isBannedEmpty = Boolean(item.banned);

          let pillColor = '#ef4444';
          let topRightLabel = 'KULLANIMDA';
          let borderInline = 'opacity:0.75;';

          if (isClaimable) {
            pillColor = '#86efac';
            topRightLabel = 'ALINABİLİR ✓';
            borderInline = 'border-color:rgba(34,197,94,0.45);';
          } else if (isBannedEmpty) {
            pillColor = '#fbbf24';
            topRightLabel = 'BANLI / KİLİTLİ';
            borderInline = 'border-color:rgba(245,158,11,0.45);';
          }

          return `
            <div class="sniper-drop-card ${isClaimable ? 'unused' : ''}" style="animation-delay:${idx * 60}ms; ${borderInline}" onclick="copyText('${esc(item.code)}')">
              <div class="sniper-drop-glow"></div>
              <div class="sniper-drop-top">
                <span class="sniper-tier-badge">${esc(item.tag || (item.code.length + 'H'))}</span>
                <span class="sniper-plat-tag">${topRightLabel}</span>
              </div>

              <div class="sniper-drop-word vanity-decode-word" data-target-code="${esc(item.code)}">.gg/${esc(item.code)}</div>

              <div style="font-size:11.5px; color:#a1a1aa; min-height:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(item.reason || '')}">
                ${esc(item.reason || '')}
              </div>

              <div class="sniper-drop-foot">
                <span class="sniper-avail-pill" style="color:${pillColor};">
                  <i class="sniper-avail-dot" style="background:${pillColor}; box-shadow:0 0 8px ${pillColor};"></i>
                  ${esc(item.status)}
                </span>
                ${isClaimable ? `<button type="button" class="mini-btn" onclick="event.stopPropagation(); copyText('${esc(item.code)}')">Kopyala</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    area.querySelectorAll('.vanity-decode-word').forEach((wordEl, idx) => {
      const code = wordEl.getAttribute('data-target-code') || '';
      if (code) animateVanityDecode(wordEl, code, idx * 60);
    });

    showToast(`🎯 ${d.availableCount || 0} Alınabilir • ${d.bannedCount || 0} Boşta Ama Banlı URL tespit edildi!`);
  } catch (e) {
    clearInterval(tickerTimer);
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> GERÇEK ALINABİLİR URL AVLA`;
  }
}

// CSV Exports for Discord & Roblox Scanners
function downloadBlobFile(filename, content, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportDiscordResults() {
  if (!lastDcScanResult || !lastDcScanResult.users?.length) {
    return showToast('Dışa aktarılacak Discord tarama sonucu yok.');
  }
  const rows = [['Sira', 'KullaniciAdi', 'GorunenAd', 'DiscordID', 'Rozetler', 'ProfilURL']];
  lastDcScanResult.users.forEach((u, i) => {
    const badges = (u.badges || []).map((b) => b.name).join(' | ');
    rows.push([i + 1, `@${u.username}`, u.displayName || '', u.id, badges, u.profileUrl]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlobFile(`EarlyHost_Discord_Rapor_${Date.now()}.csv`, csv);
  showToast('📊 CSV raporu indirildi!');
}

function exportRobloxResults() {
  const list = getFilteredRbxList();
  if (!list.length) return showToast('Dışa aktarılacak Roblox sonucu yok.');
  const rows = [['RobloxKullanici', 'RobloxID', 'RobuxDegeri', 'DiscordKullanici', 'DiscordID', 'BaglantiKaynagi', 'OzelEsyalar', 'RobloxProfilURL', 'DiscordProfilURL']];
  list.forEach((a) => {
    rows.push([
      `@${a.username}`,
      a.userId || '',
      a.totalValue || 0,
      a.discordUsername ? `@${a.discordUsername}` : '',
      a.discordId || '',
      a.linkSource || a.source || '',
      (a.matchedBadges || []).join(' | '),
      a.profileUrl || `https://www.roblox.com/users/${a.userId}/profile`,
      a.discordProfileUrl || (a.discordId ? `https://discord.com/users/${a.discordId}` : '')
    ]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlobFile(`EarlyHost_Roblox_Discord_Rapor_${Date.now()}.csv`, csv);
  showToast('Roblox & Discord CSV raporu indirildi!');
}

// Ctrl + K Quick Command Palette
let lastGuildAssetsCache = null;

async function fetchGuildAssets() {
  const target = document.getElementById('assetTargetInput').value.trim();
  const token = document.getElementById('assetTokenInput').value.trim() || document.getElementById('dcTokenInput').value.trim();
  if (!target) return showToast('Lütfen bir Sunucu Davet Linki (discord.gg/...) veya Sunucu ID girin.');

  const btn = document.getElementById('assetFetchBtn');
  const zipBtn = document.getElementById('assetDownloadZipBtn');
  const area = document.getElementById('assetResultArea');

  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> VARLIKLAR ÇEKİLİYOR...`;
  zipBtn.classList.add('hidden');

  try {
    const res = await fetch('/api/tools/guild-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, token })
    });
    const d = await res.json();
    if (!d.ok) {
      showToast('Hata: ' + d.error);
      area.innerHTML = `<div class="pro-empty-state"><h5>Sistem Uyarısı</h5><p>${esc(d.error)}</p></div>`;
      return;
    }

    lastGuildAssetsCache = d;
    zipBtn.classList.remove('hidden');

    const g = d.guild;
    const emojis = d.emojis || [];
    const stickers = d.stickers || [];

    const bannerStyle = g.bannerUrl ? `background-image:url('${esc(g.bannerUrl)}');` : '';

    const emojiGridHtml = emojis.length
      ? `<div class="emoji-steal-grid">${emojis.map((e) => `
          <a href="${esc(e.url)}" target="_blank" rel="noopener" class="emoji-steal-item" title=":${esc(e.name)}: (${e.ext.toUpperCase()})">
            <img src="${esc(e.url)}" alt="${esc(e.name)}" loading="lazy" />
            <span>:${esc(e.name)}:</span>
          </a>
        `).join('')}</div>`
      : `<div style="padding:18px; border-radius:12px; background:#000000; border:1px dashed rgba(255,255,255,0.12); color:#71717a; font-size:12.5px; text-align:center;">
          ${g.hasFullAccess ? 'Bu sunucuda özel emoji bulunmuyor.' : 'Sunucu herkese açık keşifte değil. Tüm özel emojileri çekmek için o sunucuda bulunan bir hesap tokenini sağdaki kutuya girebilirsiniz.'}
        </div>`;

    const stickerGridHtml = stickers.length
      ? `<h5 style="font-family:var(--font-display); font-size:14px; margin:18px 0 10px; color:#e4e4e7;">Özel Stickerlar (${stickers.length})</h5>
         <div class="emoji-steal-grid">${stickers.map((s) => `
          <a href="${esc(s.url)}" target="_blank" rel="noopener" class="emoji-steal-item" title="${esc(s.name)}">
            <img src="${esc(s.url)}" alt="${esc(s.name)}" loading="lazy" style="width:52px;height:52px;" />
            <span>${esc(s.name)}</span>
          </a>
        `).join('')}</div>`
      : '';

    area.innerHTML = `
      <div class="osint-dossier">
        <div class="osint-banner" style="${bannerStyle}"></div>
        <div class="osint-body">
          <div class="osint-head-row">
            <div style="display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap;">
              <img class="osint-avatar" src="${esc(g.iconUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="" />
              <div style="padding-bottom:4px;">
                <h3 style="font-family:var(--font-display); font-size:21px;">${esc(g.name)}</h3>
                <span style="font-family:var(--font-mono); font-size:11.5px; color:#a1a1aa;">ID: ${esc(g.id)} • ${emojis.length} Emoji • ${stickers.length} Sticker</span>
              </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${g.iconUrl ? `<a href="${esc(g.iconUrl)}" target="_blank" rel="noopener" class="tool-btn">HD İkon</a>` : ''}
              ${g.bannerUrl ? `<a href="${esc(g.bannerUrl)}" target="_blank" rel="noopener" class="tool-btn">HD Banner</a>` : ''}
              ${g.splashUrl ? `<a href="${esc(g.splashUrl)}" target="_blank" rel="noopener" class="tool-btn">HD Splash</a>` : ''}
              <button type="button" class="tool-btn run" onclick="downloadGuildAssetsZip()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Tümünü .ZIP İndir</button>
            </div>
          </div>

          <h5 style="font-family:var(--font-display); font-size:14px; margin:8px 0 10px; color:#e4e4e7;">Sunucu Emojileri (${emojis.length})</h5>
          ${emojiGridHtml}
          ${stickerGridHtml}
        </div>
      </div>
    `;

    showToast(`${g.name} varlıkları yüklendi (${emojis.length} emoji)!`);
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> SUNUCU VARLIKLARINI ÇEK`;
  }
}

async function downloadGuildAssetsZip() {
  if (!lastGuildAssetsCache || !lastGuildAssetsCache.guild) return showToast('Önce sunucu varlıklarını çekin.');
  const zipBtn = document.getElementById('assetDownloadZipBtn');
  zipBtn.disabled = true;
  showToast('📦 Görseller ve emojiler ZIP arşivine paketleniyor...');

  try {
    const g = lastGuildAssetsCache.guild;
    const res = await fetch('/api/tools/guild-assets-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildName: g.name,
        iconUrl: g.iconUrl,
        bannerUrl: g.bannerUrl,
        splashUrl: g.splashUrl,
        emojis: lastGuildAssetsCache.emojis || [],
        stickers: lastGuildAssetsCache.stickers || []
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast('❌ ' + (err.error || 'ZIP oluşturulamadı.'));
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EarlyHost_${(g.name || 'Sunucu').replace(/[^a-zA-Z0-9_\-]/g, '_')}_Assets.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('✅ ZIP arşivi başarıyla indirildi!');
  } catch (e) {
    showToast('Hata: ' + e.message);
  } finally {
    zipBtn.disabled = false;
  }
}

const CMD_PALETTE_ITEMS = [
  { label: 'Siteye Girenler — Full Gelişmiş Ziyaretçi Logları (Owner)', tag: 'RADAR', run: () => openVisitorsRadarDirect() },
  { label: 'Lisans, HWID & Yönetim Panelini Aç (User / Admin / Owner)', tag: 'PANEL', run: () => openControlCenterModal() },
  { label: 'Discord Rozet & Username Tarayıcıyı Aç', tag: 'ARAÇ', run: () => launchTool('discord') },
  { label: 'Roblox Değerli Hesap Tarayıcıyı Aç', tag: 'ARAÇ', run: () => launchTool('roblox') },
  { label: 'Tokensiz Discord ID & Davet Analizi', tag: 'OSINT', run: () => { launchTool('osint'); openOsintSubTab('lookup'); } },
  { label: 'Nadir Kısa Username (2L/2C/3C/3L) Sniper', tag: 'SNIPER', run: () => { launchTool('osint'); openOsintSubTab('sniper'); } },
  { label: 'Toplu Discord Token Checker & Müfettiş', tag: 'CHECKER', run: () => { launchTool('osint'); openOsintSubTab('tokencheck'); } },
  { label: 'Özel Sunucu URL (Vanity .gg/ 2H/3H/Yıl) Checker', tag: 'SNIPER', run: () => { launchTool('osint'); openOsintSubTab('vanity'); } },
  { label: 'Sunucu Emoji, Sticker & HD Varlık İndirici (.ZIP)', tag: 'STEALER', run: () => { launchTool('osint'); openOsintSubTab('assets'); } },
  { label: 'Webhook Komuta & Zengin Embed Aracı', tag: 'WEBHOOK', run: () => { launchTool('osint'); openOsintSubTab('webhook'); } },
  { label: 'Vencord Eklenti Mağazasına Git (4 Plugin)', tag: 'VENCORD', run: () => { document.getElementById('vencord')?.scrollIntoView({ behavior: 'smooth' }); } },
  { label: 'Tüm Vencord Eklentilerini İndir (.ZIP)', tag: 'İNDİR', run: () => { window.location.href = withSessionQuery('/api/vencord/download?id=all'); } },
  { label: 'Early.Host Obsidian Vencord Temasını İndir', tag: 'TEMA', run: () => { window.location.href = withSessionQuery('/api/vencord/theme'); } },
  { label: 'Resmi Discord Sunucumuza Katıl (discord.gg/anonim)', tag: 'TOPLULUK', run: () => { window.open('https://discord.gg/anonim', '_blank'); } }
];

let cmdSelectedIdx = 0;

function openCmdPalette() {
  const modal = document.getElementById('cmdPaletteModal');
  const inp = document.getElementById('cmdSearchInput');
  modal.classList.remove('hidden');
  inp.value = '';
  cmdSelectedIdx = 0;
  renderCmdPaletteList();
  setTimeout(() => inp.focus(), 30);
}

function closeCmdPalette() {
  document.getElementById('cmdPaletteModal').classList.add('hidden');
}

function getFilteredCmdItems() {
  const q = (document.getElementById('cmdSearchInput')?.value || '').toLowerCase().trim();
  if (!q) return CMD_PALETTE_ITEMS;
  return CMD_PALETTE_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.tag.toLowerCase().includes(q));
}

function renderCmdPaletteList() {
  const listEl = document.getElementById('cmdPaletteList');
  const items = getFilteredCmdItems();
  if (cmdSelectedIdx >= items.length) cmdSelectedIdx = 0;

  if (!items.length) {
    listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#71717a; font-size:13px;">Eşleşen komut bulunamadı.</div>`;
    return;
  }

  listEl.innerHTML = items.map((it, idx) => `
    <button type="button" class="cmd-item ${idx === cmdSelectedIdx ? 'selected' : ''}" onclick="execCmdItem(${idx})">
      <span>${esc(it.label)}</span>
      <small>${esc(it.tag)}</small>
    </button>
  `).join('');
}

function execCmdItem(idx) {
  const items = getFilteredCmdItems();
  const chosen = items[idx];
  closeCmdPalette();
  if (chosen && chosen.run) chosen.run();
}

function onCmdPaletteKey(e) {
  const items = getFilteredCmdItems();
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdSelectedIdx = (cmdSelectedIdx + 1) % items.length;
    renderCmdPaletteList();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSelectedIdx = (cmdSelectedIdx - 1 + items.length) % items.length;
    renderCmdPaletteList();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    execCmdItem(cmdSelectedIdx);
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const modal = document.getElementById('cmdPaletteModal');
    if (modal.classList.contains('hidden')) openCmdPalette();
    else closeCmdPalette();
  } else if (e.key === 'Escape') {
    closeCmdPalette();
    closeVcModal();
    closeControlCenterModal();
  }
});

// ----------------------- 8D. 3D MULTI-ROLE CONTROL CENTER (USER / ADMIN / OWNER PANELS) -----------------------
function formatRemainingExpiry(expiresAt) {
  if (!expiresAt) return 'SINIRSIZ (LIFETIME)';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'SÜRESİ DOLDU';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days} Gün ${hours} Saat` : `${hours} Saat Kaldı`;
}

function openControlCenterModal() {
  if (!currentAuthProfile) {
    lockPortalGate();
    return;
  }
  const modal = document.getElementById('controlCenterModal');
  modal.classList.remove('hidden');

  const role = currentAuthProfile.role || 'USER';
  document.getElementById('ccRoleBadge').textContent = role;
  document.getElementById('ccHeaderTitle').textContent =
    role === 'OWNER' ? 'Kurucu (Owner) & Lisans Komuta Merkezi' :
    (role === 'ADMIN' ? 'Yönetici (Admin) & Lisans Paneli' : 'Kullanıcı & Cihaz (HWID) Paneli');
  document.getElementById('ccHeaderSub').textContent = `${currentAuthProfile.label} • ${currentDeviceHwid}`;

  const isStaff = role === 'ADMIN' || role === 'OWNER';
  const isOwner = role === 'OWNER';
  document.getElementById('ccTabBtnAdmin').classList.toggle('hidden', !isStaff);
  document.getElementById('ccTabBtnOwner').classList.toggle('hidden', !isOwner);
  document.getElementById('ccTabBtnVisitors')?.classList.toggle('hidden', !isOwner);

  // Role options restriction for ADMIN
  const optAdmin = document.getElementById('admRoleOptAdmin');
  const optOwner = document.getElementById('admRoleOptOwner');
  if (optAdmin) optAdmin.disabled = !isOwner;
  if (optOwner) optOwner.disabled = !isOwner;
  if (!isOwner) document.getElementById('admNewRole').value = 'USER';

  renderUserPanelView();
  if (isStaff) {
    fetchAdminKeysData();
    if (isOwner) fetchOwnerVisitors();
    switchCcTab('admin');
  } else {
    switchCcTab('user');
  }
}

function openVisitorsRadarDirect() {
  if (!currentAuthProfile || currentAuthProfile.role !== 'OWNER') return;
  openControlCenterModal();
  switchCcTab('visitors');
}

function closeControlCenterModal() {
  document.getElementById('controlCenterModal')?.classList.add('hidden');
}

function switchCcTab(tab) {
  ['user', 'admin', 'owner', 'visitors'].forEach((t) => {
    document.getElementById('ccView-' + t)?.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#ccTabsBar .cc-tab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-cctab') === tab);
  });
  if (tab === 'visitors' && currentAuthProfile?.role === 'OWNER') {
    fetchOwnerVisitors();
  }
}

function renderUserPanelView() {
  const p = currentAuthProfile;
  if (!p) return;

  const annBar = document.getElementById('ccAnnouncementBar');
  if (currentAnnouncement) {
    annBar.innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> <span>${esc(currentAnnouncement)}</span></span>`;
    annBar.classList.remove('hidden');
  } else {
    annBar.classList.add('hidden');
  }

  document.getElementById('ccUserRole').textContent = p.role;
  document.getElementById('ccUserExpiry').textContent = formatRemainingExpiry(p.expiresAt);
  document.getElementById('ccUserHwidState').textContent = 'DONANIMA MÜHÜRLÜ';
  document.getElementById('ccUserLogins').textContent = String(p.loginCount || 1);
  document.getElementById('ccUserLabel').textContent = p.label || 'Üye';
  document.getElementById('ccUserKeyMasked').textContent = p.key;
  document.getElementById('ccUserHwidCode').textContent = p.hwid || currentDeviceHwid;
  document.getElementById('ccUserResetQuota').textContent = p.hwidSpec || (currentHardwareTelemetry?.cpu || 'Doğrulanmış Donanım');
}

async function selfResetMyHwid() {
  try {
    const res = await fetch('/api/auth/self-reset-hwid', { method: 'POST' });
    const d = await res.json();
    if (!d.ok) return showToast('❌ ' + d.error);
    showToast('✅ ' + d.message);
    const meRes = await fetch('/api/auth/me');
    const me = await meRes.json();
    if (me.ok) {
      currentAuthProfile = me.profile;
      renderUserPanelView();
    }
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function fetchAdminKeysData() {
  try {
    const res = await fetch('/api/admin/keys');
    const d = await res.json();
    if (!d.ok) return;

    adminKeysCache = d.keys || [];
    document.getElementById('admTotalKeysCount').textContent = String(adminKeysCache.length);
    renderAdminKeysTable();

    if (d.actorRole === 'OWNER') {
      document.getElementById('ownActiveSessions').textContent = String(d.activeSessionsCount || 0);
      document.getElementById('ownTotalKeys').textContent = String(adminKeysCache.length);
      document.getElementById('ownBoundHwids').textContent = String(adminKeysCache.filter((k) => k.hwid).length);
      document.getElementById('ownBannedKeys').textContent = String(adminKeysCache.filter((k) => k.banned).length);
      if (document.getElementById('ownWafBlocked')) {
        document.getElementById('ownWafBlocked').textContent = String(d.wafBlockedCount || 0);
      }
      document.getElementById('ownAnnouncementInput').value = d.announcement || '';

      const logsEl = document.getElementById('ownLogsArea');
      logsEl.innerHTML = (d.logs || []).map((l) => {
        const dt = new Date(l.ts).toLocaleTimeString('tr-TR');
        return `<div class="cc-log-line"><span style="color:#71717a;">[${dt}]</span><b style="color:#fff;">${esc(l.type)}</b><span>${esc(l.msg)}</span></div>`;
      }).join('');
    }
  } catch (_) {}
}

function renderAdminKeysTable() {
  const wrap = document.getElementById('admKeysListArea');
  const q = (document.getElementById('admSearchKeyInput')?.value || '').toLowerCase().trim();
  const filtered = adminKeysCache.filter((k) => {
    if (!q) return true;
    return (k.key || '').toLowerCase().includes(q)
      || (k.label || '').toLowerCase().includes(q)
      || (k.hwid || '').toLowerCase().includes(q)
      || (k.role || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:18px; text-align:center; color:#71717a; font-size:12.5px;">Eşleşen anahtar bulunamadı.</div>`;
    return;
  }

  const myRole = currentAuthProfile?.role || 'USER';

  wrap.innerHTML = filtered.map((k) => {
    const canManage = myRole === 'OWNER' || (myRole === 'ADMIN' && k.role === 'USER');
    const expStr = formatRemainingExpiry(k.expiresAt);
    const hwidStr = k.hwid ? k.hwid : 'Henüz Cihaz Bağlanmadı (Boş)';

    return `
      <div class="cc-key-row ${k.banned ? 'banned' : ''}">
        <div style="min-width:240px; flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
            <span class="sniper-tier-badge">${esc(k.role)}</span>
            <strong style="font-size:14px; color:#fff;">${esc(k.label)}</strong>
            ${k.banned ? `<span class="vc-pill" style="border-color:#ef4444; color:#fca5a5;">BANLI</span>` : ''}
          </div>
          <div style="font-family:var(--font-mono); font-size:12px; color:#e4e4e7; margin-bottom:3px;">
            Key: <b>${esc(k.key)}</b>
            ${!k.isMasked ? `<button type="button" class="mini-btn" style="margin-left:6px;" onclick="copyText('${esc(k.key)}')">Kopyala</button>` : ''}
          </div>
          <div style="font-family:var(--font-mono); font-size:11px; color:#71717a;">
            HWID: <span style="color:${k.hwid ? '#86efac' : '#a1a1aa'};">${esc(hwidStr)}</span> • Süre: ${esc(expStr)} • Giriş: ${k.loginCount || 0}
          </div>
          ${k.hwidSpec ? `<div style="font-family:var(--font-mono); font-size:10.5px; color:#52525b; margin-top:2px;">Donanım: ${esc(k.hwidSpec)}</div>` : ''}
        </div>

        ${canManage ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="mini-btn" style="display:inline-flex; align-items:center; gap:5px;" onclick="adminKeyAction('reset-hwid', '${esc(k.key)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              HWID Sıfırla
            </button>
            <button type="button" class="mini-btn" onclick="adminKeyAction('add-days', '${esc(k.key)}', 30)">+30 Gün</button>
            <button type="button" class="mini-btn" onclick="adminKeyAction('add-days', '${esc(k.key)}', 0)">Sınırsız Yap</button>
            <button type="button" class="mini-btn" style="border-color:rgba(245,158,11,0.4); color:#fcd34d;" onclick="adminKeyAction('toggle-ban', '${esc(k.key)}')">${k.banned ? 'Yasağı Aç' : 'Banla'}</button>
            <button type="button" class="mini-btn" style="border-color:rgba(239,68,68,0.45); color:#fca5a5;" onclick="adminKeyAction('delete', '${esc(k.key)}')">Sil</button>
          </div>
        ` : `<span style="font-family:var(--font-mono); font-size:11px; color:#52525b;">KORUMALI YETKİ</span>`}
      </div>
    `;
  }).join('');
}

async function adminCreateKey() {
  const label = document.getElementById('admNewLabel').value.trim() || 'VIP Üye';
  const role = document.getElementById('admNewRole').value;
  const durationDays = Number(document.getElementById('admNewDays').value || 30);
  const customKey = document.getElementById('admNewCustomKey').value.trim();
  const targetHwid = document.getElementById('admPrebindHwid')?.value.trim() || '';
  const count = Number(document.getElementById('admNewCount').value || 1);

  try {
    const res = await fetch('/api/admin/keys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, role, durationDays, customKey, targetHwid, count })
    });
    const d = await res.json();
    if (!d.ok) return showToast('❌ ' + d.error);

    const createdStr = (d.created || []).map((x) => x.key).join('\n');
    navigator.clipboard.writeText(createdStr);
    document.getElementById('admNewCustomKey').value = '';
    if (document.getElementById('admPrebindHwid')) document.getElementById('admPrebindHwid').value = '';
    showToast(`✅ ${(d.created || []).length} adet tek-HWID mühürlü ${role} anahtarı üretildi ve kopyalandı!`);
    fetchAdminKeysData();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function adminKeyAction(action, targetKey, days = 30) {
  if (action === 'delete' && !confirm(`${targetKey} anahtarını kalıcı olarak silmek istiyor musunuz?`)) return;
  try {
    const res = await fetch('/api/admin/keys/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, targetKey, days })
    });
    const d = await res.json();
    if (!d.ok) return showToast('❌ ' + d.error);
    showToast('✅ ' + d.message);
    fetchAdminKeysData();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function ownerSaveAnnouncement() {
  const announcement = document.getElementById('ownAnnouncementInput').value.trim();
  try {
    const res = await fetch('/api/admin/keys/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-announcement', announcement })
    });
    const d = await res.json();
    if (!d.ok) return showToast('❌ ' + d.error);
    currentAnnouncement = announcement;
    renderUserPanelView();
    showToast('✅ ' + d.message);
    fetchAdminKeysData();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function ownerResetAllHwids() {
  if (!confirm('Sistemdeki TÜM anahtarların HWID cihaz kilitlerini sıfırlamak istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/admin/keys/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset-all-user-hwids' })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
    fetchAdminKeysData();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

// ----------------------- 8D. OWNER VISITOR RADAR — FULL GELİŞMİŞ LOG -----------------------
let ownerVisitorsCache = [];
let ownerBlockedHwidsCache = [];
let ownerBlockedIpsCache = [];
let activeVisitorFilter = 'ALL';

async function fetchOwnerVisitors() {
  if (currentAuthProfile?.role !== 'OWNER') return;
  try {
    const res = await fetch('/api/owner/visitors');
    const d = await res.json();
    if (!d.ok) return;

    ownerVisitorsCache = d.visitors || [];
    ownerBlockedHwidsCache = d.blockedHwids || [];
    ownerBlockedIpsCache = d.blockedIps || [];

    const st = d.stats || {};
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    setTxt('visTotalRecords', st.totalRecords ?? ownerVisitorsCache.length);
    setTxt('visUniqueHwids', st.uniqueHwids ?? 0);
    setTxt('visAuthCount', st.authCount ?? 0);
    setTxt('visRejectCount', (st.rejectCount ?? 0) + (st.blacklistedCount ?? 0));
    setTxt('ccVisitorsCountBadge', ownerVisitorsCache.length);

    const whInp = document.getElementById('visWebhookUrlInput');
    const whMode = document.getElementById('visWebhookModeSelect');
    if (whInp && document.activeElement !== whInp) whInp.value = d.webhookUrl || '';
    if (whMode && d.webhookMode) whMode.value = d.webhookMode;

    renderOwnerVisitorsList();
  } catch (_) {}
}

function setVisitorFilter(filterType, btnEl) {
  activeVisitorFilter = filterType;
  document.querySelectorAll('#visFilterPills .chip').forEach((c) => c.classList.toggle('active', c === btnEl));
  renderOwnerVisitorsList();
}

function formatVisitorDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderOwnerVisitorsList() {
  const wrap = document.getElementById('ownVisitorsListArea');
  if (!wrap) return;

  const q = (document.getElementById('visSearchInput')?.value || '').toLowerCase().trim();
  const filtered = ownerVisitorsCache.filter((v) => {
    if (activeVisitorFilter === 'GATE_VISIT' && v.eventType !== 'GATE_VISIT') return false;
    if (activeVisitorFilter === 'AUTH_SUCCESS' && v.eventType !== 'AUTH_SUCCESS') return false;
    if (activeVisitorFilter === 'REJECTED' && v.eventType !== 'AUTH_REJECT' && v.eventType !== 'BLACKLIST_BLOCK') return false;

    if (!q) return true;
    const hay = [
      v.ip, v.displayIp, v.country, v.location, v.isp, v.hwid,
      v.cpu, v.rawGpu, v.gpu, v.browser, v.osLabel, v.keyInfo, v.note
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:26px; text-align:center; color:#71717a; font-size:13px;">Henüz bu filtrede ziyaretçi kaydı yok.</div>`;
    return;
  }

  wrap.innerHTML = filtered.map((v) => {
    const isAuth = v.eventType === 'AUTH_SUCCESS';
    const isReject = v.eventType === 'AUTH_REJECT' || v.eventType === 'BLACKLIST_BLOCK';
    const isBlockedHwid = ownerBlockedHwidsCache.includes(v.hwid);

    const cardClass = isAuth ? 'type-auth' : (isReject ? 'type-reject' : '');
    let headLabel = 'Site Ziyareti';
    let badgeText = 'ZİYARET';
    let badgeStyle = 'border-color:rgba(255,255,255,0.18); color:#d4d4d8;';

    if (isAuth) {
      headLabel = `Yetkili Giriş • ${esc(v.keyLabel || v.role || 'Üye')}`;
      badgeText = `${esc(v.role || 'USER')}`;
      badgeStyle = 'border-color:rgba(34,197,94,0.4); color:#86efac;';
    } else if (isReject) {
      headLabel = `Reddedilen Deneme${v.note ? ' • ' + esc(v.note) : ''}`;
      badgeText = v.eventType === 'BLACKLIST_BLOCK' ? 'ENGEL' : 'RET';
      badgeStyle = 'border-color:rgba(239,68,68,0.45); color:#fca5a5;';
    }

    const dtStr = formatVisitorDateTime(v.lastSeenAt || v.ts);
    const cleanIp = v.displayIp || v.ip || '-';
    const isBlockedIp = ownerBlockedIpsCache.includes(cleanIp) || ownerBlockedIpsCache.includes(v.ip);
    const locStr = [v.country || v.location, v.isp && v.isp !== '-' ? v.isp : ''].filter(Boolean).join(' • ') || '-';
    const sysBrowser = String(v.browser || '-').split('/')[0] + (v.browser?.includes('/') ? ' ' + v.browser.split('/')[1].split('.')[0] : '');
    const cpuShort = String(v.cpu || '').replace(/\s+Processor$/i, '').trim() || `${v.cores || 4} Çekirdek`;

    return `
      <div class="vis-embed-card ${cardClass}">
        <div class="vis-embed-head">
          <div class="vis-embed-title">
            <span class="vc-pill" style="${badgeStyle}">${badgeText}</span>
            <span>${headLabel}</span>
            <span style="font-family:var(--font-mono); font-size:11px; color:#71717a; font-weight:400;">${esc(dtStr)}</span>
            ${(isBlockedHwid || isBlockedIp) ? `<span class="vc-pill" style="border-color:#ef4444; color:#fca5a5;">KARA LİSTE</span>` : ''}
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="mini-btn" onclick="copyText('${esc(cleanIp)}')">IP Kopyala</button>
            <button type="button" class="mini-btn" onclick="copyText('${esc(v.hwid)}')">HWID Kopyala</button>
            <button type="button" class="mini-btn" onclick="sendSingleVisitorToWebhook('${esc(v.id)}')">Webhook'a At</button>
            ${(v.ip && v.ip !== '127.0.0.1' && v.ip !== '::1') ? `
              <button type="button" class="mini-btn" style="border-color:${isBlockedIp ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}; color:${isBlockedIp ? '#86efac' : '#fca5a5'};" onclick="toggleVisitorIpBlacklist('${esc(v.ip)}')">
                ${isBlockedIp ? 'IP Aç' : 'IP Engelle'}
              </button>
            ` : ''}
            <button type="button" class="mini-btn" style="border-color:${isBlockedHwid ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}; color:${isBlockedHwid ? '#86efac' : '#fca5a5'};" onclick="toggleVisitorHwidBlacklist('${esc(v.hwid)}')">
              ${isBlockedHwid ? 'Engeli Kaldır' : 'HWID Engelle'}
            </button>
          </div>
        </div>

        <div class="vis-embed-grid">
          <div class="vis-field">
            <span class="vis-field-lbl">IP Adresi</span>
            <span class="vis-field-val" style="color:#ffffff;">${esc(cleanIp)}</span>
          </div>
          <div class="vis-field">
            <span class="vis-field-lbl">Konum & Sağlayıcı</span>
            <span class="vis-field-val">${esc(locStr)}</span>
          </div>
          <div class="vis-field">
            <span class="vis-field-lbl">Cihaz Kimliği (HWID)</span>
            <span class="vis-field-val" style="color:#e4e4e7;">${esc(v.hwid)}</span>
          </div>

          <div class="vis-field">
            <span class="vis-field-lbl">Sistem & Tarayıcı</span>
            <span class="vis-field-val">${esc(v.osLabel || 'Windows')} • ${esc(sysBrowser)} (${esc(v.screenRes || '1920x1080')})</span>
          </div>
          <div class="vis-field">
            <span class="vis-field-lbl">Donanım</span>
            <span class="vis-field-val">${esc(cpuShort)} • ${esc(v.ramGb || 8)} GB RAM</span>
          </div>
          <div class="vis-field">
            <span class="vis-field-lbl">Giriş Detayı</span>
            <span class="vis-field-val">${esc(v.keyInfo ? v.keyInfo : 'Ziyaretçi')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveVisitorWebhookSettings() {
  const webhookUrl = document.getElementById('visWebhookUrlInput')?.value.trim() || '';
  const webhookMode = document.getElementById('visWebhookModeSelect')?.value || 'all';
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-webhook', webhookUrl, webhookMode })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function testVisitorWebhook() {
  const webhookUrl = document.getElementById('visWebhookUrlInput')?.value.trim() || '';
  if (!webhookUrl) return showToast('Lütfen önce test edilecek Discord Webhook URL adresini girin.');
  const spec = collectHardwareSpec();
  const ipv4 = await fetchClientPublicIpv4();
  if (ipv4) spec.clientIpv4 = ipv4;
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test-webhook', webhookUrl, spec })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function sendSingleVisitorToWebhook(id) {
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-single-webhook', id })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function toggleVisitorHwidBlacklist(hwid) {
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-block-hwid', hwid })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
    fetchOwnerVisitors();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function toggleVisitorIpBlacklist(ip) {
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-block-ip', ip })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
    fetchOwnerVisitors();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

async function clearOwnerVisitors() {
  if (!confirm('Tüm ziyaretçi log geçmişini temizlemek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/owner/visitors/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear-visitors' })
    });
    const d = await res.json();
    if (!d.ok) return showToast('Hata: ' + d.error);
    showToast(d.message);
    fetchOwnerVisitors();
  } catch (e) {
    showToast('Hata: ' + e.message);
  }
}

function exportVisitorsCsv() {
  if (!ownerVisitorsCache.length) return showToast('Dışa aktarılacak ziyaretçi kaydı yok.');
  const rows = [['Tarih', 'Durum', 'IP', 'Ulke_Konum', 'ISP', 'HWID', 'Cihaz', 'OS', 'Tarayici', 'Ekran', 'CPU', 'RAM_GB', 'GPU', 'Dil', 'Timezone', 'Ag_Downlink', 'Ag_Tip', 'Touchscreen', 'Cookie_KB', 'Ziyaret_Sayisi', 'Anahtar_Not']];
  ownerVisitorsCache.forEach((v) => {
    rows.push([
      formatVisitorDateTime(v.lastSeenAt || v.ts),
      v.eventType,
      v.displayIp || v.ip,
      v.country || v.location || '',
      v.isp || '',
      v.hwid || '',
      v.deviceType || '',
      v.osLabel || '',
      v.browser || '',
      v.screenRes || v.screen || '',
      `${v.cores || ''}c ${v.cpu || ''}`,
      v.ramGb || '',
      v.rawGpu || v.gpu || '',
      v.lang || '',
      v.tz || '',
      v.netDownlink || '',
      v.netType || '',
      v.touchscreen || '',
      v.cookieSizeKb || '',
      v.visitCount || 1,
      `${v.keyInfo || ''} ${v.note || ''}`.trim()
    ]);
  });
  const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlobFile(`EarlyHost_Ziyaretci_Full_Log_${Date.now()}.csv`, csv);
  showToast('Ziyaretçi Full Gelişmiş Log CSV indirildi!');
}

// ----------------------- 9. INITIALIZATION -----------------------
(async function boot() {
  document.body.classList.add('gate-locked');
  await probeRealServerHwid();

  const savedKey = localStorage.getItem('earlyhost_saved_key');
  if (savedKey && document.getElementById('gateKeyInput')) {
    document.getElementById('gateKeyInput').value = savedKey;
  }

  // Check if user already has a valid active session matching real HWID
  const existingToken = localStorage.getItem('earlyhost_session_token');
  if (existingToken) {
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json();
      if (meData.ok && meData.profile) {
        unlockPortalGate(meData.profile, meData.announcement, meData.hardware);
      }
    } catch (_) {}
  }

  loadDcConfig();
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ok) {
      if (data.defaults?.webhookUrl && !document.getElementById('dcWebhookInput').value) {
        document.getElementById('dcWebhookInput').value = data.defaults.webhookUrl;
      }
      const bothOk = data.engines?.discordScraper && data.engines?.robloxScanner;
      document.getElementById('engineStatusText').textContent = bothOk ? '2 MOTOR AKTİF' : 'DISCORD AKTİF';
    }
  } catch (_) {
    document.getElementById('engineStatusText').textContent = 'ÇEVRİMDIŞI';
  }
})();
