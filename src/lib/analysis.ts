// Analysis and reporting functions
import type { Transaction, Account, Prospect } from './store';
import { CATEGORIES, BENCHMARKS, detectAnomalies, getBenchmarkStatus } from './categorize';

export interface CategorySummary {
  category: string;
  transactionCount: number;
  total: number;
  monthlyAverage: number;
  benchmarkStatus: 'below' | 'average' | 'above' | 'unknown';
  transactions: Transaction[];
}

export interface MoneyInSummary {
  salary: { count: number; monthly: number; total: number };
  governmentSupport: { count: number; monthly: number; total: number };
  otherMoneyIn: { count: number; monthly: number; total: number };
  total: { count: number; monthly: number; total: number };
}

export interface KeyIndicators {
  atmDeposits: { count: number; monthly: number; total: number };
  atmWithdrawals: { count: number; monthly: number; total: number };
  debtRepayment: { count: number; monthly: number; total: number };
  dishonours: { count: number; monthly: number; total: number };
  fees: { count: number; monthly: number; total: number };
  gambling: { count: number; monthly: number; total: number };
  highValueIn: { count: number; monthly: number; total: number };
  highValueOut: { count: number; monthly: number; total: number };
}

export interface ProspectAnalysis {
  period: { start: string; end: string; months: number };
  moneyIn: number;
  moneyOut: number;
  closingBalance: number;
  moneyInSummary: MoneyInSummary;
  keyIndicators: KeyIndicators;
  spendingCategories: CategorySummary[];
  anomalies: ReturnType<typeof detectAnomalies>;
  accountSummaries: AccountSummary[];
  associatedAccounts: AssociatedAccount[];
  monthlyBalances: { date: string; balance: number }[];
}

export interface AccountSummary {
  account: Account;
  moneyIn: number;
  moneyOut: number;
  closingBalance: number;
  daysInNegative: number;
  transactionCount: number;
}

export interface AssociatedAccount {
  name: string;
  accountNumber: string;
  moneyIn: number;
  moneyOut: number;
  totalAmount: number;
  transactionCount: number;
  transactions: Transaction[];
}

export function analyzeProspect(prospect: Prospect): ProspectAnalysis {
  const { transactions, accounts } = prospect;

  if (transactions.length === 0) {
    return getEmptyAnalysis();
  }

  // Determine period
  const dates = transactions.map(t => new Date(t.date).getTime());
  const startDate = new Date(Math.min(...dates));
  const endDate = new Date(Math.max(...dates));
  const months = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));

  // Calculate totals
  const moneyIn = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const moneyOut = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Money in summary
  const salaryTxns = transactions.filter(t => t.category === CATEGORIES.SALARY && t.amount > 0);
  const govtTxns = transactions.filter(t => t.category === CATEGORIES.GOVERNMENT_SUPPORT && t.amount > 0);
  const otherInTxns = transactions.filter(t => t.amount > 0 && ![CATEGORIES.SALARY, CATEGORIES.GOVERNMENT_SUPPORT].includes(t.category as any));

  const moneyInSummary: MoneyInSummary = {
    salary: {
      count: salaryTxns.length,
      total: salaryTxns.reduce((sum, t) => sum + t.amount, 0),
      monthly: salaryTxns.reduce((sum, t) => sum + t.amount, 0) / months
    },
    governmentSupport: {
      count: govtTxns.length,
      total: govtTxns.reduce((sum, t) => sum + t.amount, 0),
      monthly: govtTxns.reduce((sum, t) => sum + t.amount, 0) / months
    },
    otherMoneyIn: {
      count: otherInTxns.length,
      total: otherInTxns.reduce((sum, t) => sum + t.amount, 0),
      monthly: otherInTxns.reduce((sum, t) => sum + t.amount, 0) / months
    },
    total: {
      count: transactions.filter(t => t.amount > 0).length,
      total: moneyIn,
      monthly: moneyIn / months
    }
  };

  // Key indicators
  const keyIndicators = calculateKeyIndicators(transactions, months);

  // Spending categories
  const spendingCategories = calculateSpendingCategories(transactions, months);

  // Account summaries
  const accountSummaries = calculateAccountSummaries(accounts, transactions);

  // Associated accounts (external accounts from transactions)
  const associatedAccounts = extractAssociatedAccounts(transactions);

  // Monthly averages for anomaly detection
  const monthlyAverages: Record<string, number> = {};
  for (const cat of spendingCategories) {
    monthlyAverages[cat.category] = cat.monthlyAverage;
  }

  // Detect anomalies
  const anomalies = detectAnomalies(
    transactions.map(t => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      category: t.category,
      description: t.description
    })),
    monthlyAverages
  );

  // Calculate monthly balances for chart
  const monthlyBalances = calculateMonthlyBalances(transactions, startDate, endDate);

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      months
    },
    moneyIn,
    moneyOut,
    closingBalance: moneyIn - moneyOut,
    moneyInSummary,
    keyIndicators,
    spendingCategories,
    anomalies,
    accountSummaries,
    associatedAccounts,
    monthlyBalances
  };
}

function calculateKeyIndicators(transactions: Transaction[], months: number): KeyIndicators {
  const atmDeposits = transactions.filter(t => t.category === CATEGORIES.ATM_WITHDRAWALS && t.amount > 0);
  const atmWithdrawals = transactions.filter(t => t.category === CATEGORIES.ATM_WITHDRAWALS && t.amount < 0);
  const debtRepayment = transactions.filter(t => t.category === CATEGORIES.DEBT_REPAYMENTS);
  const fees = transactions.filter(t => t.category === CATEGORIES.FEES);
  const gambling = transactions.filter(t => t.category === CATEGORIES.GAMBLING);
  const highValueIn = transactions.filter(t => t.category === CATEGORIES.HIGH_VALUE_IN);
  const highValueOut = transactions.filter(t => t.category === CATEGORIES.HIGH_VALUE_OUT);

  // Dishonours - look for specific keywords
  const dishonours = transactions.filter(t =>
    t.rawDescription?.toLowerCase().includes('dishonour') ||
    t.rawDescription?.toLowerCase().includes('declined') ||
    t.rawDescription?.toLowerCase().includes('insufficient')
  );

  const sumPositive = (txns: Transaction[]) => txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const sumNegative = (txns: Transaction[]) => txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const sumAll = (txns: Transaction[]) => txns.reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    atmDeposits: { count: atmDeposits.length, total: sumPositive(atmDeposits), monthly: sumPositive(atmDeposits) / months },
    atmWithdrawals: { count: atmWithdrawals.length, total: sumNegative(atmWithdrawals), monthly: sumNegative(atmWithdrawals) / months },
    debtRepayment: { count: debtRepayment.length, total: sumNegative(debtRepayment), monthly: sumNegative(debtRepayment) / months },
    dishonours: { count: dishonours.length, total: sumAll(dishonours), monthly: sumAll(dishonours) / months },
    fees: { count: fees.length, total: sumNegative(fees), monthly: sumNegative(fees) / months },
    gambling: { count: gambling.length, total: sumNegative(gambling), monthly: sumNegative(gambling) / months },
    highValueIn: { count: highValueIn.length, total: sumPositive(highValueIn), monthly: sumPositive(highValueIn) / months },
    highValueOut: { count: highValueOut.length, total: sumNegative(highValueOut), monthly: sumNegative(highValueOut) / months }
  };
}

function calculateSpendingCategories(transactions: Transaction[], months: number): CategorySummary[] {
  const spendingCats = [
    CATEGORIES.ATM_WITHDRAWALS,
    CATEGORIES.ACCOMMODATION,
    CATEGORIES.CHILD_SUPPORT,
    CATEGORIES.CHILDCARE_EDUCATION,
    CATEGORIES.CLOTHING_PERSONAL,
    CATEGORIES.DEBT_REPAYMENTS,
    CATEGORIES.DONATIONS,
    CATEGORIES.ENTERTAINMENT,
    CATEGORIES.FINANCIAL_SERVICES,
    CATEGORIES.FOOD,
    CATEGORIES.GOVT_PROFESSIONAL,
    CATEGORIES.HOUSEHOLD,
    CATEGORIES.INSURANCE,
    CATEGORIES.MEDICAL,
    CATEGORIES.RATES,
    CATEGORIES.TITHING,
    CATEGORIES.TRANSPORT,
    CATEGORIES.UNCATEGORISED,
    CATEGORIES.UTILITIES
  ];

  const summaries: CategorySummary[] = [];

  for (const category of spendingCats) {
    const catTxns = transactions.filter(t => t.category === category && t.amount < 0);
    const total = catTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const monthlyAverage = total / months;

    summaries.push({
      category,
      transactionCount: catTxns.length,
      total,
      monthlyAverage,
      benchmarkStatus: getBenchmarkStatus(category, monthlyAverage),
      transactions: catTxns
    });
  }

  // Sort by total descending
  return summaries.sort((a, b) => b.total - a.total);
}

function calculateAccountSummaries(accounts: Account[], transactions: Transaction[]): AccountSummary[] {
  return accounts.map(account => {
    const accountTxns = transactions.filter(t => t.accountNumber === account.number);
    const moneyIn = accountTxns.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const moneyOut = accountTxns.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Calculate days in negative (simplified - would need daily balance tracking for accuracy)
    let daysInNegative = 0;
    let runningBalance = account.openingBalance || 0;
    const sortedTxns = [...accountTxns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const txn of sortedTxns) {
      runningBalance += txn.amount;
      if (runningBalance < 0) {
        daysInNegative++;
      }
    }

    return {
      account,
      moneyIn,
      moneyOut,
      closingBalance: account.closingBalance || (moneyIn - moneyOut),
      daysInNegative,
      transactionCount: accountTxns.length
    };
  });
}

function extractAssociatedAccounts(transactions: Transaction[]): AssociatedAccount[] {
  const accountMap = new Map<string, AssociatedAccount>();

  for (const txn of transactions) {
    // Skip internal transfers or unidentifiable transactions
    const desc = txn.rawDescription || txn.description || '';

    // Try to extract account number - multiple NZ formats
    let accountNumber = '';

    // NZ bank account formats:
    // XX-XXXX-XXXXXXX-XX or XX-XXXX-XXXXXXX-XXX (with dashes)
    const dashFormat = desc.match(/(\d{2}-\d{4}-\d{6,8}-\d{2,3})/);
    if (dashFormat) {
      accountNumber = dashFormat[1];
    }

    // Space-separated format: XX XXXX XXXXXXX XX
    if (!accountNumber) {
      const spaceFormat = desc.match(/(\d{2}\s+\d{4}\s+\d{6,8}\s+\d{2,3})/);
      if (spaceFormat) {
        accountNumber = spaceFormat[1].replace(/\s+/g, '-');
      }
    }

    // Continuous digits (15-16 digits that look like account numbers, not card numbers)
    if (!accountNumber) {
      const continuousFormat = desc.match(/\b(\d{15,16})\b/);
      if (continuousFormat && !desc.includes('***')) {
        const num = continuousFormat[1];
        // Format as XX-XXXX-XXXXXXX-XX
        accountNumber = `${num.slice(0,2)}-${num.slice(2,6)}-${num.slice(6,13)}-${num.slice(13)}`;
      }
    }

    // Partial account with asterisks (like 9554-1054-1022-6573)
    if (!accountNumber) {
      const partialFormat = desc.match(/(\d{4}-\d{4}-\d{4}-\d{4})/);
      if (partialFormat) {
        accountNumber = partialFormat[1];
      }
    }

    // Try to extract name - usually after "TO " or "FROM " or at start
    let name = '';

    // Common patterns for extracting payee/payer names
    const toMatch = desc.match(/(?:TO|PAYMENT TO|PAID TO|TFR TO)\s+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);
    const fromMatch = desc.match(/(?:FROM|RECEIVED FROM|TFR FROM)\s+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);
    const dcMatch = desc.match(/Direct Credit[:\s]+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);
    const ddMatch = desc.match(/Direct Debit[:\s]+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);
    const bpMatch = desc.match(/Bill Payment[:\s]+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);
    const apMatch = desc.match(/Automatic Payment[:\s]+([A-Z][A-Z\s&'-]+?)(?:\s+\d|$)/i);

    if (toMatch) name = toMatch[1].trim();
    else if (fromMatch) name = fromMatch[1].trim();
    else if (dcMatch) name = dcMatch[1].trim();
    else if (ddMatch) name = ddMatch[1].trim();
    else if (bpMatch) name = bpMatch[1].trim();
    else if (apMatch) name = apMatch[1].trim();

    // If no name found, try to get first recognizable part
    if (!name) {
      // Get first word(s) that look like a name/company
      const words = desc.split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w));
      if (words.length > 0) {
        // Take up to 3 words that look like a name
        name = words.slice(0, 3).join(' ').replace(/\d+$/, '').trim();
      }
    }

    // Skip if we can't identify the account/name
    if (!name && !accountNumber) continue;

    // Skip common non-account entries
    const skipPatterns = [
      /^(EFTPOS|VISA|ATM|FEE|INTEREST|BALANCE)/i,
      /^(OPENING|CLOSING|TOTAL)/i
    ];
    if (skipPatterns.some(p => p.test(name))) continue;

    // Create key for grouping - prefer account number for uniqueness
    const key = accountNumber || name.toUpperCase();

    if (!accountMap.has(key)) {
      accountMap.set(key, {
        name: name || 'Unknown',
        accountNumber,
        moneyIn: 0,
        moneyOut: 0,
        totalAmount: 0,
        transactionCount: 0,
        transactions: []
      });
    }

    const account = accountMap.get(key)!;
    if (txn.amount > 0) {
      account.moneyIn += txn.amount;
    } else {
      account.moneyOut += Math.abs(txn.amount);
    }
    account.totalAmount += Math.abs(txn.amount);
    account.transactionCount++;
    account.transactions.push(txn);

    // Update name if we found a better one
    if (name && account.name === 'Unknown') {
      account.name = name;
    }
    // Update account number if we found one
    if (accountNumber && !account.accountNumber) {
      account.accountNumber = accountNumber;
    }
  }

  // Convert to array and sort by total amount
  return Array.from(accountMap.values())
    .filter(a => a.totalAmount >= 100) // Filter out tiny accounts
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function calculateMonthlyBalances(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date
): { date: string; balance: number }[] {
  const balances: { date: string; balance: number }[] = [];
  const sortedTxns = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  let currentMonth = '';

  for (const txn of sortedTxns) {
    const month = txn.date.substring(0, 7); // YYYY-MM
    runningBalance += txn.amount;

    if (month !== currentMonth) {
      currentMonth = month;
      balances.push({ date: month, balance: runningBalance });
    } else {
      // Update last entry
      balances[balances.length - 1].balance = runningBalance;
    }
  }

  return balances;
}

function getEmptyAnalysis(): ProspectAnalysis {
  return {
    period: { start: '', end: '', months: 0 },
    moneyIn: 0,
    moneyOut: 0,
    closingBalance: 0,
    moneyInSummary: {
      salary: { count: 0, monthly: 0, total: 0 },
      governmentSupport: { count: 0, monthly: 0, total: 0 },
      otherMoneyIn: { count: 0, monthly: 0, total: 0 },
      total: { count: 0, monthly: 0, total: 0 }
    },
    keyIndicators: {
      atmDeposits: { count: 0, monthly: 0, total: 0 },
      atmWithdrawals: { count: 0, monthly: 0, total: 0 },
      debtRepayment: { count: 0, monthly: 0, total: 0 },
      dishonours: { count: 0, monthly: 0, total: 0 },
      fees: { count: 0, monthly: 0, total: 0 },
      gambling: { count: 0, monthly: 0, total: 0 },
      highValueIn: { count: 0, monthly: 0, total: 0 },
      highValueOut: { count: 0, monthly: 0, total: 0 }
    },
    spendingCategories: [],
    anomalies: [],
    accountSummaries: [],
    associatedAccounts: [],
    monthlyBalances: []
  };
}

// Format currency for display
export function formatCurrency(amount: number, showSign = false): string {
  const formatted = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 2
  }).format(Math.abs(amount));

  if (showSign && amount !== 0) {
    return amount > 0 ? `+${formatted}` : `-${formatted}`;
  }
  return amount < 0 ? `-${formatted}` : formatted;
}

// Format date for display
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Calculate period in human readable format
export function formatPeriod(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return '';

  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = Math.ceil((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));

  const startStr = start.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  const endStr = end.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });

  return `${startStr} - ${endStr} (${months} month${months !== 1 ? 's' : ''})`;
}
