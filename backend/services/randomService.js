const crypto = require('crypto');

/**
 * Returns a cryptographically secure random integer in [0, max)
 */
function secureRandomInt(max) {
  if (max <= 0) return 0;
  return crypto.randomInt(0, max);
}

/**
 * Parses multiline string or array into sanitized candidate strings
 */
function parseCandidates(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Fisher-Yates shuffle using cryptographically secure random
 */
function secureShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Random Pick
 * @param {string|Array} source - Candidates list
 * @param {number} count - Number of items to pick
 * @param {Array<string>} excluded - Previously selected items to exclude
 */
function pickCandidates(source, count = 1, excluded = []) {
  const all = parseCandidates(source);
  const excludedSet = new Set(Array.isArray(excluded) ? excluded : []);
  const available = all.filter(c => !excludedSet.has(c));

  if (!available.length) {
    return {
      success: false,
      error: 'NO_CANDIDATES',
      message: 'Không còn lựa chọn khả dụng để bốc thăm',
      picked: [],
      drawComplete: true,
      total: all.length,
      available: 0,
      excluded: Array.from(excludedSet)
    };
  }

  const numToPick = Math.min(available.length, Math.max(1, parseInt(count, 10) || 1));
  const shuffled = secureShuffle(available);
  const picked = shuffled.slice(0, numToPick);
  const newExcluded = [...Array.from(excludedSet), ...picked];
  const newAvailableCount = available.length - numToPick;

  return {
    success: true,
    picked,
    total: all.length,
    available: newAvailableCount,
    drawComplete: newAvailableCount === 0,
    excluded: newExcluded
  };
}

/**
 * Random Order (Shuffle all items)
 * @param {string|Array} source
 */
function orderCandidates(source) {
  const all = parseCandidates(source);
  if (!all.length) {
    return {
      success: false,
      error: 'NO_CANDIDATES',
      message: 'Danh sách lựa chọn trống',
      ordered: []
    };
  }
  const ordered = secureShuffle(all);
  return {
    success: true,
    ordered,
    total: all.length
  };
}

/**
 * Wheel Spin Calculation
 * @param {string|Array} source
 * @param {number} currentRotation - Current angle in degrees or radians
 */
function spinWheel(source, currentRotation = 0) {
  const all = parseCandidates(source);
  if (!all.length) {
    return {
      success: false,
      error: 'NO_CANDIDATES',
      message: 'Danh sách lựa chọn trống'
    };
  }

  const count = all.length;
  const winnerIndex = secureRandomInt(count);
  const winner = all[winnerIndex];
  const segmentAngle = 360 / count;
  const targetCenter = winnerIndex * segmentAngle + segmentAngle / 2;
  const extraTurns = 8 + secureRandomInt(4);
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const targetNormalized = 360 - targetCenter;
  const delta = ((targetNormalized - normalizedCurrent + 360) % 360) + extraTurns * 360;
  const finalRotation = currentRotation + delta;

  return {
    success: true,
    winner,
    winnerIndex,
    total: count,
    segmentAngle,
    delta,
    finalRotation
  };
}

/**
 * Multi-board execution
 * @param {Array} boards - List of board configurations
 */
function runMultiBoards(boards = []) {
  if (!Array.isArray(boards)) return { success: false, error: 'INVALID_INPUT' };

  const results = boards.map(b => {
    const candidates = parseCandidates(b.source);
    if (!candidates.length) {
      return { id: b.id, title: b.title, result: null, error: 'EMPTY' };
    }

    if (b.mode === 'wheel') {
      const wheelRes = spinWheel(b.source, b.wheelRotation || 0);
      return {
        id: b.id,
        title: b.title,
        mode: 'wheel',
        winner: wheelRes.winner,
        winnerIndex: wheelRes.winnerIndex,
        finalRotation: wheelRes.finalRotation,
        result: wheelRes.winner
      };
    } else if (b.mode === 'order') {
      const orderRes = orderCandidates(b.source);
      return {
        id: b.id,
        title: b.title,
        mode: 'order',
        ordered: orderRes.ordered,
        result: orderRes.ordered
      };
    } else {
      // Pick mode
      const pickRes = pickCandidates(b.source, b.pickCount || 1, b.excluded || []);
      const pickedFormatted = Array.isArray(pickRes.picked) ? pickRes.picked.join(' · ') : pickRes.picked;
      return {
        id: b.id,
        title: b.title,
        mode: 'pick',
        picked: pickRes.picked,
        result: pickedFormatted
      };
    }
  });

  return {
    success: true,
    results
  };
}

/**
 * Clean & organize text
 * @param {string} source
 * @param {'trim'|'blank'|'duplicates'} type
 */
function cleanText(source = '', type = 'trim') {
  if (typeof source !== 'string') source = '';
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let cleanedLines = [];

  if (type === 'trim') {
    cleanedLines = lines.map(line => line.trim());
  } else if (type === 'blank') {
    cleanedLines = lines.filter(line => line.trim().length > 0);
  } else if (type === 'duplicates') {
    const seen = new Set();
    cleanedLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (seen.has(trimmed)) return false;
      seen.add(trimmed);
      return true;
    });
  } else {
    cleanedLines = lines;
  }

  return {
    success: true,
    type,
    cleaned: cleanedLines.join('\n'),
    lineCount: cleanedLines.length
  };
}

module.exports = {
  secureRandomInt,
  parseCandidates,
  secureShuffle,
  pickCandidates,
  orderCandidates,
  spinWheel,
  runMultiBoards,
  cleanText
};
