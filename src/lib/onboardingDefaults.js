// The standard onboarding form an employer can start from: personal details, tax, super and
// bank, in the same shape the onboarding question builder stores. The signature the employee
// signs is added by the form itself and is not part of this list.
export const DEFAULT_ONBOARDING_QUESTIONS = [
  {
    id: 'default_address',
    label: 'Residential address',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: 'Your details',
    options: [],
    follow_up: null
  },
  {
    id: 'default_suburb',
    label: 'Suburb / Town',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_state',
    label: 'State / Territory',
    type: 'select',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'],
    follow_up: null
  },
  {
    id: 'default_postcode',
    label: 'Postcode',
    type: 'number',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null,
    validation: { digits: 4 }
  },
  {
    id: 'default_phone',
    label: 'Mobile number',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_email',
    label: 'Email address',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_dob',
    label: 'Date of birth',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_emergency_name',
    label: 'Emergency contact name',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_emergency_phone',
    label: 'Emergency contact phone',
    type: 'text',
    required: true,
    visible: true,
    page: 1,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_tfn_held',
    label: 'Do you have an Australian Tax File Number (TFN)?',
    type: 'yes_no',
    required: true,
    visible: true,
    page: 2,
    page_title: 'Tax',
    options: [],
    follow_up: { when: 'yes', fields: ['Tax File Number'] }
  },
  {
    id: 'default_tax_free',
    label: 'Do you want to claim the tax-free threshold?',
    type: 'yes_no',
    required: true,
    visible: true,
    page: 2,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_hecs',
    label: 'Do you have a HECS / HELP study debt?',
    type: 'yes_no',
    required: true,
    visible: true,
    page: 2,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_residency',
    label: 'Are you an Australian resident for tax purposes?',
    type: 'yes_no',
    required: true,
    visible: true,
    page: 2,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_super_default',
    label: 'Would you like to use the employer default super fund?',
    type: 'yes_no',
    required: true,
    visible: true,
    page: 3,
    page_title: 'Superannuation',
    options: [],
    follow_up: { when: 'no', fields: ['Fund name', 'USI', 'Member number'] }
  },
  {
    id: 'default_bank_bsb',
    label: 'Bank BSB',
    type: 'text',
    required: true,
    visible: true,
    page: 4,
    page_title: 'Bank account',
    options: [],
    follow_up: null
  },
  {
    id: 'default_bank_account',
    label: 'Account number',
    type: 'text',
    required: true,
    visible: true,
    page: 4,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_bank_holder',
    label: 'Account holder name',
    type: 'text',
    required: true,
    visible: true,
    page: 4,
    page_title: '',
    options: [],
    follow_up: null
  },
  {
    id: 'default_id_doc',
    label: 'Photo ID (passport or driver licence)',
    type: 'upload',
    required: true,
    visible: true,
    page: 5,
    page_title: 'Photo ID',
    options: [],
    follow_up: null
  },
  {
    id: 'default_visa_doc',
    label: 'Visa documents',
    type: 'upload',
    required: false,
    visible: true,
    page: 6,
    page_title: 'Visa documents',
    options: [],
    follow_up: null
  },
  {
    id: 'default_rsa_doc',
    label: 'RSA certificate',
    type: 'upload',
    required: false,
    visible: true,
    page: 7,
    page_title: 'RSA certificate',
    options: [],
    follow_up: null
  }
];