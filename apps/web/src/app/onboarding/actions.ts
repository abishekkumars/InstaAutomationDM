'use server';

import { redirect } from 'next/navigation';
import { createOrganizationSchema } from '@automationdm/validation';
import { ApiError, callApi } from '@/lib/api';

export interface CreateOrganizationActionResult {
  error: string;
}

export async function createOrganizationAction(
  _prevState: CreateOrganizationActionResult | null,
  formData: FormData,
): Promise<CreateOrganizationActionResult | null> {
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await callApi('/api/organizations', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect('/');
}
