// ============================================================================
// Legal page content — DRAFT BOILERPLATE. Standard privacy / terms copy for an
// interior-design & fit-out company operating from Dubai, UAE. It is a starting
// point: HAVE IT REVIEWED BY LEGAL COUNSEL AND REPLACE THE [BRACKETED]
// PLACEHOLDERS (registered legal entity name, licence no., registered address,
// DIFC/onshore jurisdiction) BEFORE RELYING ON IT. English only for now; other
// locales render this English text until translated copy is supplied.
// ============================================================================

export type LegalDocKind = 'privacy' | 'terms';
export const LEGAL_DOCS: LegalDocKind[] = ['privacy', 'terms'];

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

// Keep in sync with a real publication date when the copy is finalised.
const LAST_UPDATED = '3 November 2026';

type LegalContext = { companyName: string; email: string; siteUrl: string; address?: string };

export function legalDoc(kind: LegalDocKind, ctx: LegalContext): LegalDoc {
  const { companyName, email, siteUrl, address } = ctx;
  const where = address ? `${address}, Dubai, United Arab Emirates` : 'Dubai, United Arab Emirates';

  if (kind === 'privacy') {
    return {
      title: 'Privacy Policy',
      updated: LAST_UPDATED,
      intro: `This Privacy Policy explains how ${companyName} ("we", "us", "our") collects, uses and protects personal information when you use ${siteUrl} and the services offered through it. By using the site you agree to the practices described here.`,
      sections: [
        {
          heading: 'Information we collect',
          body: [
            'Information you give us: your name, email address, phone number, project details and any message you send through our contact form, quotation requests or when you create an account.',
            'Information collected automatically: your IP address, browser and device type, pages viewed and referring pages, gathered through cookies and similar technologies for analytics and to keep the site working.',
          ],
        },
        {
          heading: 'How we use your information',
          body: [
            'To respond to your enquiries, prepare and send quotations, and provide the services you request.',
            'To manage your account, where you create one, and to contact you about your projects and requests.',
            'To understand how the site is used and to improve its content, performance and security.',
            'To meet our legal and regulatory obligations.',
          ],
        },
        {
          heading: 'Cookies and analytics',
          body: [
            'We use cookies and similar technologies to operate the site and to measure usage with analytics tools (for example Google Analytics via Google Tag Manager). You can control cookies through your browser settings; disabling them may affect how parts of the site work.',
          ],
        },
        {
          heading: 'Sharing your information',
          body: [
            'We do not sell your personal information. We share it only with service providers who help us run the site and deliver our services (such as hosting, email and analytics providers), and only as needed for those purposes.',
            'We may disclose information where required by law or to protect our rights, property or safety and those of others.',
          ],
        },
        {
          heading: 'Data retention',
          body: [
            'We keep personal information only for as long as necessary for the purposes set out in this policy, including to satisfy any legal, accounting or reporting requirements.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            'Subject to applicable law, you may request access to, correction of, or deletion of your personal information, and you may object to or restrict certain processing. To make a request, contact us using the details below.',
          ],
        },
        {
          heading: 'Data security',
          body: [
            'We use reasonable technical and organisational measures to protect personal information against loss, misuse and unauthorised access. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
          ],
        },
        {
          heading: 'International transfers',
          body: [
            'Your information may be processed on servers located outside the United Arab Emirates. Where it is transferred, we take steps to ensure it remains protected in line with this policy.',
          ],
        },
        {
          heading: "Children's privacy",
          body: [
            'The site is not directed to children, and we do not knowingly collect personal information from children.',
          ],
        },
        {
          heading: 'Changes to this policy',
          body: [
            'We may update this Privacy Policy from time to time. The latest version will always be posted on this page with its effective date.',
          ],
        },
        {
          heading: 'Contact us',
          body: [
            `If you have any questions about this policy or how we handle your information, contact ${companyName} at ${email} (${where}).`,
          ],
        },
      ],
    };
  }

  return {
    title: 'Terms of Service',
    updated: LAST_UPDATED,
    intro: `These Terms of Service govern your use of ${siteUrl}, operated by ${companyName} ("we", "us", "our"). By accessing or using the site you agree to these terms. If you do not agree, please do not use the site.`,
    sections: [
      {
        heading: 'Use of the site',
        body: [
          'You may use the site for lawful purposes only. You agree not to misuse it, interfere with its operation, attempt to gain unauthorised access, or use it in any way that could damage or impair the site or others’ use of it.',
        ],
      },
      {
        heading: 'Quotations and pricing',
        body: [
          'Quotations produced or sent through the site are estimates for your convenience and are not binding offers. They are subject to confirmation by us in writing, to site survey where relevant, and to the availability of materials.',
          'We take care to describe products, materials and pricing accurately, but information on the site may contain errors and is subject to change without notice. A contract is formed only once we confirm an order in writing.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'If you create an account, you are responsible for keeping your login details confidential and for all activity under your account. Tell us promptly of any unauthorised use.',
        ],
      },
      {
        heading: 'Intellectual property',
        body: [
          `All content on the site — including text, images, portfolio project photography, designs, logos and the ${companyName} name — is owned by us or our licensors and is protected by intellectual-property laws. You may not copy, reproduce or redistribute it without our prior written permission.`,
        ],
      },
      {
        heading: 'Third-party links',
        body: [
          'The site may link to third-party websites or services. We are not responsible for their content or practices, and your use of them is at your own risk and subject to their terms.',
        ],
      },
      {
        heading: 'Disclaimers and limitation of liability',
        body: [
          'The site is provided "as is" and "as available" without warranties of any kind, whether express or implied, to the fullest extent permitted by law.',
          'To the maximum extent permitted by applicable law, we are not liable for any indirect, incidental or consequential loss arising from your use of, or inability to use, the site.',
        ],
      },
      {
        heading: 'Governing law',
        body: [
          'These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai, and the courts of Dubai have jurisdiction over any dispute, without prejudice to any mandatory consumer-protection rights.',
        ],
      },
      {
        heading: 'Changes to these terms',
        body: [
          'We may update these terms from time to time. The latest version will always be posted on this page with its effective date, and your continued use of the site means you accept the updated terms.',
        ],
      },
      {
        heading: 'Contact us',
        body: [`Questions about these terms? Contact ${companyName} at ${email} (${where}).`],
      },
    ],
  };
}
