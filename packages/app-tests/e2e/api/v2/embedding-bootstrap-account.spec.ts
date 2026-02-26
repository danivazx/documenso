import { expect, test } from '@playwright/test';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import type { TCreateEmbeddingBootstrapAccountRequestSchema } from '@documenso/trpc/server/embedding-router/create-embedding-bootstrap-account.types';
import { ZCreateEmbeddingBootstrapAccountResponseSchema } from '@documenso/trpc/server/embedding-router/create-embedding-bootstrap-account.types';

const INTERNAL_SECRET_HEADER = 'x-documenso-internal-secret';
const INTERNAL_SECRET =
  env('DOCUMENSO_EMBEDDING_BOOTSTRAP_SECRET') ?? 'documenso-embedding-bootstrap-secret';

const createUniqueTeamUrl = () => `embed-team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const createUniqueEmail = () =>
  `embed-bootstrap-${Date.now()}-${Math.floor(Math.random() * 10000)}@documenso.test`;

const createBootstrapPayload = (
  overrides: Partial<TCreateEmbeddingBootstrapAccountRequestSchema> = {},
) => {
  return {
    name: 'Embedding Bootstrap User',
    email: createUniqueEmail(),
    teamName: 'Embedding Bootstrap Team',
    teamUrl: createUniqueTeamUrl(),
    tokenName: 'Embedding API Key',
    expirationDate: null,
    ...overrides,
  } satisfies TCreateEmbeddingBootstrapAccountRequestSchema;
};

test.describe('Embedding Bootstrap API', () => {
  test('create bootstrap account: should create verified user, team and api key', async ({
    request,
  }) => {
    const payload = createBootstrapPayload();

    const response = await request.post(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2-beta/embedding/create-bootstrap-account`,
      {
        headers: {
          [INTERNAL_SECRET_HEADER]: INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        data: payload,
      },
    );

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const responseData = ZCreateEmbeddingBootstrapAccountResponseSchema.parse(
      await response.json(),
    );

    expect(responseData.userId).toBeDefined();
    expect(responseData.teamId).toBeDefined();
    expect(responseData.apiKeyId).toBeDefined();
    expect(responseData.apiKey.startsWith('api_')).toBeTruthy();

    const user = await prisma.user.findUnique({
      where: {
        id: responseData.userId,
      },
      select: {
        emailVerified: true,
      },
    });

    expect(user?.emailVerified).toBeTruthy();

    const team = await prisma.team.findUnique({
      where: {
        id: responseData.teamId,
      },
      select: {
        url: true,
      },
    });

    expect(team?.url).toBe(payload.teamUrl);

    const apiToken = await prisma.apiToken.findUnique({
      where: {
        id: responseData.apiKeyId,
      },
      select: {
        teamId: true,
      },
    });

    expect(apiToken?.teamId).toBe(responseData.teamId);
  });

  test('create bootstrap account: should reject invalid internal secret', async ({ request }) => {
    const payload = createBootstrapPayload();

    const response = await request.post(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2-beta/embedding/create-bootstrap-account`,
      {
        headers: {
          [INTERNAL_SECRET_HEADER]: 'invalid-secret',
          'Content-Type': 'application/json',
        },
        data: payload,
      },
    );

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);
  });

  test('create bootstrap account: should reject duplicate email', async ({ request }) => {
    const email = createUniqueEmail();

    const firstPayload = createBootstrapPayload({ email });
    const secondPayload = createBootstrapPayload({
      email,
      teamUrl: createUniqueTeamUrl(),
    });

    const firstResponse = await request.post(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2-beta/embedding/create-bootstrap-account`,
      {
        headers: {
          [INTERNAL_SECRET_HEADER]: INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        data: firstPayload,
      },
    );

    expect(firstResponse.ok()).toBeTruthy();
    expect(firstResponse.status()).toBe(200);

    const duplicateResponse = await request.post(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2-beta/embedding/create-bootstrap-account`,
      {
        headers: {
          [INTERNAL_SECRET_HEADER]: INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        data: secondPayload,
      },
    );

    expect(duplicateResponse.ok()).toBeFalsy();
    expect(duplicateResponse.status()).toBe(400);
  });
});
