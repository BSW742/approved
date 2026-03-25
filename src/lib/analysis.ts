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
