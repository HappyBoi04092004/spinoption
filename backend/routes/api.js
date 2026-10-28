const express = require('express');
const router = express.Router();
const randomService = require('../services/randomService');

// In-memory store for saved lists (can sync with client localStorage)
let savedListsStore = [
  {
    id: 'sample-travel',
    name: 'Địa điểm du lịch',
    items: ['Ba Vì', 'Tam Đảo', 'Tà Xùa', 'Đà Lạt', 'Sa Pa', 'Hạ Long', 'Phú Quốc', 'Hội An', 'Ninh Bình', 'Mộc Châu'],
    updatedAt: Date.now()
  },
  {
    id: 'sample-food',
    name: 'Món ăn hôm nay',
    items: ['Phở bò', 'Bún chả', 'Cơm tấm', 'Bánh mì', 'Bún bò Huế', 'Mì Quảng', 'Lẩu Thái'],
    updatedAt: Date.now()
  }
];

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SpinOption API',
    version: '1.1.0',
    timestamp: Date.now()
  });
});

// Pick random candidates
router.post('/pick', (req, res) => {
  try {
    const { source, candidates, count = 1, excluded = [] } = req.body;
    const input = source !== undefined ? source : candidates;
    const result = randomService.pickCandidates(input, count, excluded);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Order / Shuffle candidates
router.post('/order', (req, res) => {
  try {
    const { source, candidates } = req.body;
    const input = source !== undefined ? source : candidates;
    const result = randomService.orderCandidates(input);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Spin Wheel calculation
router.post('/wheel', (req, res) => {
  try {
    const { source, candidates, currentRotation = 0 } = req.body;
    const input = source !== undefined ? source : candidates;
    const result = randomService.spinWheel(input, currentRotation);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Multi-board execution
router.post('/multi-run', (req, res) => {
  try {
    const { boards } = req.body;
    if (!Array.isArray(boards)) {
      return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'boards array is required' });
    }
    const result = randomService.runMultiBoards(boards);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Clean and organize candidates text
router.post('/clean', (req, res) => {
  try {
    const { source = '', type = 'trim' } = req.body;
    const result = randomService.cleanText(source, type);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Get saved lists
router.get('/lists', (req, res) => {
  res.json({
    success: true,
    lists: savedListsStore
  });
});

// Save or update a list
router.post('/lists', (req, res) => {
  try {
    const { id, name, items, source } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'NAME_REQUIRED', message: 'Tên danh sách không được để trống' });
    }

    const parsedItems = items || randomService.parseCandidates(source || '');
    if (!parsedItems.length) {
      return res.status(400).json({ success: false, error: 'ITEMS_REQUIRED', message: 'Danh sách không có lựa chọn nào' });
    }

    const listId = id || `list-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const existingIndex = savedListsStore.findIndex(l => l.id === listId || l.name.trim().toLowerCase() === name.trim().toLowerCase());

    const listData = {
      id: existingIndex >= 0 ? savedListsStore[existingIndex].id : listId,
      name: name.trim(),
      items: parsedItems,
      source: parsedItems.join('\n'),
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      savedListsStore[existingIndex] = listData;
    } else {
      if (savedListsStore.length >= 50) {
        return res.status(400).json({ success: false, error: 'LIMIT_REACHED', message: 'Đã đạt giới hạn tối đa 50 danh sách' });
      }
      savedListsStore.unshift(listData);
    }

    return res.json({ success: true, list: listData, lists: savedListsStore });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// Delete a list
router.delete('/lists/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = savedListsStore.length;
  savedListsStore = savedListsStore.filter(l => l.id !== id);
  const deleted = savedListsStore.length < initialLength;
  return res.json({ success: deleted, lists: savedListsStore });
});

module.exports = router;
