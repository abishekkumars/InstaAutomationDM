import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import { TEMPLATE_LIMITS } from '@automationdm/validation';
import { AppModule } from '../../app.module';

const INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('API_INTERNAL_SECRET must be set (see .env) to run this test file.');
}

function bearerFor(user: { id: string; email: string }): string {
  return `Bearer ${signInternalServiceToken({ sub: user.id, email: user.email }, INTERNAL_SECRET as string)}`;
}

// Templates never call Zernio, so unlike the automations suite there is no fake provider to
// install - the real module graph runs as-is.
let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.automationTemplate.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

async function createOrgWithMember(email: string, slug: string) {
  const user = await prisma.user.create({ data: { email } });
  const organization = await prisma.organization.create({
    data: { name: slug, slug, memberships: { create: { userId: user.id, role: 'MEMBER' } } },
  });
  return { user, organization };
}

function base(organizationId: string): string {
  return `/api/organizations/${organizationId}/automation-templates`;
}

describe('automation templates', () => {
  it('makes the first template the default, and later ones not', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');

    const first = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', bearerFor(user))
      .send({ name: 'Price enquiry', keywords: ['price'], dmMessage: 'Here you go' })
      .expect(201);
    expect(first.body).toMatchObject({
      name: 'Price enquiry',
      isDefault: true,
      triggerType: 'keywords',
      keywords: ['price'],
      matchMode: 'contains',
      audience: 'any',
      dmMessage: 'Here you go',
      commentReply: null,
      buttons: [],
      isActive: true,
    });

    const second = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', bearerFor(user))
      .send({ name: 'Giveaway' })
      .expect(201);
    expect(second.body.isDefault).toBe(false);

    const list = await request(app.getHttpServer())
      .get(base(organization.id))
      .set('Authorization', bearerFor(user))
      .expect(200);
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(['Price enquiry', 'Giveaway']);
  });

  it('stores a name-only template with empty optional fields', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const created = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', bearerFor(user))
      .send({ name: 'Just a name', commentReply: '', dmMessage: '' })
      .expect(201);
    expect(created.body).toMatchObject({ commentReply: null, dmMessage: null, keywords: [] });
  });

  it('moves the default tag rather than adding a second one', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    const a = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'A' });
    const b = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'B' });

    const res = await request(app.getHttpServer())
      .post(`${base(organization.id)}/${b.body.id}/default`)
      .set('Authorization', auth)
      .expect(200);
    expect(res.body.isDefault).toBe(true);

    const rows = await prisma.automationTemplate.findMany({
      where: { organizationId: organization.id },
    });
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([b.body.id]);
    expect(rows.find((row) => row.id === a.body.id)?.isDefault).toBe(false);
  });

  it('hands the default to the oldest remaining template when the default is deleted', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    const a = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'A' });
    const b = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'B' });
    await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'C' });

    await request(app.getHttpServer())
      .delete(`${base(organization.id)}/${a.body.id}`)
      .set('Authorization', auth)
      .expect(204);

    const rows = await prisma.automationTemplate.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => [row.name, row.isDefault])).toEqual([
      ['B', true],
      ['C', false],
    ]);
    expect(rows[0]?.id).toBe(b.body.id);
  });

  it('leaves the default alone when a non-default template is deleted', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    const a = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'A' });
    const b = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({ name: 'B' });

    await request(app.getHttpServer())
      .delete(`${base(organization.id)}/${b.body.id}`)
      .set('Authorization', auth)
      .expect(204);

    const rows = await prisma.automationTemplate.findMany({
      where: { organizationId: organization.id },
    });
    expect(rows.map((row) => [row.id, row.isDefault])).toEqual([[a.body.id, true]]);
  });

  it('replaces every field on update and keeps the default flag', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    const created = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({
        name: 'A',
        keywords: ['price'],
        commentReply: 'Sent!',
        commentReplyVariations: ['Check DMs'],
        buttons: [{ title: 'Shop', url: 'https://example.com' }],
      });

    const updated = await request(app.getHttpServer())
      .put(`${base(organization.id)}/${created.body.id}`)
      .set('Authorization', auth)
      .send({
        name: 'Renamed',
        triggerType: 'any',
        keywords: ['ignored'],
        audience: 'follower',
        isActive: false,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Renamed',
      triggerType: 'any',
      keywords: [],
      audience: 'follower',
      commentReply: null,
      commentReplyVariations: [],
      buttons: [],
      isActive: false,
      isDefault: true,
    });
  });

  it('clones every field into a non-default "Copy of" template', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    const source = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', auth)
      .send({
        name: 'Price enquiry',
        keywords: ['price', 'cost'],
        matchMode: 'word',
        dmMessage: 'Prices below',
        buttons: [{ title: 'See prices', url: 'https://example.com/prices' }],
      });

    const copy = await request(app.getHttpServer())
      .post(`${base(organization.id)}/${source.body.id}/clone`)
      .set('Authorization', auth)
      .expect(201);
    expect(copy.body).toMatchObject({
      name: 'Copy of Price enquiry',
      isDefault: false,
      keywords: ['price', 'cost'],
      matchMode: 'word',
      dmMessage: 'Prices below',
      buttons: [{ title: 'See prices', url: 'https://example.com/prices' }],
    });
    expect(copy.body.id).not.toBe(source.body.id);
  });

  it('rejects invalid input with the validation message', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const res = await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', bearerFor(user))
      .send({ name: '  ' })
      .expect(400);
    // Nest's default error body: AllExceptionsFilter is registered in main.ts, not in this
    // testing module (same note as admin.e2e.test.ts).
    expect(res.body.message).toBe('Template name is required.');
  });

  it('refuses templates past the per-organization cap', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    await prisma.automationTemplate.createMany({
      data: Array.from({ length: TEMPLATE_LIMITS.perOrganizationMax }, (_, i) => ({
        organizationId: organization.id,
        name: `T${i}`,
        isDefault: i === 0,
      })),
    });

    await request(app.getHttpServer())
      .post(base(organization.id))
      .set('Authorization', bearerFor(user))
      .send({ name: 'One too many' })
      .expect(400);
  });

  it("keeps organizations apart: a non-member gets 404 and cannot touch another org's template", async () => {
    const owner = await createOrgWithMember('a@example.com', 'org-a');
    const outsider = await createOrgWithMember('b@example.com', 'org-b');
    const template = await request(app.getHttpServer())
      .post(base(owner.organization.id))
      .set('Authorization', bearerFor(owner.user))
      .send({ name: 'Private' });

    await request(app.getHttpServer())
      .get(base(owner.organization.id))
      .set('Authorization', bearerFor(outsider.user))
      .expect(404);

    // The outsider's own organization, but someone else's template id.
    const foreign = `${base(outsider.organization.id)}/${template.body.id}`;
    const auth = bearerFor(outsider.user);
    await request(app.getHttpServer())
      .put(foreign)
      .set('Authorization', auth)
      .send({ name: 'x' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`${foreign}/default`)
      .set('Authorization', auth)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${foreign}/clone`)
      .set('Authorization', auth)
      .expect(404);
    await request(app.getHttpServer()).delete(foreign).set('Authorization', auth).expect(404);

    const stillThere = await prisma.automationTemplate.findUnique({
      where: { id: template.body.id },
    });
    expect(stillThere).toMatchObject({ name: 'Private', isDefault: true });
  });

  it('keeps exactly one default when first templates are created concurrently', async () => {
    const { user, organization } = await createOrgWithMember('a@example.com', 'org-a');
    const auth = bearerFor(user);
    await Promise.all(
      ['A', 'B', 'C', 'D'].map((name) =>
        request(app.getHttpServer())
          .post(base(organization.id))
          .set('Authorization', auth)
          .send({ name })
          .expect(201),
      ),
    );
    const defaults = await prisma.automationTemplate.count({
      where: { organizationId: organization.id, isDefault: true },
    });
    expect(defaults).toBe(1);
  });

  it('requires authentication', async () => {
    const { organization } = await createOrgWithMember('a@example.com', 'org-a');
    await request(app.getHttpServer()).get(base(organization.id)).expect(401);
  });
});
