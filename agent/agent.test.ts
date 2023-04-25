import { Plugin } from '@/types/agent';

import { parseResultForNotConversational } from './agent';

import { describe, expect, it } from 'vitest';

describe('parseResultForNotConversational', () => {
  const tools: Plugin[] = [
    {
      nameForModel: 'tool1',
      descriptionForModel: 'tool1 description',
      descriptionForHuman: 'tool1 description',
      nameForHuman: 'tool1',
      displayForUser: true,
    },
    {
      nameForModel: 'tool2',
      descriptionForModel: 'tool2 description',
      descriptionForHuman: 'tool2 description',
      nameForHuman: 'tool2',
      displayForUser: true,
    },
  ];

  it('should parse action result correctly', () => {
    const result = `Some thought
Action: tool1
Action Input: "input"`;
    expect(parseResultForNotConversational(tools, result)).toEqual({
      type: 'action',
      thought: 'Some thought',
      plugin: {
        nameForModel: 'tool1',
        descriptionForModel: 'tool1 description',
        descriptionForHuman: 'tool1 description',
        nameForHuman: 'tool1',
        displayForUser: true,
        logoUrl: undefined,
      },
      pluginInput: 'input',
    });
  });

  it('should parse answer result correctly', () => {
    const result = 'Final Answer: some answer';
    expect(parseResultForNotConversational(tools, result)).toEqual({
      type: 'answer',
      answer: 'some answer',
    });
  });

  it('should throw an error if tool is not found', () => {
    const result = `Some thought
Action: nonExistingTool
Action Input: 'input'`;
    expect(() => parseResultForNotConversational(tools, result)).toThrow();
  });
  it('should return an answer even if tool is not found', () => {
    const result = `Some thought
Action: nonExistingTool
Action Input: 'input'
Final Answer: some answer`;
    expect(parseResultForNotConversational(tools, result)).toEqual({
      type: 'answer',
      answer: 'some answer',
    });
  });
});
