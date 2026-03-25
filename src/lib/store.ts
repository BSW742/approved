// LocalStorage-based data store for prospects and transactions

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
  subcategory?: string;
  source: string; // Which PDF/bank this came from
  accountNumber?: string;
  rawDescription: string;
  isTransfer?: boolean;
  isAnomalous?: boolean;
  anomalyReason?: string;
}

export interface Account {
  id: string;
  name: string;
  number: string;
  type: 'everyday' | 'savings' | 'credit' | 'loan';
  bank: string;
  openingBalance?: number;
  closingBalance?: number;
  limit?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface Prospect {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
  accounts: Account[];
  transactions: Transaction[];
  documents: DocumentInfo[];
  notes?: string;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  bank: string;
  uploadedAt: string;
  periodStart?: string;
  periodEnd?: string;
  pageCount?: number;
}

const STORAGE_KEY = 'approved_prospects';

export function getProspects(): Prospect[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function getProspect(id: string): Prospect | undefined {
  return getProspects().find(p => p.id === id);
}

export function saveProspect(prospect: Prospect): void {
  const prospects = getProspects();
  const index = prospects.findIndex(p => p.id === prospect.id);

  prospect.updatedAt = new Date().toISOString();

  if (index >= 0) {
    prospects[index] = prospect;
  } else {
    prospects.push(prospect);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(prospects));
}

export function deleteProspect(id: string): void {
  const prospects = getProspects().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prospects));
}

export function createProspect(name: string): Prospect {
  const prospect: Prospect = {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accounts: [],
    transactions: [],
    documents: []
  };
  saveProspect(prospect);
  return prospect;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Merge transactions from multiple sources, handling duplicates
export function mergeTransactions(existing: Transaction[], newTxns: Transaction[]): Transaction[] {
  const merged = [...existing];

  for (const txn of newTxns) {
    // Check for duplicates based on date, amount, and description similarity
    const isDupe = merged.some(e =>
      e.date === txn.date &&
      Math.abs(e.amount - txn.amount) < 0.01 &&
      similarity(e.rawDescription, txn.rawDescription) > 0.8
    );

    if (!isDupe) {
      merged.push(txn);
    }
  }

  // Sort by date descending
  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshtein(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}
