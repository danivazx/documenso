import { OrganisationType, WebhookTriggerEvents } from '@prisma/client';
import crypto from 'crypto';

import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { createTeam } from '@documenso/lib/server-only/team/create-team';
import { createUser } from '@documenso/lib/server-only/user/create-user';
import { createWebhook } from '@documenso/lib/server-only/webhooks/create-webhook';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

import { procedure } from '../trpc';
import {
  ZCreateEmbeddingBootstrapAccountRequestSchema,
  ZCreateEmbeddingBootstrapAccountResponseSchema,
  createEmbeddingBootstrapAccountMeta,
} from './create-embedding-bootstrap-account.types';

const EMBEDDING_BOOTSTRAP_SECRET_HEADER = 'x-documenso-internal-secret';
const EMBEDDING_BOOTSTRAP_FALLBACK_SECRET = 'documenso-embedding-bootstrap-secret';
const EMBEDDING_BOOTSTRAP_WEBHOOK_URL = 'http://localhost:4321/webhook/documenso';
const EMBEDDING_BOOTSTRAP_WEBHOOK_SECRET = 'documenso-webhook-secret';
const EMBEDDING_BOOTSTRAP_WEBHOOK_TRIGGERS = [
  WebhookTriggerEvents.DOCUMENT_SIGNED,
  WebhookTriggerEvents.DOCUMENT_COMPLETED,
  WebhookTriggerEvents.DOCUMENT_REJECTED,
];

const resolveExpectedBootstrapSecret = () => {
  const configuredSecret = env('DOCUMENSO_EMBEDDING_BOOTSTRAP_SECRET');

  if (configuredSecret) {
    return configuredSecret;
  }

  if (env('NODE_ENV') !== 'production') {
    return EMBEDDING_BOOTSTRAP_FALLBACK_SECRET;
  }

  throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
    message: 'Missing DOCUMENSO_EMBEDDING_BOOTSTRAP_SECRET env var',
  });
};

const generateSecurePassword = () => {
  const randomBytes = crypto.randomBytes(36).toString('base64url');

  return `A1!${randomBytes}`;
};

export const createEmbeddingBootstrapAccountRoute = procedure
  .meta(createEmbeddingBootstrapAccountMeta)
  .input(ZCreateEmbeddingBootstrapAccountRequestSchema)
  .output(ZCreateEmbeddingBootstrapAccountResponseSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      const internalSecret = ctx.req.headers.get(EMBEDDING_BOOTSTRAP_SECRET_HEADER);
      const expectedSecret = resolveExpectedBootstrapSecret();

      if (!internalSecret || internalSecret !== expectedSecret) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, {
          message: 'Invalid internal secret',
        });
      }

      const { name, email, signature, teamName, teamUrl, tokenName, expirationDate } = input;

      const user = await createUser({
        name,
        email,
        signature: signature ?? null,
        password: generateSecurePassword(),
      });

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          emailVerified: new Date(),
        },
      });

      const organisation = await prisma.organisation.findFirst({
        where: {
          ownerUserId: user.id,
          type: OrganisationType.PERSONAL,
        },
        select: {
          id: true,
        },
      });

      if (!organisation) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Personal organisation not found for user',
        });
      }

      await createTeam({
        userId: user.id,
        teamName,
        teamUrl,
        organisationId: organisation.id,
        inheritMembers: false,
      });

      const team = await prisma.team.findFirst({
        where: {
          url: teamUrl,
          organisationId: organisation.id,
        },
        select: {
          id: true,
        },
      });

      if (!team) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Created team not found',
        });
      }

      const apiToken = await createApiToken({
        userId: user.id,
        teamId: team.id,
        tokenName,
        expiresIn: expirationDate ?? null,
      });

      await createWebhook({
        userId: user.id,
        teamId: team.id,
        webhookUrl: EMBEDDING_BOOTSTRAP_WEBHOOK_URL,
        eventTriggers: EMBEDDING_BOOTSTRAP_WEBHOOK_TRIGGERS,
        secret: EMBEDDING_BOOTSTRAP_WEBHOOK_SECRET,
        enabled: true,
      });

      return {
        userId: user.id,
        teamId: team.id,
        apiKeyId: apiToken.id,
        apiKey: apiToken.token,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Failed to create embedding bootstrap account',
      });
    }
  });
