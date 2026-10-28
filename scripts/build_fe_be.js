const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix CSP
content = content.replace("connect-src 'none';", "connect-src 'self' data: blob:;");

// 2. Add API status badge CSS
const statusCss = `
    .api-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface-warm);
      border: 1px solid var(--line);
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--muted);
      transition: all .2s ease;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, .6);
    }
    .status-dot.offline {
      background: #f59e0b;
      box-shadow: 0 0 6px rgba(245, 158, 11, .6);
    }
`;
content = content.replace('/* Multi-board selector and grid styles */', statusCss + '\n    /* Multi-board selector and grid styles */');

// 3. Add API status badge HTML into .header-actions
const badgeHtml = `<div class="api-status-badge" id="apiStatusBadge" title="Trạng thái kết nối máy chủ">
          <span class="status-dot online" id="apiStatusDot"></span>
          <span class="status-text" id="apiStatusText">BE Online</span>
        </div>
        <button class="language-button"`;
content = content.replace('<button class="language-button"', badgeHtml);

// 4. Inject js/api.js before main script
content = content.replace('  <script>\n    (() => {', '  <script src="js/api.js"></script>\n  <script>\n    (() => {');

// 5. Replace placeholders
const appConfigStr = `const APP_CONFIG = {
        name: "SpinOption",
        version: "1.1.0",
        defaultLanguage: "vi",
        repository: { owner: "HappyBoi04092004", name: "SpinOption" }
      };`;
const buildManifestStr = `const BUILD_MANIFEST = {
        schemaVersion: 2,
        app: { name: "SpinOption", version: "1.1.0" }
      };`;
const assetBundleStr = `const assetBundle = { schemaVersion: 2, dependencies: {} };`;

content = content.replace('const APP_CONFIG = __APP_CONFIG_JSON__;', appConfigStr);
content = content.replace('const BUILD_MANIFEST = __BUILD_MANIFEST_JSON__;', buildManifestStr);
content = content.replace('const assetBundle = __EMBEDDED_ASSET_BUNDLE_JSON__;', assetBundleStr);

// 6. Fix default state.source
const defaultSampleCandidates = 'Ba Vì\\nTam Đảo\\nTà Xùa\\nĐà Lạt\\nSa Pa\\nHạ Long\\nPhú Quốc\\nHội An\\nNinh Bình\\nMộc Châu';
content = content.replace(
  "language: 'vi', mode: 'pick', source: '',",
  `language: 'vi', mode: 'pick', source: '${defaultSampleCandidates}',`
);

content = content.replace(
  'function loadState() {\n        const raw = safeStorageGet(storageKey); if (!raw) return;',
  `function loadState() {\n        const raw = safeStorageGet(storageKey);\n        if (!raw) {\n          state.source = '${defaultSampleCandidates}';\n          return;\n        }`
);

// 7. Fix canvas stroke invalid color bug on line 2859
content = content.replace("ctx.strokeStyle = '# dadbd6';", "ctx.strokeStyle = '#dadbd6';");

// 8. Replace runPick with API integration
const newRunPick = `async function runPick() {
        const available = availableCandidates();
        const count = normalizeInt(state.pickCount, 1, 1000, 1);
        if (available.length < count) { AppToast.show({message:t('notEnough'),tone:'warning'}); return; }
        
        let selected = [];
        if (window.SpinApi) {
          const apiRes = await SpinApi.pick({
            source: state.source,
            count,
            excluded: state.excludeSelected ? Array.from(state.excluded).map(id => {
              const c = available.find(item => item.id === id);
              return c ? c.label : '';
            }).filter(Boolean) : []
          });
          if (apiRes && apiRes.success && apiRes.picked && apiRes.picked.length) {
            selected = apiRes.picked.map((label, i) => {
              const match = available.find(c => c.label === label);
              return match || { id: 10000 + i, label };
            });
          }
        }
        if (!selected.length) {
          selected = selectUnique(available, count);
        }

        if (state.excludeSelected) selected.forEach(candidate => state.excluded.add(candidate.id));
        state.result = { type:'pick', values:selected.map(candidate => candidate.label), at:Date.now() };
        addHistory(selected,'pick'); saveState(); renderResult(); updateCandidateStats(); burstConfetti();
      }`;
content = content.replace(/function runPick\(\) \{[\s\S]*?burstConfetti\(\);\s*\}/, newRunPick);

// 9. Replace runOrder with API integration
const newRunOrder = `async function runOrder() {
        const available = parseCandidates().candidates; if (!available.length) return;
        let orderedLabels = [];
        if (window.SpinApi) {
          const apiRes = await SpinApi.order({ source: state.source });
          if (apiRes && apiRes.success && apiRes.ordered) {
            orderedLabels = apiRes.ordered;
          }
        }
        if (!orderedLabels.length) {
          orderedLabels = secureShuffle(available).map(c => c.label);
        }
        state.result = { type:'order', values:orderedLabels, at:Date.now() };
        renderResult(); burstConfetti(12);
      }`;
content = content.replace(/function runOrder\(\) \{[\s\S]*?burstConfetti\(12\);\s*\}/, newRunOrder);

// 10. Replace runWheel with API integration
const newRunWheel = `async function runWheel() {
        const available = parseCandidates().candidates;
        if (!available.length) return;
        if (parseCandidates().candidates.length > MAX_WHEEL) { AppToast.show({message:t('wheelLimit'),tone:'warning'}); return; }
        
        let winnerLabel = '';
        let finalDelta = 0;
        if (window.SpinApi) {
          const apiRes = await SpinApi.wheel({ source: state.source, currentRotation: state.wheelRotation });
          if (apiRes && apiRes.success && apiRes.winner) {
            winnerLabel = apiRes.winner;
            finalDelta = apiRes.delta || (apiRes.finalRotation - state.wheelRotation);
          }
        }
        if (!winnerLabel) {
          const selected = available[secureRandomInt(available.length)];
          winnerLabel = selected.label;
          const selectedIndex = available.findIndex(candidate => candidate.id === selected.id);
          const segment = 360 / available.length;
          const targetCenter = selectedIndex * segment + segment / 2;
          const extraTurns = 9 + secureRandomInt(4);
          const normalizedCurrent = ((state.wheelRotation % 360) + 360) % 360;
          const targetNormalized = 360 - targetCenter;
          finalDelta = ((targetNormalized - normalizedCurrent + 360) % 360) + extraTurns * 360;
        }

        const startRotation = state.wheelRotation;
        const spinToken = ++state.wheelSpinToken;
        state.wheelRotation = startRotation + finalDelta;
        state.isSpinning = true;
        renderResult({ wheelCandidates:available, wheelPending:winnerLabel, wheelStartRotation:startRotation }); updateCandidateStats();
        if ($('#presentationDialog').open) renderPresentationWheel(available,{ wheelPending:winnerLabel, wheelStartRotation:startRotation });
        const canvases = $$('.wheel-canvas'); if (canvases.length) { requestAnimationFrame(() => requestAnimationFrame(() => { canvases.forEach(canvas => { canvas.classList.add('spinning'); canvas.style.setProperty('--wheel-rotation',\`\${state.wheelRotation}deg\`); }); })); }
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => {
          if (spinToken !== state.wheelSpinToken) return;
          state.isSpinning = false;
          state.result = { type:'wheel', values:[winnerLabel], at:Date.now(), wheelRotation:state.wheelRotation };
          addHistory([{ id: 0, label: winnerLabel }],'wheel'); saveState(); renderResult(); updateCandidateStats(); if ($('#presentationDialog').open) renderPresentationResult(); burstConfetti();
        }, reduced ? 30 : 5850);
      }`;
content = content.replace(/function runWheel\(\) \{[\s\S]*?burstConfetti\(\);\s*\}, reduced \? 30 : 5850\);\s*\}/, newRunWheel);

// 11. Replace runAllBoards with API integration
const newRunAllBoards = `async function runAllBoards() {
        const activeBoards = multiBoardState.boards.slice(0, multiBoardState.count);
        const eligible = activeBoards.filter(b => parseBoardCandidates(b.source).length > 0 && !b.isSpinning);
        if (!eligible.length) return;

        let apiResults = null;
        if (window.SpinApi) {
          const res = await SpinApi.multiRun({
            boards: eligible.map(b => ({
              id: b.id,
              title: b.title,
              mode: b.mode,
              source: b.source,
              pickCount: b.pickCount || 1,
              wheelRotation: b.wheelRotation || 0
            }))
          });
          if (res && res.success) apiResults = res.results;
        }

        eligible.forEach(board => {
          const serverPreset = apiResults ? apiResults.find(r => r.id === board.id) : null;
          runSingleBoard(board.id, serverPreset);
        });
      }`;
content = content.replace(/function runAllBoards\(\) \{[\s\S]*?burstConfetti\(\);\s*\}\s*\}\s*\}/, newRunAllBoards);

// 12. Replace runSingleBoard with async / API integration
const newRunSingleBoard = `async function runSingleBoard(boardId, presetResult) {
        const board = multiBoardState.boards[boardId - 1];
        if (!board || board.isSpinning) return;
        const items = parseBoardCandidates(board.source);
        if (!items.length) return;

        if (board.mode === 'wheel') {
          board.isSpinning = true;
          updateMultiBoardStats(boardId);

          let winner = '';
          let winnerIndex = 0;
          let finalRotation = 0;

          if (presetResult && presetResult.winner) {
            winner = presetResult.winner;
            winnerIndex = presetResult.winnerIndex || 0;
            finalRotation = presetResult.finalRotation || (board.wheelRotation + 2160);
          } else if (window.SpinApi) {
            const res = await SpinApi.wheel({ source: board.source, currentRotation: board.wheelRotation });
            if (res && res.success && res.winner) {
              winner = res.winner;
              winnerIndex = res.winnerIndex;
              finalRotation = res.finalRotation;
            }
          }

          if (!winner) {
            winnerIndex = secureRandomInt(items.length);
            winner = items[winnerIndex];
            const count = items.length;
            const sliceAngle = (Math.PI * 2) / count;
            const targetSliceAngle = (Math.PI * 2) - (winnerIndex * sliceAngle + sliceAngle / 2);
            const currentNorm = board.wheelRotation % (Math.PI * 2);
            const fullSpins = (5 + secureRandomInt(3)) * Math.PI * 2;
            finalRotation = board.wheelRotation + fullSpins + ((targetSliceAngle - currentNorm + Math.PI * 4) % (Math.PI * 2));
          }

          const startTime = performance.now();
          const duration = 2800 + secureRandomInt(600);
          const startRotation = board.wheelRotation;

          function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const ease = 1 - Math.pow(1 - progress, 3);
            board.wheelRotation = startRotation + (finalRotation - startRotation) * ease;
            drawBoardWheel(boardId);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              board.isSpinning = false;
              board.wheelRotation = finalRotation;
              board.result = winner;
              drawBoardWheel(boardId);
              const winnerEl = $(\`#boardWinner-\${boardId}\`);
              if (winnerEl) winnerEl.textContent = winner;
              updateMultiBoardStats(boardId);
              renderCombinedResult();
              addMultiBoardHistory([{ title: board.title, value: winner }]);
              burstConfetti();
            }
          }
          requestAnimationFrame(animate);
        } else if (board.mode === 'order') {
          let ordered = null;
          if (presetResult && presetResult.ordered) {
            ordered = presetResult.ordered;
          } else if (window.SpinApi) {
            const res = await SpinApi.order({ source: board.source });
            if (res && res.success && res.ordered) ordered = res.ordered;
          }
          if (!ordered) ordered = secureShuffle(items);

          board.result = ordered;
          renderBoardStage(boardId);
          renderCombinedResult();
          addMultiBoardHistory([{ title: board.title, value: ordered }]);
          burstConfetti();
        } else {
          // Pick
          let picked = null;
          if (presetResult && presetResult.result) {
            picked = presetResult.result;
          } else if (window.SpinApi) {
            const res = await SpinApi.pick({ source: board.source, count: board.pickCount || 1 });
            if (res && res.success && res.picked) {
              picked = Array.isArray(res.picked) ? res.picked.join(' · ') : res.picked;
            }
          }
          if (!picked) {
            const count = Math.min(items.length, Math.max(1, board.pickCount || 1));
            const selected = selectUnique(items.map((it, idx) => ({ id: idx, label: it })), count);
            picked = selected.map(s => s.label).join(' · ');
          }

          board.result = picked;
          renderBoardStage(boardId);
          renderCombinedResult();
          addMultiBoardHistory([{ title: board.title, value: picked }]);
          burstConfetti();
        }
      }`;
content = content.replace(/function runSingleBoard\(boardId\) \{[\s\S]*?burstConfetti\(\);\s*\}\s*\}/, newRunSingleBoard);

// 13. Add API Health Polling & Status updater at end of DOM ready
const healthUpdateLogic = `
        // Check API health and update badge
        if (window.SpinApi) {
          SpinApi.checkHealth().then(data => {
            const dot = $('#apiStatusDot');
            const txt = $('#apiStatusText');
            if (dot && txt) {
              if (data && data.status === 'ok') {
                dot.className = 'status-dot online';
                txt.textContent = 'BE Online';
              } else {
                dot.className = 'status-dot offline';
                txt.textContent = 'Client Fallback';
              }
            }
          });
        }
`;
content = content.replace('init();', 'init();\n' + healthUpdateLogic);

// Write updated file
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ frontend/index.html updated successfully!');

// Also synchronize to root index.html
fs.writeFileSync(path.join(__dirname, '../index.html'), content, 'utf8');
console.log('✅ root index.html synchronized!');
