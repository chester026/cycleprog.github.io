// --- NEW: checklist endpoints using DB and userId ---
// Extracted from server.js (T-4.1).
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const checklistRepo = require('../repositories/checklist');
const checklistService = require('../services/checklist');
patchAsyncRoutes(router);

// Get all checklist items for current user
router.get('/', authMiddleware, contract(c.checklist.list), async (req, res) => {
  const userId = req.user.userId;
  const rows = await checklistRepo.listItems(userId);
  res.json(rows);
});

// Add a checklist item for current user
router.post('/', authMiddleware, contract(c.checklist.create), async (req, res) => {
  const userId = req.user.userId;
  const row = await checklistRepo.createItem(userId, req.body);
  res.json(row);
});

// Update a checklist item — partial update of any of checked/link/item/section.
router.put('/:id', authMiddleware, contract(c.checklist.update), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await checklistService.updateItem(id, userId, req.body);
  if (!row) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json(row);
});

// Delete a checklist item
router.delete('/:id', authMiddleware, contract(c.checklist.remove), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await checklistRepo.deleteItem(id, userId);
  if (!row) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json({ success: true });
});

// Delete a checklist section (all items in the section)
router.delete('/section/:section', authMiddleware, contract(c.checklist.removeSection), async (req, res) => {
  const userId = req.user.userId;
  const { section } = req.params;

  // Декодируем название секции (двойное кодирование)
  const decodedSection = decodeURIComponent(decodeURIComponent(section));

  const rows = await checklistRepo.deleteSection(decodedSection, userId);
  if (rows.length === 0) return res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
  res.json({ success: true, deletedCount: rows.length });
});

// Rename a checklist section (every item in it moves to the new name).
router.put('/section/:section', authMiddleware, contract(c.checklist.renameSection), async (req, res) => {
  const userId = req.user.userId;
  const { section } = req.params;

  // Same double-decode convention as DELETE /section/:section — the client
  // encodes the section name twice.
  const decodedSection = decodeURIComponent(decodeURIComponent(section));

  const rows = await checklistRepo.renameSection(decodedSection, userId, req.body.section);
  if (rows.length === 0) return res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
  res.json({ success: true, updatedCount: rows.length });
});

module.exports = router;
