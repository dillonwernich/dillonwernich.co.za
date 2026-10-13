// First-run data. Written to Firestore once; from then on everything here is edited in
// the admin and this file is never read again.

const h = (amount) => ({ mode: 'hours', amount });
const r = (rands) => ({ mode: 'fixed', amount: Math.round(rands * 100) });

const opt = (id, label, price, extra = {}) => ({ id, label, clientDescription: '', price, multiplier: null, weight: 1, includes: {}, visible: true, ...extra });
const levels = (id, simple, medium, complex) => [
  opt(`${id}-s`, 'Simple', h(simple), { weight: 1 }),
  opt(`${id}-m`, 'Medium', h(medium), { weight: 2 }),
  opt(`${id}-c`, 'Complex', h(complex), { weight: 3 }),
];

function item(id, label, kind, fields = {}) {
  return {
    id, label, kind,
    description: '',
    clientDescription: '',
    price: r(0),
    options: [],
    percent: 0,
    multiplierTargets: [],
    unit: '',
    includedQty: 0,
    bands: [],
    bandMode: 'tiered',
    complexityWeight: 1,
    recurring: false,
    visible: true,
    showOnQuote: true,
    placeholder: true,
    default: null,
    ...fields,
  };
}

const feature = (id, label, clientDescription, s, m, c, weight) =>
  item(id, label, 'complexity', { clientDescription, options: levels(id, s, m, c), complexityWeight: weight });

export const SEED_HOURLY_RATE = 65000;

export function seedPricing() {
  const sections = [
    {
      id: 'project', name: 'Project type', description: 'Sets the base build and how many pages are included.', visible: true,
      items: [
        item('project-type', 'Project type', 'single-select', {
          clientDescription: 'Core build, project setup, responsive layouts and launch.',
          complexityWeight: 2,
          default: 'pt-brochure',
          options: [
            opt('pt-landing', 'Landing page', h(10), { clientDescription: 'Single-page site with one primary call to action.', includes: { pages: 1 } }),
            opt('pt-brochure', 'Brochure site', h(24), { clientDescription: 'Small informational site.', includes: { pages: 5 }, weight: 1 }),
            opt('pt-business', 'Business site', h(48), { clientDescription: 'Multi-section business website.', includes: { pages: 10 }, weight: 2 }),
            opt('pt-webapp', 'Web app', h(120), { clientDescription: 'Browser-based application with signed-in users.', weight: 4 }),
            opt('pt-android', 'Mobile app: Android', h(160), { clientDescription: 'Native Android application.', weight: 4 }),
            opt('pt-ios', 'Mobile app: iOS', h(160), { clientDescription: 'Native iOS application.', weight: 4 }),
            opt('pt-both', 'Mobile app: Android and iOS', h(260), { clientDescription: 'Android and iOS applications.', weight: 5 }),
          ],
        }),
      ],
    },
    {
      id: 'platform', name: 'Platform', description: 'Multiplies the build, pages and functionality.', visible: true,
      items: [
        item('platform', 'Platform', 'multiplier', {
          multiplierTargets: ['project', 'pages', 'functionality'],
          default: 'pl-static',
          options: [
            opt('pl-static', 'Static', r(0), { clientDescription: 'Static site, no server to maintain.', multiplier: 1 }),
            opt('pl-wordpress', 'WordPress', r(0), { clientDescription: 'WordPress with a managed theme.', multiplier: 1.15 }),
            opt('pl-custom', 'Custom (Next.js / Firebase)', r(0), { clientDescription: 'Custom stack built for this project.', multiplier: 1.35 }),
          ],
        }),
      ],
    },
    {
      id: 'pages', name: 'Pages', description: 'Pages beyond those included with the project type.', visible: true,
      items: [
        item('pages', 'Pages', 'quantity', {
          unit: 'page',
          clientDescription: 'Additional pages, designed and built to the agreed layout.',
          options: [
            opt('pg-static', 'Static page', h(3), { clientDescription: 'Fixed content page.' }),
            opt('pg-dynamic', 'Dynamic page', h(5), { clientDescription: 'Content driven by a CMS or database.' }),
            opt('pg-templated', 'Templated page', h(6), { clientDescription: 'One layout serving many records.' }),
          ],
        }),
      ],
    },
    {
      id: 'functionality', name: 'Functionality', description: 'Feature add-ons, each priced by complexity.', visible: true,
      items: [
        feature('contact-form', 'Contact form', 'Contact form with spam protection and email delivery.', 2, 4, 8, 1),
        feature('booking', 'Booking / calendar', 'Online booking with calendar availability.', 8, 16, 32, 3),
        feature('blog', 'Blog', 'Blog with categories and article pages.', 6, 12, 20, 2),
        feature('cms', 'Client-editable CMS', 'Content editing for your team without a developer.', 8, 16, 32, 3),
        feature('auth', 'User login and roles', 'Accounts, sign-in and role-based access.', 12, 24, 48, 4),
        feature('payments', 'Payments', 'Online payments through PayFast, Yoco or Stripe.', 8, 16, 32, 4),
        item('ecommerce', 'E-commerce', 'quantity', {
          unit: 'product', bandMode: 'flat', complexityWeight: 4,
          clientDescription: 'Online store with catalogue, cart and checkout.',
          bands: [
            { upTo: 25, price: h(24) },
            { upTo: 100, price: h(36) },
            { upTo: 500, price: h(56) },
            { upTo: null, price: h(80) },
          ],
        }),
        feature('search', 'Search and filtering', 'Search with filters across site content.', 6, 12, 24, 2),
        feature('maps', 'Maps', 'Embedded maps and location display.', 2, 6, 12, 1),
        feature('chat', 'Live chat', 'Live chat widget connected to your inbox.', 2, 6, 12, 1),
        feature('api', 'Third-party API integration', 'Integration with an external system.', 8, 16, 32, 3),
        feature('dashboard', 'Admin dashboard', 'Private dashboard for managing data.', 16, 32, 64, 4),
        feature('pdf', 'PDF generation', 'Generated PDF documents such as quotes or invoices.', 8, 16, 32, 3),
        feature('emails', 'Automated emails', 'Transactional emails triggered by events.', 4, 8, 16, 2),
        feature('multilingual', 'Multilingual', 'Content in more than one language.', 8, 16, 32, 3),
      ],
    },
    {
      id: 'design', name: 'Design level', description: 'Multiplies the build and pages.', visible: true,
      items: [
        item('design', 'Design level', 'multiplier', {
          multiplierTargets: ['project', 'pages'],
          default: 'ds-custom',
          options: [
            opt('ds-template', 'Template-based', r(0), { clientDescription: 'Built on a refined, proven template.', multiplier: 1 }),
            opt('ds-custom', 'Custom', r(0), { clientDescription: 'Custom design within your existing brand.', multiplier: 1.25 }),
            opt('ds-premium', 'Premium', r(0), { clientDescription: 'Brand developed from scratch, with motion design.', multiplier: 1.6 }),
          ],
        }),
      ],
    },
    {
      id: 'content', name: 'Content', description: 'Who supplies words and images.', visible: true,
      items: [
        item('content', 'Content', 'multi-select', {
          default: ['ct-client'],
          options: [
            opt('ct-client', 'Client supplies all content', r(0), { clientDescription: 'You supply final copy and imagery.' }),
            opt('ct-copy', 'Copywriting', h(6), { clientDescription: 'Website copy written for you.' }),
            opt('ct-stock', 'Stock imagery', r(1500), { clientDescription: 'Licensed stock photography.' }),
            opt('ct-shoot', 'Photoshoot coordination', r(3500), { clientDescription: 'Briefing and coordinating a photographer.' }),
          ],
        }),
      ],
    },
    {
      id: 'adjustments', name: 'Adjustments', description: 'Applied to the subtotal.', visible: true,
      items: [
        item('rush', 'Rush fee', 'percentage', { percent: 25, clientDescription: 'Priority scheduling for an accelerated timeline.' }),
        item('discount', 'Discount', 'percentage', { percent: -10, clientDescription: 'Discount.' }),
      ],
    },
    {
      id: 'recurring', name: 'Recurring', description: 'Billed monthly, totalled separately on the quote.', visible: true,
      items: [
        item('hosting', 'Hosting', 'toggle', { recurring: true, price: r(250), clientDescription: 'Managed hosting with daily backups.' }),
        item('domain', 'Domain', 'toggle', { recurring: true, price: r(20), clientDescription: 'Domain registration and renewal.' }),
        item('ssl', 'SSL certificate', 'toggle', { recurring: true, price: r(0), clientDescription: 'SSL certificate, renewed automatically.' }),
        item('retainer', 'Maintenance retainer', 'single-select', {
          recurring: true,
          clientDescription: 'Updates, security patches and support.',
          options: [
            opt('rt-essential', 'Essential', r(1300), { clientDescription: 'Includes 2 support hours a month. Further hours at R 650,00 an hour.' }),
            opt('rt-standard', 'Standard', r(3000), { clientDescription: 'Includes 5 support hours a month. Further hours at R 650,00 an hour.' }),
            opt('rt-priority', 'Priority', r(5800), { clientDescription: 'Includes 10 support hours a month with next-business-day response. Further hours at R 650,00 an hour.' }),
          ],
        }),
      ],
    },
  ];

  return {
    core: {
      hourlyRate: SEED_HOURLY_RATE,
      currency: 'ZAR',
      locale: 'en-ZA',
      vatRegistered: false,
      vatRate: 15,
      minimumFee: 650000,
    },
    sections: sections.map((s, si) => ({
      ...s,
      order: si,
      items: s.items.map((it, ii) => ({ ...it, order: ii })),
    })),
    note: 'Initial configuration with placeholder prices.',
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
        body: 'Work outside the scope described in this quote is quoted separately or billed at the hourly rate, with your approval before it starts.' },
      { id: 'tm-content', title: 'Content and approvals', defaultOn: true,
        body: 'You provide content and feedback within 5 working days of each request. Delays on your side move the timeline by the same amount.' },
      { id: 'tm-ip', title: 'Ownership', defaultOn: true,
        body: 'Ownership of the delivered work transfers to you on payment in full. Third-party software, fonts and stock assets remain under their own licences.' },
      { id: 'tm-thirdparty', title: 'Third-party costs', defaultOn: true,
        body: 'Domain, hosting, licence and subscription costs from third parties are payable by you unless listed in this quote.' },
      { id: 'tm-warranty', title: 'Warranty', defaultOn: true,
        body: 'Defects in the delivered work reported within 30 days of launch are fixed at no charge. New features and changes are not covered.' },
      { id: 'tm-cancel', title: 'Cancellation', defaultOn: false,
        body: 'If the project is cancelled, work completed to that date is invoiced at the hourly rate. Deposits are non-refundable.' },
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
      email: 'dillon.wernich@icloud.com',
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
      hoursPerWeek: 20,
      marginThreshold: 45000,
      defaultPaymentTemplateId: 'pt-50-40-10',
      maxUploadMB: 25,
    },
    appearance: { theme: 'system' },
  };
}
