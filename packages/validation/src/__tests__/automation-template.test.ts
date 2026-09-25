import { describe, expect, it } from 'vitest';
import { AUTOMATION_LIMITS } from '../automation';
import { TEMPLATE_LIMITS, automationTemplateSchema } from '../automation-template';

describe('automationTemplateSchema', () => {
  it('accepts a template that is only a name, filling every other field with its default', () => {
    expect(automationTemplateSchema.parse({ name: '  Price enquiry  ' })).toEqual({
      name: 'Price enquiry',
      triggerType: 'keywords',
      keywords: [],
      matchMode: 'contains',
      audience: 'any',
      commentReply: undefined,
      commentReplyVariations: [],
      dmMessage: undefined,
      buttons: [],
      isActive: true,
    });
  });

  it('requires a name', () => {
    expect(automationTemplateSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(automationTemplateSchema.safeParse({}).success).toBe(false);
  });

  it('caps the name at the template limit', () => {
    const name = 'x'.repeat(TEMPLATE_LIMITS.nameMax + 1);
    expect(automationTemplateSchema.safeParse({ name }).success).toBe(false);
  });

  it('turns blank optional text into undefined, so an empty field is not stored as ""', () => {
    const parsed = automationTemplateSchema.parse({ name: 'T', commentReply: '  ', dmMessage: '' });
    expect(parsed.commentReply).toBeUndefined();
    expect(parsed.dmMessage).toBeUndefined();
  });

  it('drops keywords on the "any comments" trigger', () => {
    const parsed = automationTemplateSchema.parse({
      name: 'T',
      triggerType: 'any',
      keywords: ['price'],
    });
    expect(parsed.keywords).toEqual([]);
  });

  it('keeps an empty keyword list on the keyword trigger, since a template may be incomplete', () => {
    const parsed = automationTemplateSchema.parse({ name: 'T', triggerType: 'keywords' });
    expect(parsed.triggerType).toBe('keywords');
    expect(parsed.keywords).toEqual([]);
  });

  it('applies the 640-character DM limit once a button is attached', () => {
    const button = { title: 'Shop', url: 'https://example.com' };
    const long = 'x'.repeat(AUTOMATION_LIMITS.dmMessageWithButtonsMax + 1);
    expect(
      automationTemplateSchema.safeParse({ name: 'T', dmMessage: long, buttons: [button] }).success,
    ).toBe(false);
    expect(automationTemplateSchema.safeParse({ name: 'T', dmMessage: long }).success).toBe(true);
    // No DM at all is fine with buttons - the popup fills it in.
    expect(automationTemplateSchema.safeParse({ name: 'T', buttons: [button] }).success).toBe(true);
  });

  it('rejects alternate replies without a primary reply', () => {
    expect(
      automationTemplateSchema.safeParse({ name: 'T', commentReplyVariations: ['Check DMs'] })
        .success,
    ).toBe(false);
    expect(
      automationTemplateSchema.safeParse({
        name: 'T',
        commentReply: 'Sent!',
        commentReplyVariations: ['Check DMs'],
      }).success,
    ).toBe(true);
  });

  it('enforces the shared button and alternate-reply counts', () => {
    const button = { title: 'Shop', url: 'https://example.com' };
    expect(
      automationTemplateSchema.safeParse({
        name: 'T',
        buttons: Array.from({ length: AUTOMATION_LIMITS.buttonsMax + 1 }, () => button),
      }).success,
    ).toBe(false);
    expect(
      automationTemplateSchema.safeParse({
        name: 'T',
        commentReply: 'Sent!',
        commentReplyVariations: Array.from(
          { length: AUTOMATION_LIMITS.commentReplyVariationsMax + 1 },
          (_, i) => `Reply ${i}`,
        ),
      }).success,
    ).toBe(false);
  });

  it('validates button links', () => {
    expect(
      automationTemplateSchema.safeParse({
        name: 'T',
        buttons: [{ title: 'Shop', url: 'not a url' }],
      }).success,
    ).toBe(false);
  });
});
