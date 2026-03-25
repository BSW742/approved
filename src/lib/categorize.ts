// Transaction categorization engine matching the report output categories

export const CATEGORIES = {
  // Income categories
  SALARY: 'Salary',
  GOVERNMENT_SUPPORT: 'Government support',
  OTHER_MONEY_IN: 'Other money in',

  // Spending categories (matching exact report output)
  ATM_WITHDRAWALS: 'ATM withdrawals',
  ACCOMMODATION: 'Accommodation costs',
  CHILD_SUPPORT: 'Child support',
  CHILDCARE_EDUCATION: 'Childcare & education',
  CLOTHING_PERSONAL: 'Clothing, shoes & personal care',
  DEBT_REPAYMENTS: 'Debt repayments',
  DONATIONS: 'Donations',
  ENTERTAINMENT: 'Entertainment',
  FINANCIAL_SERVICES: 'Financial services',
  FOOD: 'Food',
  GOVT_PROFESSIONAL: 'Government and professional services',
  HOUSEHOLD: 'Household',
  INSURANCE: 'Insurance',
  MEDICAL: 'Medical costs',
  RATES: 'Rates',
  TITHING: 'Tithing',
  TRANSPORT: 'Transport',
  UNCATEGORISED: 'Uncategorised',
  UTILITIES: 'Utilities',

  // Key indicators
  GAMBLING: 'Gambling and gaming',
  FEES: 'Fees',
  HIGH_VALUE_IN: 'High value money in (>50k)',
  HIGH_VALUE_OUT: 'High value money out (>50k)',
} as const;

// Category colors for UI
export const CATEGORY_COLORS: Record<string, string> = {
  [CATEGORIES.SALARY]: '#10b981',
  [CATEGORIES.GOVERNMENT_SUPPORT]: '#3b82f6',
  [CATEGORIES.OTHER_MONEY_IN]: '#8b5cf6',
  [CATEGORIES.ATM_WITHDRAWALS]: '#ef4444',
  [CATEGORIES.ACCOMMODATION]: '#f97316',
  [CATEGORIES.CHILD_SUPPORT]: '#ec4899',
  [CATEGORIES.CHILDCARE_EDUCATION]: '#8b5cf6',
  [CATEGORIES.CLOTHING_PERSONAL]: '#f472b6',
  [CATEGORIES.DEBT_REPAYMENTS]: '#dc2626',
  [CATEGORIES.DONATIONS]: '#14b8a6',
  [CATEGORIES.ENTERTAINMENT]: '#a855f7',
  [CATEGORIES.FINANCIAL_SERVICES]: '#6366f1',
  [CATEGORIES.FOOD]: '#f59e0b',
  [CATEGORIES.GOVT_PROFESSIONAL]: '#64748b',
  [CATEGORIES.HOUSEHOLD]: '#0ea5e9',
  [CATEGORIES.INSURANCE]: '#06b6d4',
  [CATEGORIES.MEDICAL]: '#ef4444',
  [CATEGORIES.RATES]: '#78716c',
  [CATEGORIES.TITHING]: '#a3e635',
  [CATEGORIES.TRANSPORT]: '#22c55e',
  [CATEGORIES.UNCATEGORISED]: '#94a3b8',
  [CATEGORIES.UTILITIES]: '#0284c7',
  [CATEGORIES.GAMBLING]: '#dc2626',
  [CATEGORIES.FEES]: '#78716c',
};

// NZ-specific benchmarks (monthly averages for single person)
export const BENCHMARKS: Record<string, { low: number; average: number; high: number }> = {
  [CATEGORIES.FOOD]: { low: 400, average: 600, high: 900 },
  [CATEGORIES.TRANSPORT]: { low: 150, average: 300, high: 500 },
  [CATEGORIES.UTILITIES]: { low: 150, average: 250, high: 400 },
  [CATEGORIES.ENTERTAINMENT]: { low: 50, average: 150, high: 300 },
  [CATEGORIES.CLOTHING_PERSONAL]: { low: 30, average: 100, high: 200 },
  [CATEGORIES.MEDICAL]: { low: 20, average: 80, high: 200 },
  [CATEGORIES.INSURANCE]: { low: 100, average: 300, high: 600 },
  [CATEGORIES.HOUSEHOLD]: { low: 50, average: 150, high: 300 },
  [CATEGORIES.GAMBLING]: { low: 0, average: 0, high: 50 },
};

// Categorization rules
interface CategoryRule {
  category: string;
  keywords: string[];
  patterns?: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  // Income
  {
    category: CATEGORIES.SALARY,
    keywords: ['wage', 'salary', 'payroll', 'wages'],
    patterns: [/wage\s*wage/i, /salary/i, /payroll/i]
  },
  {
    category: CATEGORIES.GOVERNMENT_SUPPORT,
    keywords: ['winz', 'msd', 'benefit', 'working for families', 'ird', 'tax refund', 'acc ', 'studylink'],
    patterns: [/ministry.*social/i, /inland revenue/i]
  },

  // Food & Groceries
  {
    category: CATEGORIES.FOOD,
    keywords: [
      'woolworths', 'countdown', 'pak n save', 'paknsave', 'new world', 'supermarket',
      'fresh choice', 'freshchoice', 'four square', 'superette', 'grocery',
      'cafe', 'coffee', 'bakery', 'bakehouse', 'subway', 'mcdonalds', 'kfc',
      'burger', 'pizza', 'dominos', 'sushi', 'restaurant', 'takeaway', 'takeaways',
      'indian', 'chinese', 'thai', 'kebab', 'fish', 'chips', 'food', 'espresso',
      'latte', 'corner cafe', 'cuisine', 'bistro', 'eatery', 'dining', 'kitchen',
      'grill', 'noodle', 'ramen', 'poke', 'bowl', 'salad', 'lunch', 'brunch',
      'breakfast', 'dinner', 'meal', 'gordonton', 'alpino', 'cinnamon', 'hanoi',
      'pigeon', 'wyld', 'raglan bakery', 'lekker', 'honey', 'nori', 'tori'
    ]
  },

  // Transport
  {
    category: CATEGORIES.TRANSPORT,
    keywords: [
      'bp ', 'z energy', 'caltex', 'mobil', 'gull', 'waitomo', 'fuel', 'petrol',
      'gas station', 'npd', 'allied', 'uber', 'ola', 'taxi', 'bus', 'train',
      'at hop', 'intercity', 'naked bus', 'ferry', 'parking', 'wilson parking',
      'car wash', 'mechanic', 'tyre', 'tire', 'auto', 'vehicle', 'car service',
      'wof', 'registration', 'rego', 'aa ', 'nzta', 'vtnz', 'prodrive'
    ],
    patterns: [/bp\s+connect/i, /connect\s+horsham/i, /pak.*save.*fuel/i]
  },

  // Entertainment
  {
    category: CATEGORIES.ENTERTAINMENT,
    keywords: [
      'netflix', 'spotify', 'disney', 'neon', 'sky', 'cinema', 'movies',
      'event', 'ticketek', 'ticketmaster', 'concert', 'theatre', 'museum',
      'zoo', 'aquarium', 'bowling', 'mini golf', 'golf club', 'club',
      'bar', 'pub', 'tavern', 'brewery', 'wine', 'liquor', 'bottle',
      'gaming', 'playstation', 'xbox', 'steam', 'twitch', 'youtube premium',
      'fishing', 'hunting', 'outdoors', 'sports', 'gym', 'fitness',
      'lookout bar', 'bootleg', 'keg liquor'
    ]
  },

  // Utilities
  {
    category: CATEGORIES.UTILITIES,
    keywords: [
      'power', 'electricity', 'electric', 'genesis', 'mercury', 'contact energy',
      'meridian', 'trustpower', 'flick', 'powershop', 'gas bill', 'natural gas',
      'water', 'watercare', 'rates', 'internet', 'broadband', 'fibre', 'wifi',
      'vodafone', 'spark', '2degrees', 'skinny', 'slingshot', 'orcon', 'chorus',
      'phone', 'mobile', 'cell', 'enviro', 'waste', 'rubbish', 'recycling'
    ]
  },

  // Insurance
  {
    category: CATEGORIES.INSURANCE,
    keywords: [
      'insurance', 'insure', 'ami ', 'state ', 'tower', 'aa insurance',
      'aia ', 'southern cross', 'partners life', 'fidelity', 'cigna',
      'nib ', 'accuro', 'star insurance'
    ]
  },

  // Medical
  {
    category: CATEGORIES.MEDICAL,
    keywords: [
      'doctor', 'medical', 'pharmacy', 'chemist', 'unichem', 'life pharmacy',
      'hospital', 'dental', 'dentist', 'optometrist', 'optician', 'specsavers',
      'physio', 'osteopath', 'chiropractor', 'counsell', 'therapy', 'therapist',
      'health', 'clinic', 'surgery', 'gp ', 'hauora', 'northcare', 'care medical'
    ]
  },

  // Household
  {
    category: CATEGORIES.HOUSEHOLD,
    keywords: [
      'mitre 10', 'bunnings', 'warehouse', 'kmart', 'farmers', 'briscoes',
      'bed bath', 'harvey norman', 'noel leeming', 'jb hi-fi', 'pb tech',
      'furniture', 'appliance', 'homeware', 'garden', 'hardware', 'diy',
      'cleaning', 'laundry', 'dry clean', 'storage', 'rebel'
    ]
  },

  // Clothing & Personal Care
  {
    category: CATEGORIES.CLOTHING_PERSONAL,
    keywords: [
      'cotton on', 'h&m', 'zara', 'glassons', 'hallensteins', 'barkers',
      'postie', 'stirling', 'shoes', 'footwear', 'clothing', 'fashion',
      'haircut', 'hairdresser', 'barber', 'beauty', 'nail', 'spa',
      'massage', 'cosmetics', 'makeup', 'skincare', 'smart cell'
    ]
  },

  // Debt Repayments
  {
    category: CATEGORIES.DEBT_REPAYMENTS,
    keywords: [
      'loan repayment', 'mortgage', 'credit card', 'bnpl', 'afterpay',
      'laybuy', 'zip', 'humm', 'gem', 'q card', 'finance', 'lending'
    ],
    patterns: [/debit transfer/i, /visa.*transfer/i, /credit.*transfer/i]
  },

  // Accommodation
  {
    category: CATEGORIES.ACCOMMODATION,
    keywords: [
      'rent', 'landlord', 'property', 'accommodation', 'hotel', 'motel',
      'airbnb', 'booking.com', 'hostel', 'board', 'lodge', 'tenant'
    ],
    patterns: [/rent\+bills/i, /rent.*bills/i]
  },

  // Childcare & Education
  {
    category: CATEGORIES.CHILDCARE_EDUCATION,
    keywords: [
      'school', 'college', 'university', 'polytech', 'education', 'tuition',
      'daycare', 'childcare', 'kindy', 'kindergarten', 'preschool', 'creche',
      'after school', 'holiday programme', 'tutoring', 'course', 'training'
    ]
  },

  // Donations
  {
    category: CATEGORIES.DONATIONS,
    keywords: [
      'donation', 'charity', 'red cross', 'salvation army', 'unicef',
      'world vision', 'hospice', 'cancer', 'heart foundation', 'givealittle'
    ]
  },

  // Child Support
  {
    category: CATEGORIES.CHILD_SUPPORT,
    keywords: ['child support', 'ird child'],
    patterns: [/child\s*support/i]
  },

  // Government & Professional Services
  {
    category: CATEGORIES.GOVT_PROFESSIONAL,
    keywords: [
      'lawyer', 'solicitor', 'accountant', 'tax agent', 'real estate',
      'council', 'court', 'fines', 'ird ', 'immigration', 'passport',
      'license', 'licence', 'permit', 'registration', 'nzta', 'waka kotahi'
    ]
  },

  // Tithing
  {
    category: CATEGORIES.TITHING,
    keywords: ['tithe', 'tithing', 'church', 'offering', 'parish']
  },

  // Rates
  {
    category: CATEGORIES.RATES,
    keywords: ['rates', 'council rates', 'regional council', 'water rates']
  },

  // ATM Withdrawals
  {
    category: CATEGORIES.ATM_WITHDRAWALS,
    keywords: ['atm', 'cash withdrawal', 'cashout'],
    patterns: [/^at\s+/i, /acu\s+/i, /atm/i]
  },

  // Gambling
  {
    category: CATEGORIES.GAMBLING,
    keywords: [
      'tab', 'lotto', 'casino', 'pokies', 'betting', 'gamble', 'sportsbet',
      'bet365', 'punter', 'racing', 'trot', 'gaming'
    ]
  },

  // Fees
  {
    category: CATEGORIES.FEES,
    keywords: [
      'fee', 'bank fee', 'account fee', 'card fee', 'dishonour', 'overdraft',
      'interest charge', 'late fee', 'penalty', 'imt fee'
    ]
  },

  // Financial Services
  {
    category: CATEGORIES.FINANCIAL_SERVICES,
    keywords: [
      'sharesies', 'hatch', 'investnow', 'superannuation', 'kiwisaver',
      'investment', 'broker', 'financial adviser', 'wealth'
    ]
  },
];

export function categorizeTransaction(description: string, amount: number, txnType: string): string {
  const desc = description.toLowerCase();

  // Check for high value transactions first
  if (Math.abs(amount) > 50000) {
    return amount > 0 ? CATEGORIES.HIGH_VALUE_IN : CATEGORIES.HIGH_VALUE_OUT;
  }

  // Determine if income or expense
  const isIncome = amount > 0;

  // Check each category rule
  for (const rule of CATEGORY_RULES) {
    // Check keywords
    for (const keyword of rule.keywords) {
      if (desc.includes(keyword.toLowerCase())) {
        return rule.category;
      }
    }

    // Check patterns
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        if (pattern.test(desc)) {
          return rule.category;
        }
      }
    }
  }

  // Default categories
  if (isIncome) {
    return CATEGORIES.OTHER_MONEY_IN;
  }

  return CATEGORIES.UNCATEGORISED;
}

// Detect anomalies in spending patterns
export interface Anomaly {
  transactionId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export function detectAnomalies(
  transactions: { id: string; date: string; amount: number; category: string; description: string }[],
  monthlyAverages: Record<string, number>
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group transactions by category and month
  const byCategory: Record<string, typeof transactions> = {};
  for (const txn of transactions) {
    if (!byCategory[txn.category]) {
      byCategory[txn.category] = [];
    }
    byCategory[txn.category].push(txn);
  }

  // Check for large one-off payments (likely annual)
  for (const txn of transactions) {
    const category = txn.category;
    const categoryTxns = byCategory[category] || [];
    const monthlyAvg = monthlyAverages[category] || 0;

    // If a single transaction is > 3x the monthly average, flag it
    if (Math.abs(txn.amount) > monthlyAvg * 3 && Math.abs(txn.amount) > 200) {
      anomalies.push({
        transactionId: txn.id,
        reason: `Large payment (${Math.abs(txn.amount).toFixed(2)}) - possibly annual`,
        severity: 'medium',
        suggestion: `This ${category} payment may be annual. Monthly equivalent: $${(Math.abs(txn.amount) / 12).toFixed(2)}`
      });
    }

    // Check for insurance annual payments specifically
    if (txn.category === CATEGORIES.INSURANCE && Math.abs(txn.amount) > 500) {
      anomalies.push({
        transactionId: txn.id,
        reason: 'Annual insurance premium detected',
        severity: 'low',
        suggestion: `Annual insurance payment. Monthly equivalent: $${(Math.abs(txn.amount) / 12).toFixed(2)}`
      });
    }
  }

  // Check categories against benchmarks
  for (const [category, avg] of Object.entries(monthlyAverages)) {
    const benchmark = BENCHMARKS[category];
    if (benchmark) {
      if (avg > benchmark.high * 1.5) {
        anomalies.push({
          transactionId: '',
          reason: `${category} spending ($${avg.toFixed(0)}/month) significantly exceeds benchmark ($${benchmark.high}/month)`,
          severity: 'high',
          suggestion: 'May need explanation letter for lender'
        });
      } else if (avg > benchmark.high) {
        anomalies.push({
          transactionId: '',
          reason: `${category} spending ($${avg.toFixed(0)}/month) above average ($${benchmark.average}/month)`,
          severity: 'medium',
          suggestion: 'Consider reviewing this category'
        });
      }
    }
  }

  // Check for gambling
  const gamblingTxns = byCategory[CATEGORIES.GAMBLING] || [];
  if (gamblingTxns.length > 0) {
    const total = gamblingTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    anomalies.push({
      transactionId: '',
      reason: `Gambling activity detected: ${gamblingTxns.length} transactions totalling $${total.toFixed(2)}`,
      severity: 'high',
      suggestion: 'Lenders typically scrutinize gambling activity'
    });
  }

  return anomalies;
}

// Get benchmark comparison
export function getBenchmarkStatus(
  category: string,
  monthlyAverage: number
): 'below' | 'average' | 'above' | 'unknown' {
  const benchmark = BENCHMARKS[category];
  if (!benchmark) return 'unknown';

  if (monthlyAverage <= benchmark.low) return 'below';
  if (monthlyAverage <= benchmark.average * 1.2) return 'average';
  return 'above';
}
