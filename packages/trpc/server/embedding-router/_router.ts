import { router } from '../trpc';
import { createEmbeddingBootstrapAccountRoute } from './create-embedding-bootstrap-account';
import { createEmbeddingDocumentRoute } from './create-embedding-document';
import { createEmbeddingPresignTokenRoute } from './create-embedding-presign-token';
import { createEmbeddingTemplateRoute } from './create-embedding-template';
import { getMultiSignDocumentRoute } from './get-multi-sign-document';
import { updateEmbeddingDocumentRoute } from './update-embedding-document';
import { updateEmbeddingTemplateRoute } from './update-embedding-template';
import { verifyEmbeddingPresignTokenRoute } from './verify-embedding-presign-token';

export const embeddingPresignRouter = router({
  createEmbeddingBootstrapAccount: createEmbeddingBootstrapAccountRoute,
  createEmbeddingPresignToken: createEmbeddingPresignTokenRoute,
  verifyEmbeddingPresignToken: verifyEmbeddingPresignTokenRoute,
  createEmbeddingDocument: createEmbeddingDocumentRoute,
  createEmbeddingTemplate: createEmbeddingTemplateRoute,
  updateEmbeddingDocument: updateEmbeddingDocumentRoute,
  updateEmbeddingTemplate: updateEmbeddingTemplateRoute,
  // applyMultiSignSignature: applyMultiSignSignatureRoute,
  getMultiSignDocument: getMultiSignDocumentRoute,
});
