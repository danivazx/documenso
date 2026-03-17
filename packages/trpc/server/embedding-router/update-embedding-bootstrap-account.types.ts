import { z } from 'zod';

import { ZSupportedLanguageCodeSchema } from '@documenso/lib/constants/i18n';

import type { TrpcRouteMeta } from '../trpc';

export const updateEmbeddingBootstrapAccountMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/embedding/update-bootstrap-account',
    summary: 'Update embedding bootstrap account',
    description: "Updates the name and/or language of an existing bootstrap account's user.",
    tags: ['Embedding'],
  },
};

export const ZUpdateEmbeddingBootstrapAccountRequestSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name is required' }).optional(),
  language: ZSupportedLanguageCodeSchema.optional(),
});

export const ZUpdateEmbeddingBootstrapAccountResponseSchema = z.object({
  userId: z.number(),
});

export type TUpdateEmbeddingBootstrapAccountRequestSchema = z.infer<
  typeof ZUpdateEmbeddingBootstrapAccountRequestSchema
>;

export type TUpdateEmbeddingBootstrapAccountResponseSchema = z.infer<
  typeof ZUpdateEmbeddingBootstrapAccountResponseSchema
>;
