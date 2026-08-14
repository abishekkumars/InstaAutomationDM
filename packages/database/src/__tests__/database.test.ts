import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, prisma } from '../index';

// Full reset before each test rather than per-test cleanup: this is a throwaway local dev
// database (see docs/ADR/0003-local-postgresql-strategy.md), and a small, fixed schema at
// this phase, so a blanket reset is simpler and more reliable than tracking exactly which
// rows each test created. Deletion order respects foreign keys (members/accounts before
// their organization/user).
beforeEach(async () => {
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database connectivity', () => {
  it('can run a raw query against the configured DATABASE_URL', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result).toEqual([{ ok: 1 }]);
  });
});

describe('User', () => {
  it('creates a user with the expected fields', async () => {
    const user = await prisma.user.create({
      data: { email: 'alice@example.com', name: 'Alice' },
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('alice@example.com');
    expect(user.name).toBe('Alice');
    expect(user.authProviderId).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  // Phase 15.1. The default is what makes requirement 20 hold at the schema level: an insert
  // that says nothing about `role` cannot accidentally produce an admin, whatever the calling
  // code forgot to set.
  it('defaults a new user to the NORMAL_USER global role', async () => {
    const user = await prisma.user.create({ data: { email: 'alice@example.com' } });

    expect(user.role).toBe('NORMAL_USER');
  });

  it('stores an explicitly granted ADMIN role', async () => {
    const user = await prisma.user.create({
      data: { email: 'admin@example.com', role: 'ADMIN' },
    });

    expect(user.role).toBe('ADMIN');
  });

  it('rejects a second user with the same email', async () => {
    await prisma.user.create({ data: { email: 'dup@example.com' } });

    await expect(prisma.user.create({ data: { email: 'dup@example.com' } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});

describe('Organization', () => {
  it('creates an organization with a unique slug', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme' },
    });

    expect(org.id).toBeTruthy();
    expect(org.slug).toBe('acme');
  });

  it('rejects a second organization with the same slug', async () => {
    await prisma.organization.create({ data: { name: 'Acme Inc', slug: 'acme' } });

    await expect(
      prisma.organization.create({ data: { name: 'Acme Inc 2', slug: 'acme' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('OrganizationMember', () => {
  async function createUserAndOrg() {
    const user = await prisma.user.create({ data: { email: 'bob@example.com', name: 'Bob' } });
    const org = await prisma.organization.create({ data: { name: 'Acme Inc', slug: 'acme' } });
    return { user, org };
  }

  it('links a user to an organization with a default role of MEMBER', async () => {
    const { user, org } = await createUserAndOrg();

    const membership = await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id },
    });

    expect(membership.role).toBe('MEMBER');
  });

  it('accepts an explicit OWNER role', async () => {
    const { user, org } = await createUserAndOrg();

    const membership = await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    expect(membership.role).toBe('OWNER');
  });

  it('traverses relations in both directions', async () => {
    const { user, org } = await createUserAndOrg();
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const userWithMemberships = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: { include: { organization: true } } },
    });
    const orgWithMemberships = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { memberships: { include: { user: true } } },
    });

    expect(userWithMemberships.memberships).toHaveLength(1);
    expect(userWithMemberships.memberships[0]?.organization.slug).toBe('acme');
    expect(orgWithMemberships.memberships).toHaveLength(1);
    expect(orgWithMemberships.memberships[0]?.user.email).toBe('bob@example.com');
  });

  it('rejects adding the same user to the same organization twice', async () => {
    const { user, org } = await createUserAndOrg();
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id },
    });

    await expect(
      prisma.organizationMember.create({
        data: { organizationId: org.id, userId: user.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades delete: removing an organization removes its memberships', async () => {
    const { user, org } = await createUserAndOrg();
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id },
    });

    await prisma.organization.delete({ where: { id: org.id } });

    const remaining = await prisma.organizationMember.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });
});

describe('InstagramAccount', () => {
  async function createOrg() {
    return prisma.organization.create({ data: { name: 'Acme Inc', slug: 'acme' } });
  }

  it('creates an account with a default status of CONNECTED', async () => {
    const org = await createOrg();

    const account = await prisma.instagramAccount.create({
      data: { organizationId: org.id, zernioAccountId: 'zernio-acct-1', username: 'acme_ig' },
    });

    expect(account.status).toBe('CONNECTED');
    expect(account.username).toBe('acme_ig');
  });

  it('rejects a second account with the same Zernio account id, even under a different organization', async () => {
    const org = await createOrg();
    const otherOrg = await prisma.organization.create({
      data: { name: 'Other Co', slug: 'other-co' },
    });
    await prisma.instagramAccount.create({
      data: { organizationId: org.id, zernioAccountId: 'zernio-acct-1' },
    });

    await expect(
      prisma.instagramAccount.create({
        data: { organizationId: otherOrg.id, zernioAccountId: 'zernio-acct-1' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades delete: removing an organization removes its Instagram accounts', async () => {
    const org = await createOrg();
    await prisma.instagramAccount.create({
      data: { organizationId: org.id, zernioAccountId: 'zernio-acct-1' },
    });

    await prisma.organization.delete({ where: { id: org.id } });

    const remaining = await prisma.instagramAccount.findMany({
      where: { zernioAccountId: 'zernio-acct-1' },
    });
    expect(remaining).toHaveLength(0);
  });
});

describe('Prisma export surface', () => {
  it('re-exports the Prisma namespace for error-code checks', () => {
    expect(Prisma.PrismaClientKnownRequestError).toBeTypeOf('function');
  });
});
