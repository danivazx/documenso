import { createElement } from 'react';

import { msg } from '@lingui/core/macro';
import {
  DocumentSource,
  DocumentStatus,
  EnvelopeType,
  OrganisationType,
  RecipientRole,
  SendStatus,
} from '@prisma/client';

import { mailer } from '@documenso/email/mailer';
import DocumentInviteEmailTemplate from '@documenso/email/templates/document-invite';
import { isRecipientEmailValidForSending } from '@documenso/lib/utils/recipients';
import { prisma } from '@documenso/prisma';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import {
  RECIPIENT_ROLES_DESCRIPTION,
  RECIPIENT_ROLE_TO_EMAIL_TYPE,
} from '../../../constants/recipient-roles';
import { getEmailContext } from '../../../server-only/email/get-email-context';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../../types/document-audit-logs';
import { extractDerivedDocumentEmailSettings } from '../../../types/document-email';
import { createDocumentAuditLogData } from '../../../utils/document-audit-logs';
import { unsafeBuildEnvelopeIdQuery } from '../../../utils/envelope';
import { renderCustomEmailTemplate } from '../../../utils/render-custom-email-template';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendSigningEmailJobDefinition } from './send-signing-email';

export const run = async ({
  payload,
  io,
}: {
  payload: TSendSigningEmailJobDefinition;
  io: JobRunIO;
}) => {
  const { userId, documentId, recipientId, requestMetadata } = payload;

  const _start = Date.now();
  const elapsed = () => `${Date.now() - _start}ms`;

  console.log('[send-signing-email] start', { userId, documentId, recipientId });

  const [user, envelope, recipient] = await Promise.all([
    prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    }),
    prisma.envelope.findFirstOrThrow({
      where: {
        ...unsafeBuildEnvelopeIdQuery(
          {
            type: 'documentId',
            id: documentId,
          },
          EnvelopeType.DOCUMENT,
        ),
        status: DocumentStatus.PENDING,
      },
      include: {
        documentMeta: true,
        team: {
          select: {
            teamEmail: true,
            name: true,
          },
        },
      },
    }),
    prisma.recipient.findFirstOrThrow({
      where: {
        id: recipientId,
      },
    }),
  ]);

  console.log('[send-signing-email] db queries done', {
    elapsed: elapsed(),
    envelopeId: envelope.id,
    recipientRole: recipient.role,
  });

  const { documentMeta, team } = envelope;

  if (recipient.role === RecipientRole.CC) {
    return;
  }

  const isRecipientSigningRequestEmailEnabled = extractDerivedDocumentEmailSettings(
    envelope.documentMeta,
  ).recipientSigningRequest;

  if (!isRecipientSigningRequestEmailEnabled) {
    return;
  }

  console.log('[send-signing-email] fetching email context', { elapsed: elapsed() });

  const { branding, emailLanguage, settings, organisationType, senderEmail, replyToEmail } =
    await getEmailContext({
      emailType: 'RECIPIENT',
      source: {
        type: 'team',
        teamId: envelope.teamId,
      },
      meta: envelope.documentMeta,
    });

  console.log('[send-signing-email] email context ready', {
    elapsed: elapsed(),
    emailLanguage,
    organisationType,
  });

  const customEmail = envelope?.documentMeta;
  const isDirectTemplate = envelope.source === DocumentSource.TEMPLATE_DIRECT_LINK;

  const recipientEmailType = RECIPIENT_ROLE_TO_EMAIL_TYPE[recipient.role];

  const { email, name } = recipient;
  const selfSigner = email === user.email;

  const i18n = await getI18nInstance(emailLanguage);

  const recipientActionVerb = i18n
    ._(RECIPIENT_ROLES_DESCRIPTION[recipient.role].actionVerb)
    .toLowerCase();

  let emailMessage = customEmail?.message || '';
  let emailSubject = i18n._(msg`Please ${recipientActionVerb} this document`);

  if (selfSigner) {
    emailMessage = i18n._(
      msg`You have initiated the document ${`"${envelope.title}"`} that requires you to ${recipientActionVerb} it.`,
    );
    emailSubject = i18n._(msg`Please ${recipientActionVerb} your document`);
  }

  if (isDirectTemplate) {
    emailMessage = i18n._(
      msg`A document was created by your direct template that requires you to ${recipientActionVerb} it.`,
    );
    emailSubject = i18n._(
      msg`Please ${recipientActionVerb} this document created by your direct template`,
    );
  }

  if (organisationType === OrganisationType.ORGANISATION) {
    emailSubject = i18n._(msg`${team.name} invited you to ${recipientActionVerb} a document`);
    emailMessage = customEmail?.message ?? '';

    if (!emailMessage) {
      const inviterName = user.name || '';

      emailMessage = i18n._(
        settings.includeSenderDetails
          ? msg`${inviterName} on behalf of "${team.name}" has invited you to ${recipientActionVerb} the document "${envelope.title}".`
          : msg`${team.name} has invited you to ${recipientActionVerb} the document "${envelope.title}".`,
      );
    }
  }

  const customEmailTemplate = {
    'signer.name': name,
    'signer.email': email,
    'document.name': envelope.title,
  };

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';
  const signDocumentLink = `${NEXT_PUBLIC_WEBAPP_URL()}/sign/${recipient.token}`;

  const template = createElement(DocumentInviteEmailTemplate, {
    documentName: envelope.title,
    inviterName: user.name || undefined,
    inviterEmail:
      organisationType === OrganisationType.ORGANISATION
        ? team?.teamEmail?.email || user.email
        : user.email,
    assetBaseUrl,
    signDocumentLink,
    customBody: renderCustomEmailTemplate(emailMessage, customEmailTemplate),
    role: recipient.role,
    selfSigner,
    organisationType,
    teamName: team?.name,
    teamEmail: team?.teamEmail?.email,
    includeSenderDetails: settings.includeSenderDetails,
  });

  if (isRecipientEmailValidForSending(recipient)) {
    console.log('[send-signing-email] sending email', { elapsed: elapsed(), to: recipient.email });

    await io.runTask('send-signing-email', async () => {
      console.log('[send-signing-email] rendering email', { elapsed: elapsed() });

      const [html, text] = await Promise.all([
        renderEmailWithI18N(template, { lang: emailLanguage, branding }),
        renderEmailWithI18N(template, {
          lang: emailLanguage,
          branding,
          plainText: true,
        }),
      ]);

      console.log('[send-signing-email] email rendered, calling mailer', { elapsed: elapsed() });

      await mailer.sendMail({
        to: {
          name: recipient.name,
          address: recipient.email,
        },
        from: senderEmail,
        replyTo: replyToEmail,
        subject: renderCustomEmailTemplate(
          documentMeta?.subject || emailSubject,
          customEmailTemplate,
        ),
        html,
        text,
      });

      console.log('[send-signing-email] mailer done', { elapsed: elapsed() });
    });
  } else {
    console.log('[send-signing-email] skipping email (invalid for sending)', {
      elapsed: elapsed(),
      recipientId: recipient.id,
    });
  }

  console.log('[send-signing-email] updating recipient send status', { elapsed: elapsed() });

  await io.runTask('update-recipient', async () => {
    await prisma.recipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        sendStatus: SendStatus.SENT,
      },
    });
  });

  console.log('[send-signing-email] storing audit log', { elapsed: elapsed() });

  await io.runTask('store-audit-log', async () => {
    await prisma.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
        envelopeId: envelope.id,
        user,
        requestMetadata,
        data: {
          emailType: recipientEmailType,
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          recipientRole: recipient.role,
          isResending: false,
        },
      }),
    });
  });

  console.log('[send-signing-email] done', { elapsed: elapsed() });
};
