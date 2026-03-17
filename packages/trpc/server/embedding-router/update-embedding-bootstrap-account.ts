import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getApiTokenByToken } from '@documenso/lib/server-only/public-api/get-api-token-by-token';
import { prisma } from '@documenso/prisma';

import { procedure } from '../trpc';
import {
  ZUpdateEmbeddingBootstrapAccountRequestSchema,
  ZUpdateEmbeddingBootstrapAccountResponseSchema,
  updateEmbeddingBootstrapAccountMeta,
} from './update-embedding-bootstrap-account.types';

export const updateEmbeddingBootstrapAccountRoute = procedure
  .meta(updateEmbeddingBootstrapAccountMeta)
  .input(ZUpdateEmbeddingBootstrapAccountRequestSchema)
  .output(ZUpdateEmbeddingBootstrapAccountResponseSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      const authorizationHeader = ctx.req.headers.get('authorization');
      const [apiToken] = (authorizationHeader || '').split('Bearer ').filter((s) => s.length > 0);

      if (!apiToken) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, {
          message: 'No API token provided',
        });
      }

      const { name, language } = input;

      if (!name && !language) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'At least one of name or language must be provided',
        });
      }

      const token = await getApiTokenByToken({ token: apiToken });

      await prisma.user.update({
        where: { id: token.user.id },
        data: {
          name: name ?? undefined,
        },
      });

      const organisation = await prisma.organisation.findFirst({
        where: {
          ownerUserId: token.user.id,
        },
        select: {
          id: true,
          organisationGlobalSettingsId: true,
          teams: {
            select: {
              id: true,
              teamGlobalSettingsId: true,
            },
          },
        },
      });

      await prisma.organisationGlobalSettings.update({
        where: {
          id: organisation?.organisationGlobalSettingsId ?? '',
        },
        data: {
          documentLanguage: language,
        },
      });

      for (const team of organisation?.teams ?? []) {
        await prisma.teamGlobalSettings.update({
          where: {
            id: team.teamGlobalSettingsId ?? '',
          },
          data: {
            documentLanguage: language,
          },
        });
      }
      return { userId: token.user.id };
    } catch (error) {
      console.error(error);
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Failed to update embedding bootstrap account',
      });
    }
  });
