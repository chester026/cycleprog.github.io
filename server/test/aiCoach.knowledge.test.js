// The coach's search_knowledge tool and its system-prompt rule, with
// services/coachKnowledge.js stubbed (property stub before aiCoach.js is
// required — the convention of test/aiCoach.memory.test.js).
const coachKnowledge = require('../services/coachKnowledge');
const searchMock = vi.fn();
coachKnowledge.search = searchMock;

const coachNotesRepo = require('../repositories/coachNotes');
coachNotesRepo.listNotes = vi.fn().mockResolvedValue([]);
const ouraRepo = require('../repositories/oura');
ouraRepo.getOuraConnectionStatus = vi.fn().mockResolvedValue(null);
const racePlansService = require('../services/racePlans');
racePlansService.routesPromptSection = vi.fn().mockResolvedValue('');
require('./stubGarminCoachHealth');

const createCoachModule = require('../aiCoach');

describe('aiCoach search_knowledge', () => {
  const coach = createCoachModule({
    pool: { query: vi.fn() },
    activitiesCache: { get: vi.fn() },
    bikesCache: { get: vi.fn() },
    getBikeComponents: () => [],
  });

  beforeEach(() => {
    searchMock.mockReset();
  });

  it('is offered to the model with the knowledge sections as the section filter', () => {
    const tool = coach.TOOLS.find((t) => t.function.name === 'search_knowledge');
    expect(tool.function.parameters.required).toEqual(['query']);
    expect(tool.function.parameters.properties.section.enum).toEqual(coachKnowledge.SECTIONS);
  });

  it('returns the cards the search found', async () => {
    searchMock.mockResolvedValue([{ id: 'nut-12-caffeine', title: 'Caffeine', evidence: 'A' }]);
    const result = await coach.executeTool('search_knowledge', { query: ' caffeine before a race ', section: 'nutrition', k: 2 }, { userId: 1 });
    expect(searchMock).toHaveBeenCalledWith({ query: 'caffeine before a race', section: 'nutrition', k: 2 });
    expect(result).toEqual({ cards: [{ id: 'nut-12-caffeine', title: 'Caffeine', evidence: 'A' }] });
  });

  it('asks for a query instead of searching for nothing', async () => {
    const result = await coach.executeTool('search_knowledge', { query: '  ' }, { userId: 1 });
    expect(result.error).toMatch(/query is required/);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('sends a Russian query back for translation instead of searching with it', async () => {
    const result = await coach.executeTool('search_knowledge', { query: 'сколько углеводов в час' }, { userId: 1 });
    expect(result.error).toMatch(/must be in English/);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('a failed search does not fail the turn: the model is told to answer without the base', async () => {
    searchMock.mockRejectedValue(new Error('relation "coach_knowledge" does not exist'));
    const result = await coach.executeTool('search_knowledge', { query: 'taper length' }, { userId: 1 });
    expect(result.error).toBe('knowledge_unavailable');
    expect(result.message).toMatch(/do not mention this to the rider/);
  });

  it('the system prompt says when to search, to query in English and to answer in the rider\'s language', async () => {
    const prompt = await coach.buildSystemPrompt(undefined, 1);
    expect(prompt).toContain('## Knowledge base');
    expect(prompt).toMatch(/Search BEFORE you state a general fact/);
    expect(prompt).toMatch(/The query is always in English/);
    expect(prompt).toMatch(/in the language the rider is writing in/);
    expect(prompt).toMatch(/Never say LOW\/MID\/HIGH to the rider/);
  });
});
