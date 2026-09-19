// Checklist business logic (T-4.1 domain extraction) — validation that
// belongs above the raw SQL in repositories/checklist.js. Routes stay
// HTTP-only (server/routes/checklist.js); SQL stays in the repo.
const { badRequest } = require('../lib/apiError');
const checklistRepo = require('../repositories/checklist');

const UPDATE_FIELDS = ['checked', 'link', 'item', 'section'];

// PUT /api/checklist/:id body is a partial update — at least one of
// checked/link/item/section must be present, or there's nothing to do.
async function updateItem(id, userId, body) {
  const hasField = UPDATE_FIELDS.some((f) => body?.[f] !== undefined);
  if (!hasField) {
    throw badRequest(
      'VALIDATION_ERROR',
      `Provide at least one of: ${UPDATE_FIELDS.join(', ')}`
    );
  }
  return checklistRepo.updateItem(id, userId, body);
}

module.exports = { updateItem };
