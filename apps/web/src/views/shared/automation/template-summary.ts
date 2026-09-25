import type { AutomationTemplate } from '@/app/templates/templates-data';

// Plain-text summaries of a template for the list rows and cards (Phase 19). Pure functions, so
// the desktop and mobile Templates pages describe a template in exactly the same words.

const AUDIENCE_LABELS: Record<AutomationTemplate['audience'], string> = {
  any: 'Everyone',
  follower: 'Followers only',
  non_follower: 'Non-followers',
};

export function audienceLabel(template: AutomationTemplate): string {
  return AUDIENCE_LABELS[template.audience];
}

/** "Everyone · Public reply +1 · 1 button", plus "Starts paused" when that applies. */
export function templateMetaLine(template: AutomationTemplate): string {
  const parts = [audienceLabel(template)];
  if (template.commentReply) {
    const alternates = template.commentReplyVariations.length;
    parts.push(alternates > 0 ? `Public reply +${alternates}` : 'Public reply');
  } else {
    parts.push('No public reply');
  }
  if (template.buttons.length > 0) {
    parts.push(`${template.buttons.length} button${template.buttons.length > 1 ? 's' : ''}`);
  }
  if (!template.isActive) {
    parts.push('Starts paused');
  }
  return parts.join(' · ');
}

/** The template that becomes the default if `template` is deleted: the oldest other one. The
 * list arrives oldest first, which is the same order apps/api picks the successor in. */
export function successorName(
  templates: AutomationTemplate[],
  template: AutomationTemplate,
): string | null {
  return templates.find((other) => other.id !== template.id)?.name ?? null;
}
