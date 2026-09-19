// Unit tests for the checklist coach tools (get_checklist/add_checklist_items/
// update_checklist_item) with repositories/checklist.js and
// services/checklist.js stubbed — no real DB connection. Following this
// repo's convention (see test/skills.service.test.js): stub a property on
// the already-`require`d module BEFORE requiring aiCoach.js, since Node's
// require cache means aiCoach.js sees the same object as long as it reads
// via property access rather than a destructured copy.
//
// Real-Postgres end-to-end coverage of the underlying routes lives in
// test/integration/checklist.test.js.
const checklistRepo = require('../repositories/checklist');
const listItemsMock = vi.fn();
const createItemMock = vi.fn();
const deleteItemMock = vi.fn();
checklistRepo.listItems = listItemsMock;
checklistRepo.createItem = createItemMock;
checklistRepo.deleteItem = deleteItemMock;

const checklistService = require('../services/checklist');
const updateItemMock = vi.fn();
checklistService.updateItem = updateItemMock;

const createCoachModule = require('../aiCoach');

describe('aiCoach checklist tools', () => {
  let executeTool;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    const coach = createCoachModule({
      pool: { query: vi.fn() },
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
    executeTool = coach.executeTool;
  });

  describe('get_checklist', () => {
    it('groups the user\'s items by section with id/checked/link only', async () => {
      listItemsMock.mockResolvedValue([
        { id: 1, user_id: userId, section: 'Shopping', item: 'Tires', checked: false, link: 'https://x.test/tires' },
        { id: 2, user_id: userId, section: 'Shopping', item: 'Bibs', checked: true, link: null },
        { id: 3, user_id: userId, section: 'Packing', item: 'Pump', checked: false, link: null },
      ]);

      const result = await executeTool('get_checklist', {}, { userId });

      expect(listItemsMock).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        sections: {
          Shopping: [
            { id: 1, item: 'Tires', checked: false, link: 'https://x.test/tires' },
            { id: 2, item: 'Bibs', checked: true, link: null },
          ],
          Packing: [{ id: 3, item: 'Pump', checked: false, link: null }],
        },
      });
    });

    it('returns an empty sections map when the checklist is empty', async () => {
      listItemsMock.mockResolvedValue([]);
      const result = await executeTool('get_checklist', {}, { userId });
      expect(result).toEqual({ sections: {} });
    });
  });

  describe('add_checklist_items', () => {
    it('creates every item under the given section and returns compact rows', async () => {
      createItemMock
        .mockResolvedValueOnce({ id: 10, section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000' })
        .mockResolvedValueOnce({ id: 11, section: 'Shopping', item: 'Sealant', link: null });

      const result = await executeTool(
        'add_checklist_items',
        { section: 'Shopping', items: [{ item: 'Continental GP5000', link: 'https://x.test/gp5000' }, { item: 'Sealant' }] },
        { userId }
      );

      expect(createItemMock).toHaveBeenCalledTimes(2);
      expect(createItemMock).toHaveBeenNthCalledWith(1, userId, { section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000' });
      expect(createItemMock).toHaveBeenNthCalledWith(2, userId, { section: 'Shopping', item: 'Sealant', link: null });
      expect(result).toEqual({
        section: 'Shopping',
        added: [
          { id: 10, section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000' },
          { id: 11, section: 'Shopping', item: 'Sealant', link: null },
        ],
      });
    });

    it('defaults to the "Shopping" section when none is given', async () => {
      createItemMock.mockResolvedValue({ id: 20, section: 'Shopping', item: 'Power meter', link: null });
      const result = await executeTool('add_checklist_items', { items: [{ item: 'Power meter' }] }, { userId });
      expect(createItemMock).toHaveBeenCalledWith(userId, { section: 'Shopping', item: 'Power meter', link: null });
      expect(result.section).toBe('Shopping');
    });

    it('skips blank items instead of creating an empty row', async () => {
      const result = await executeTool('add_checklist_items', { items: [{ item: '   ' }, {}] }, { userId });
      expect(createItemMock).not.toHaveBeenCalled();
      expect(result.added).toEqual([]);
    });
  });

  describe('update_checklist_item', () => {
    it('checks an item off via the same partial-update service the PUT route uses', async () => {
      updateItemMock.mockResolvedValue({ id: 5, section: 'Shopping', item: 'Bibs', checked: true, link: null });

      const result = await executeTool('update_checklist_item', { id: 5, checked: true }, { userId });

      expect(updateItemMock).toHaveBeenCalledWith(5, userId, { checked: true });
      expect(result).toEqual({ id: 5, section: 'Shopping', item: 'Bibs', checked: true, link: null });
    });

    it('deletes the item instead of updating it when delete is true', async () => {
      deleteItemMock.mockResolvedValue({ id: 5, section: 'Shopping', item: 'Bibs' });

      const result = await executeTool('update_checklist_item', { id: 5, delete: true }, { userId });

      expect(deleteItemMock).toHaveBeenCalledWith(5, userId);
      expect(updateItemMock).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, id: 5 });
    });

    it('treats an empty-string link as clearing it, not setting the literal text', async () => {
      updateItemMock.mockResolvedValue({ id: 5, section: 'Shopping', item: 'Bibs', checked: false, link: null });
      await executeTool('update_checklist_item', { id: 5, link: '' }, { userId });
      expect(updateItemMock).toHaveBeenCalledWith(5, userId, { link: null });
    });

    it('reports not_found instead of throwing when the item is missing or not the caller\'s', async () => {
      updateItemMock.mockResolvedValue(null);
      const result = await executeTool('update_checklist_item', { id: 999, checked: true }, { userId });
      expect(result).toEqual({ error: 'not_found', message: 'Checklist item not found.' });
    });

    it('requires an id', async () => {
      const result = await executeTool('update_checklist_item', { checked: true }, { userId });
      expect(result.error).toMatch(/id is required/);
      expect(updateItemMock).not.toHaveBeenCalled();
    });
  });
});
