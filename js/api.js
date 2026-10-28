/**
 * SpinOption Frontend API Client
 * Connects to backend Express API (/api/*) with seamless local fallback
 */
(function(window) {
  'use strict';

  // Base API URL (relative for same-origin on Vercel or local server)
  const API_BASE = '/api';

  // Helper for fetch with timeout
  async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Local fallback implementations in case BE is offline
  function localShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const randArr = new Uint32Array(1);
      window.crypto.getRandomValues(randArr);
      const j = Math.floor((randArr[0] / (0xffffffff + 1)) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function localParseCandidates(source) {
    if (Array.isArray(source)) return source.map(s => String(s).trim()).filter(Boolean);
    if (typeof source === 'string') {
      return source.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
    }
    return [];
  }

  const SpinApi = {
    isBackendAvailable: null,

    /**
     * Check if Backend API is reachable
     */
    async checkHealth() {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/health`, { method: 'GET' }, 3000);
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = data.status === 'ok';
          return data;
        }
      } catch (e) {
        this.isBackendAvailable = false;
      }
      return null;
    },

    /**
     * POST /api/pick - Pick N candidates randomly
     */
    async pick({ source, candidates, count = 1, excluded = [] }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/pick`, {
          method: 'POST',
          body: JSON.stringify({ source, candidates, count, excluded })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (err) {
        console.warn('[SpinApi] /api/pick failed or offline, falling back to local computation:', err.message);
      }

      // Local fallback
      const all = localParseCandidates(source || candidates);
      const excludedSet = new Set(excluded || []);
      const available = all.filter(c => !excludedSet.has(c));
      if (!available.length) {
        return { success: false, picked: [], drawComplete: true, total: all.length, available: 0, excluded };
      }
      const num = Math.min(available.length, Math.max(1, count));
      const shuffled = localShuffle(available);
      const picked = shuffled.slice(0, num);
      const newExcluded = [...excluded, ...picked];
      return {
        success: true,
        picked,
        total: all.length,
        available: available.length - num,
        drawComplete: available.length - num === 0,
        excluded: newExcluded,
        fallback: true
      };
    },

    /**
     * POST /api/order - Order / Shuffle all candidates
     */
    async order({ source, candidates }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/order`, {
          method: 'POST',
          body: JSON.stringify({ source, candidates })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (err) {
        console.warn('[SpinApi] /api/order failed, using local fallback:', err.message);
      }

      const all = localParseCandidates(source || candidates);
      return {
        success: true,
        ordered: localShuffle(all),
        total: all.length,
        fallback: true
      };
    },

    /**
     * POST /api/wheel - Calculate wheel spin target & winner
     */
    async wheel({ source, candidates, currentRotation = 0 }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/wheel`, {
          method: 'POST',
          body: JSON.stringify({ source, candidates, currentRotation })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (err) {
        console.warn('[SpinApi] /api/wheel failed, using local fallback:', err.message);
      }

      const all = localParseCandidates(source || candidates);
      if (!all.length) return { success: false, error: 'NO_CANDIDATES' };
      const randArr = new Uint32Array(1);
      window.crypto.getRandomValues(randArr);
      const winnerIndex = randArr[0] % all.length;
      const winner = all[winnerIndex];
      const segmentAngle = 360 / all.length;
      const targetCenter = winnerIndex * segmentAngle + segmentAngle / 2;
      const extraTurns = (8 + (randArr[0] % 4)) * 360;
      const normCur = ((currentRotation % 360) + 360) % 360;
      const delta = ((360 - targetCenter - normCur + 360) % 360) + extraTurns;
      return {
        success: true,
        winner,
        winnerIndex,
        total: all.length,
        segmentAngle,
        finalRotation: currentRotation + delta,
        fallback: true
      };
    },

    /**
     * POST /api/multi-run - Run 1 to 5 boards simultaneously
     */
    async multiRun({ boards }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/multi-run`, {
          method: 'POST',
          body: JSON.stringify({ boards })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (err) {
        console.warn('[SpinApi] /api/multi-run failed, using local fallback:', err.message);
      }

      // Local multi-board fallback
      const results = boards.map(b => {
        const items = localParseCandidates(b.source);
        if (!items.length) return { id: b.id, title: b.title, result: null };
        if (b.mode === 'wheel') {
          const randArr = new Uint32Array(1);
          window.crypto.getRandomValues(randArr);
          const idx = randArr[0] % items.length;
          return { id: b.id, title: b.title, mode: 'wheel', winner: items[idx], result: items[idx], winnerIndex: idx };
        } else if (b.mode === 'order') {
          const ord = localShuffle(items);
          return { id: b.id, title: b.title, mode: 'order', ordered: ord, result: ord };
        } else {
          const pickCount = Math.min(items.length, Math.max(1, b.pickCount || 1));
          const p = localShuffle(items).slice(0, pickCount);
          return { id: b.id, title: b.title, mode: 'pick', picked: p, result: p.join(' · ') };
        }
      });
      return { success: true, results, fallback: true };
    },

    /**
     * POST /api/clean - Clean text (trim, blank lines, duplicates)
     */
    async clean({ source = '', type = 'trim' }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/clean`, {
          method: 'POST',
          body: JSON.stringify({ source, type })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (err) {
        console.warn('[SpinApi] /api/clean failed, using local fallback:', err.message);
      }

      const lines = source.replace(/\r\n?/g, '\n').split('\n');
      let cleaned = [];
      if (type === 'trim') cleaned = lines.map(l => l.trim());
      else if (type === 'blank') cleaned = lines.filter(l => l.trim().length > 0);
      else if (type === 'duplicates') {
        const s = new Set();
        cleaned = lines.filter(l => {
          const t = l.trim();
          if (!t) return true;
          if (s.has(t)) return false;
          s.add(t);
          return true;
        });
      }
      return { success: true, cleaned: cleaned.join('\n'), fallback: true };
    },

    /**
     * GET /api/lists
     */
    async getLists() {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/lists`, { method: 'GET' }, 3000);
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data.lists || [];
        }
      } catch (e) {
        // silent fallback to localStorage
      }
      return null;
    },

    /**
     * POST /api/lists
     */
    async saveList({ id, name, source, items }) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/lists`, {
          method: 'POST',
          body: JSON.stringify({ id, name, source, items })
        });
        if (res.ok) {
          const data = await res.json();
          this.isBackendAvailable = true;
          return data;
        }
      } catch (e) {
        // fallback
      }
      return null;
    },

    /**
     * DELETE /api/lists/:id
     */
    async deleteList(id) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/lists/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) return await res.json();
      } catch (e) {
        // fallback
      }
      return null;
    }
  };

  // Expose to window
  window.SpinApi = SpinApi;

  // Initial silent health check
  setTimeout(() => SpinApi.checkHealth(), 100);
})(window);
