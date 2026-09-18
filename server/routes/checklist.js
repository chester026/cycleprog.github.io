// --- NEW: checklist endpoints using DB and userId ---
// Extracted from server.js (T-4.1).
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { validateBody } = require('../middleware/validate');
const { ChecklistItemCreateSchema, ChecklistItemUpdateSchema } = require('@bikelab/shared/types');
const checklistRepo = require('../repositories/checklist');
patchAsyncRoutes(router);

// Get all checklist items for current user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const rows = await checklistRepo.listItems(userId);
  res.json(rows);
});

// Add a checklist item for current user
router.post('/', authMiddleware, validateBody(ChecklistItemCreateSchema), async (req, res) => {
  const userId = req.user.userId;
  const row = await checklistRepo.createItem(userId, req.body);
  res.json(row);
});

// Update a checklist item (e.g., mark as checked)
router.put('/:id', authMiddleware, validateBody(ChecklistItemUpdateSchema), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await checklistRepo.updateItem(id, userId, req.body);
  if (!row) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json(row);
});

// Delete a checklist item
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await checklistRepo.deleteItem(id, userId);
  if (!row) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json({ success: true });
});

// Delete a checklist section (all items in the section)
router.delete('/section/:section', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { section } = req.params;

  // Декодируем название секции (двойное кодирование)
  const decodedSection = decodeURIComponent(decodeURIComponent(section));

  const rows = await checklistRepo.deleteSection(decodedSection, userId);
  if (rows.length === 0) return res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
  res.json({ success: true, deletedCount: rows.length });
});

module.exports = router;
