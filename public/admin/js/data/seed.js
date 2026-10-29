// First-run data, written to Firestore once and then edited in the admin. The pricing
// defaults are also what Pricing → Reset to defaults puts back.

const r = (rands) => Math.round(rands * 100);

const opt = (id, label, price, extra = {}) => ({ id, label, clientDescription: '', price, includes: {}, visible: true, ...extra });

function item(id, label, kind, fields = {}) {
  return {
    id, label, kind,
    clientDescription: '',
    price: 0,
    options: [],
    percent: 0,
    unit: '',
    includedQty: 0,
    recurring: false,
    visible: true,
    showOnQuote: true,
    default: null,
    ...fields,
  };
}

const fixed = (id, label, rands, clientDescription, extra = {}) => item(id, label, 'toggle', { price: r(rands), clientDescription, ...extra });

export function seedPricing() {
  const sections = [
    {
      id: 'project', name: 'Project', description: 'The base build. Each option includes a number of pages.', visible: true,
      items: [
        item('project-type', 'Project type', 'single-select', {
          clientDescription: 'Design, build, responsive layouts, testing and launch.',
          default: 'pt-brochure',
          options: [
            opt('pt-landing', 'Landing page', r(6500), { clientDescription: 'Single-page site with one clear call to action.', includes: { pages: 1 } }),
            opt('pt-brochure', 'Brochure site', r(12500), { clientDescription: 'Informational site for a small business. Five pages included.', includes: { pages: 5 } }),
            opt('pt-business', 'Business site', r(22000), { clientDescription: 'Multi-section business website. Ten pages included.', includes: { pages: 10 } }),
            opt('pt-store', 'Online store', r(35000), { clientDescription: 'Online store with catalogue, cart, checkout and order management.', includes: { pages: 8 } }),
            opt('pt-webapp', 'Web app', r(55000), { clientDescription: 'Browser-based application with signed-in users.' }),
            opt('pt-android', 'Mobile app: Android', r(65000), { clientDescription: 'Native Android application.' }),
            opt('pt-ios', 'Mobile app: iOS', r(65000), { clientDescription: 'Native iOS application.' }),
            opt('pt-both', 'Mobile app: Android and iOS', r(95000), { clientDescription: 'Android and iOS applications.' }),
          ],
        }),
        item('pages', 'Additional pages', 'quantity', {
          unit: 'page', price: r(1200),
          clientDescription: 'Pages beyond those included with the project.',
        }),
      ],
    },
    {
      id: 'design', name: 'Design', description: 'How much of the look is made from scratch.', visible: true,
      items: [
        item('design', 'Design', 'single-select', {
          default: 'ds-custom',
          options: [
            opt('ds-template', 'Template-based', 0, { clientDescription: 'Built on a refined, proven layout.' }),
            opt('ds-custom', 'Custom design', r(6500), { clientDescription: 'Custom design within your existing brand.' }),
            opt('ds-brand', 'Brand and design from scratch', r(15000), { clientDescription: 'Logo, colours, type and a custom design.' }),
          ],
        }),
      ],
    },
    {
      id: 'features', name: 'Features', description: 'Add-ons, each a fixed price.', visible: true,
      items: [
        fixed('contact-form', 'Contact form', 1500, 'Contact form with spam protection and email delivery.'),
        fixed('booking', 'Booking / calendar', 6500, 'Online booking with calendar availability.'),
        fixed('blog', 'Blog', 4500, 'Blog with categories and article pages.'),
        fixed('cms', 'Client-editable content', 6000, 'Edit your own content without a developer.'),
        fixed('auth', 'User accounts', 9500, 'Sign-up, sign-in and role-based access.'),
        fixed('payments', 'Online payments', 7500, 'Card and EFT payments through PayFast, Yoco or Stripe.'),
        fixed('search', 'Search and filtering', 4000, 'Search with filters across site content.'),
        fixed('maps', 'Maps', 1000, 'Embedded maps and directions.'),
        fixed('chat', 'Live chat', 1500, 'Live chat widget connected to your inbox.'),
        fixed('api', 'Third-party integration', 8000, 'Integration with an external system or API.'),
        fixed('dashboard', 'Admin dashboard', 15000, 'Private dashboard for managing your data.'),
        fixed('pdf', 'PDF generation', 6500, 'Generated documents such as quotes or invoices.'),
        fixed('emails', 'Automated emails', 3500, 'Emails triggered by events, such as confirmations.'),
        fixed('multilingual', 'Multilingual', 7500, 'Content in more than one language.'),
      ],
    },
    {
      id: 'content', name: 'Content', description: 'Words, images and products.', visible: true,
      items: [
        item('copywriting', 'Copywriting', 'quantity', { unit: 'page', price: r(850), clientDescription: 'Website copy written for you.' }),
        item('products', 'Product loading', 'quantity', { unit: 'product', price: r(120), clientDescription: 'Products loaded with images, descriptions and pricing.' }),
        fixed('stock', 'Stock imagery', 1500, 'Licensed stock photography.'),
        fixed('photoshoot', 'Photoshoot coordination', 3500, 'Briefing and coordinating a photographer.'),
      ],
    },
    {
      id: 'adjustments', name: 'Adjustments', description: 'Applied to the once-off subtotal.', visible: true,
      items: [
        item('discount', 'Discount', 'percentage', { percent: -10, clientDescription: 'Discount.' }),
        item('rush', 'Rush fee', 'percentage', { percent: 25, clientDescription: 'Priority scheduling for a shorter timeline.' }),
      ],
    },
    {
      id: 'monthly', name: 'Monthly', description: 'Billed monthly from launch. Maintenance is the only hourly item.', visible: true,
      items: [
        fixed('hosting', 'Hosting', 250, 'Managed hosting with backups and SSL.', { recurring: true }),
        fixed('domain', 'Domain', 25, 'Domain registration and renewal.', { recurring: true }),
        item('maintenance', 'Maintenance and support', 'quantity', {
          unit: 'hour', price: r(650), recurring: true,
          clientDescription: 'Updates, fixes and support, billed by the hour.',
        }),
      ],
    },
  ];

  return {
    core: {
      currency: 'ZAR',
      locale: 'en-ZA',
      vatRegistered: false,
      vatRate: 15,
    },
    sections: sections.map((s, si) => ({
      ...s,
      order: si,
      items: s.items.map((it, ii) => ({ ...it, order: ii })),
    })),
    note: 'Default pricing.',
  };
}

const list = (items) => items.map((x, i) => ({ visible: true, ...x, order: i }));

export function seedLibraries() {
  return {
    statuses: list([
      { id: 'st-draft', label: 'Draft', role: 'draft' },
      { id: 'st-sent', label: 'Sent', role: 'sent' },
      { id: 'st-accepted', label: 'Accepted', role: 'accepted' },
      { id: 'st-declined', label: 'Declined', role: 'declined' },
      { id: 'st-expired', label: 'Expired', role: 'expired' },
      { id: 'st-superseded', label: 'Superseded', role: 'superseded' },
    ]),
    paymentTemplates: list([
      { id: 'pt-50-40-10', label: '50 / 40 / 10', milestones: [
        { label: 'Deposit on acceptance', percent: 50 },
        { label: 'On approval of the build for launch', percent: 40 },
        { label: '14 days after launch', percent: 10 },
      ] },
      { id: 'pt-50-50', label: '50 / 50', milestones: [
        { label: 'Deposit on acceptance', percent: 50 },
        { label: 'On launch', percent: 50 },
      ] },
      { id: 'pt-40-30-30', label: '40 / 30 / 30', milestones: [
        { label: 'Deposit on acceptance', percent: 40 },
        { label: 'On design sign-off', percent: 30 },
        { label: 'On launch', percent: 30 },
      ] },
      { id: 'pt-upfront', label: 'Paid upfront', milestones: [
        { label: 'On acceptance', percent: 100 },
      ] },
    ]),
    terms: list([
      { id: 'tm-validity', title: 'Validity', defaultOn: true,
        body: 'This quote is valid until the date shown above. After that date pricing and availability may change.' },
      { id: 'tm-deposit', title: 'Deposit and scheduling', defaultOn: true,
        body: 'Work is scheduled once the signed quote and the deposit have been received. The timeline runs from that date.' },
      { id: 'tm-payment', title: 'Payment', defaultOn: true,
        body: 'Invoices are payable by EFT within 7 days of issue. Work may be paused on overdue invoices.' },
      { id: 'tm-scope', title: 'Changes to scope', defaultOn: true,
        body: 'Work outside the scope described in this quote is quoted separately and approved by you before it starts.' },
      { id: 'tm-content', title: 'Content and approvals', defaultOn: true,
        body: 'You provide content and feedback within 5 working days of each request. Delays on your side move the timeline by the same amount.' },
      { id: 'tm-ip', title: 'Ownership', defaultOn: true,
        body: 'Ownership of the delivered work transfers to you on payment in full. Third-party software, fonts and stock assets remain under their own licences.' },
      { id: 'tm-thirdparty', title: 'Third-party costs', defaultOn: true,
        body: 'Domain, hosting, licence and subscription costs from third parties are payable by you unless listed in this quote.' },
      { id: 'tm-warranty', title: 'Warranty', defaultOn: true,
        body: 'Defects in the delivered work reported within 30 days of launch are fixed at no charge. New features and changes are not covered.' },
      { id: 'tm-cancel', title: 'Cancellation', defaultOn: false,
        body: 'If the project is cancelled, work completed to that date is invoiced in proportion to the agreed price. Deposits are non-refundable.' },
      { id: 'tm-popia', title: 'Personal information', defaultOn: true,
        body: 'Personal information shared for this project is processed only to deliver it, in line with the Protection of Personal Information Act.' },
      { id: 'tm-law', title: 'Governing law', defaultOn: false,
        body: 'This agreement is governed by the laws of the Republic of South Africa.' },
    ]),
    scopeTemplates: list([
      { id: 'sc-i-responsive', kind: 'included', text: 'Responsive layouts for mobile, tablet and desktop.', defaultOn: true },
      { id: 'sc-i-seo', kind: 'included', text: 'Technical SEO set-up: page titles, descriptions, sitemap and Search Console.', defaultOn: true },
      { id: 'sc-i-analytics', kind: 'included', text: 'Privacy-friendly analytics.', defaultOn: false },
      { id: 'sc-i-handover', kind: 'included', text: 'Handover session and written guide.', defaultOn: true },
      { id: 'sc-i-revisions', kind: 'included', text: 'Two rounds of design revisions.', defaultOn: true },
      { id: 'sc-e-content', kind: 'excluded', text: 'Copywriting and photography unless listed above.', defaultOn: true },
      { id: 'sc-e-ads', kind: 'excluded', text: 'Paid advertising and ongoing SEO campaigns.', defaultOn: true },
      { id: 'sc-e-thirdparty', kind: 'excluded', text: 'Third-party licence and subscription fees.', defaultOn: true },
      { id: 'sc-a-content', kind: 'assumptions', text: 'Final content is supplied before development starts.', defaultOn: true },
      { id: 'sc-a-contact', kind: 'assumptions', text: 'One point of contact gives consolidated feedback.', defaultOn: true },
      { id: 'sc-a-brand', kind: 'assumptions', text: 'Existing logo and brand colours are used.', defaultOn: false },
    ]),
    tags: list([
      { id: 'tg-retainer', label: 'Retainer' },
      { id: 'tg-priority', label: 'Priority' },
      { id: 'tg-nonprofit', label: 'Non-profit' },
      { id: 'tg-agency', label: 'Agency' },
    ]),
    sources: list([
      { id: 'sr-referral', label: 'Referral' },
      { id: 'sr-linkedin', label: 'LinkedIn' },
      { id: 'sr-website', label: 'Website contact form' },
      { id: 'sr-returning', label: 'Returning client' },
      { id: 'sr-search', label: 'Google search' },
    ]),
    clientFields: list([
      { id: 'cf-regno', label: 'Company registration no.', type: 'text', options: [] },
    ]),
  };
}

export function seedSettings() {
  return {
    business: {
      name: 'Dillon Wernich',
      tradingName: '',
      address: 'Durban\nKwaZulu-Natal',
      email: 'dillon.wernich@gmail.com',
      phone: '+27 73 816 7717',
      website: 'dillonwernich.co.za',
      vatNumber: '',
      registrationNumber: '',
      bank: { bankName: '', accountName: '', accountNumber: '', branchCode: '', accountType: '' },
      logoPath: null,
      logoUrl: null,
    },
    quoteDefaults: {
      numberPattern: 'DW-{YYYY}-{0001}',
      validityDays: 30,
      defaultPaymentTemplateId: 'pt-50-40-10',
      maxUploadMB: 25,
    },
    appearance: { theme: 'system' },
  };
}
