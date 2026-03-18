import { Trans } from '@lingui/react/macro';

import { Heading, Text } from '../components';

export interface TemplateDocumentRejectedProps {
  documentName: string;
  recipientName: string;
  rejectionReason?: string;
}

export function TemplateDocumentRejected({
  documentName,
  recipientName: signerName,
  rejectionReason,
}: TemplateDocumentRejectedProps) {
  return (
    <div className="mt-4">
      <Heading className="mb-4 text-center text-2xl font-semibold text-slate-800">
        <Trans>Document Rejected</Trans>
      </Heading>

      <Text className="mb-4 text-base">
        <Trans>
          {signerName} has rejected the document "{documentName}".
        </Trans>
      </Text>

      {rejectionReason && (
        <Text className="mb-4 text-base text-slate-400">
          <Trans>Reason for rejection: {rejectionReason}</Trans>
        </Text>
      )}

      <Text className="mb-2 text-base">
        <Trans>You can review this rejection from your document dashboard.</Trans>
      </Text>
    </div>
  );
}
