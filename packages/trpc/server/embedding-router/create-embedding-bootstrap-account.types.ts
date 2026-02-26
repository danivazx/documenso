import { z } from 'zod';

import { ZTeamNameSchema, ZTeamUrlSchema } from '../team-router/schema';
import type { TrpcRouteMeta } from '../trpc';

export const createEmbeddingBootstrapAccountMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/embedding/create-bootstrap-account',
    summary: 'Create embedding bootstrap account',
    description:
      'Creates a verified account, creates a new team for that account, and returns a team API key.',
    tags: ['Embedding'],
  },
};

export const ZCreateEmbeddingBootstrapAccountRequestSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name is required' }),
  email: z.string().trim().email(),
  signature: z.string().nullable().optional(),
  teamName: ZTeamNameSchema,
  teamUrl: ZTeamUrlSchema,
  tokenName: z
    .string()
    .trim()
    .min(3, { message: 'The token name should be 3 characters or longer' }),
  expirationDate: z.string().nullable().optional(),
});

export const ZCreateEmbeddingBootstrapAccountResponseSchema = z.object({
  userId: z.number(),
  teamId: z.number(),
  apiKeyId: z.number(),
  apiKey: z.string(),
});

export type TCreateEmbeddingBootstrapAccountRequestSchema = z.infer<
  typeof ZCreateEmbeddingBootstrapAccountRequestSchema
>;

export type TCreateEmbeddingBootstrapAccountResponseSchema = z.infer<
  typeof ZCreateEmbeddingBootstrapAccountResponseSchema
>;
