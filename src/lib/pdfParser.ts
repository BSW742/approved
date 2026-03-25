// PDF parsing for NZ bank statements
import type { Transaction, Account, DocumentInfo } from './store';
import { generateId } from './store';
import { categorizeTransaction } from './categorize';

// Detect which bank the PDF is from
export function detectBank(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('anz bank') || t.includes('anz.co.nz')) return 'ANZ';
  if (t.includes('westpac') || t.includes('westpac.co.nz')) return 'Westpac';
  if (t.includes('asb bank') || t.includes('asb.co.nz')) return 'ASB';
  if (t.includes('bnz') || t.includes('bank of new zealand')) return 'BNZ';
  if (t.includes('kiwibank')) return 'Kiwibank';
  if (t.includes('tsb bank')) return 'TSB';
  if (t.includes('co-operative bank')) return 'Co-operative';
  if (t.includes('rabobank')) return 'Rabobank';
  if (t.includes('heartland')) return 'Heartland';
  return 'Unknown';
}

// ANZ transaction type codes
const ANZ_TXN_TYPES: Record<string, string> = {
  'AP': 'Automatic Payment',
  'BP': 'Bill Payment',
  'DC': 'Direct Credit',
  'DD': 'Direct Debit',
  'EP': 'EFTPOS',
  'AT': 'ATM',
  'VT': 'Visa Transaction',
  'IF': 'International Payment',
  'CQ': 'Cheque',
  'ED': 'Electronic Dishonour',
  'FX': 'Foreign Exchange',
  'IP': 'International EFTPOS',
  'IA': 'International ATM'
};

export interface PageText {
  pageNumber: number;
  text: string;
}

// Parse ANZ statement format
export function parseANZStatement(text: string, filename: string, documentId?: string, pageTexts?: PageText[]): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];

  // Extract account holder name
  let accountHolder = '';
  const nameMatch = text.match(/Account name\s+([A-Z][A-Z\s]+)/);
  if (nameMatch) {
    accountHolder = nameMatch[1].trim();
  }

  // Extract account number
  let accountNumber = '';
  const accountMatch = text.match(/Account number\s+([\d-]+)/);
  if (accountMatch) {
    accountNumber = accountMatch[1];
  }

  // Extract statement period
  let periodStart = '';
  let periodEnd = '';
  const periodMatch = text.match(/Statement period\s+(\d{1,2}\s+\w+\s+\d{4})\s*-\s*(\d{1,2}\s+\w+\s+\d{4})/);
  if (periodMatch) {
    periodStart = parseNZDate(periodMatch[1]);
    periodEnd = parseNZDate(periodMatch[2]);
  }

  // Extract account type
  let accountType: Account['type'] = 'everyday';
  if (text.toLowerCase().includes('savings') || text.toLowerCase().includes('online account')) {
    accountType = 'savings';
  } else if (text.toLowerCase().includes('visa') || text.toLowerCase().includes('credit card') || text.toLowerCase().includes('mastercard')) {
    accountType = 'credit';
  } else if (text.toLowerCase().includes('loan') || text.toLowerCase().includes('mortgage')) {
    accountType = 'loan';
  }

  // Create account
  if (accountNumber) {
    accounts.push({
      id: generateId(),
      name: accountHolder || 'ANZ Account',
      number: accountNumber,
      type: accountType,
      bank: 'ANZ',
      periodStart,
      periodEnd
    });
  }

  // Parse transactions from PDF text
  // Format after PDF extraction: "15 Dec   DD   Description here   1,257.00   1,137.10"
  // The text has: Date, Type Code, Description, then amounts (withdrawal/deposit, balance)

  // Match pattern: Date + Type + Description + Amounts
  // Example: "15 Dec   DD   9554-1054-1022-6573 DEBIT TRANSFER 162205   1,257.00   1,137.10"
  const txnPattern = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(AP|BP|DC|DD|EP|AT|VT|IF|CQ|ED|FX|IP|IA)\s+(.+?)\s+([\d,]+\.\d{2}(?:\s+OD)?)\s+([\d,]+\.\d{2}(?:\s+OD)?)?(?:\s+([\d,]+\.\d{2}(?:\s+OD)?))?/gi;

  // Determine base year from period START (not end) to handle year-spanning statements
  // e.g., "10 Dec 2025 - 09 Mar 2026" should start assigning 2025 to Dec transactions
  const currentYear = new Date().getFullYear();
  let baseYear = currentYear;
  if (periodStart) {
    baseYear = parseInt(periodStart.split('-')[0]);
  } else if (periodEnd) {
    baseYear = parseInt(periodEnd.split('-')[0]);
  }
  // Sanity check - if base year is in the future, use current year - 1
  // Bank statements are always historical
  if (baseYear > currentYear) {
    baseYear = currentYear;
  }

  let match;
  let lastMonth = 0;
  let txnYear = baseYear;
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;

  // First pass: find all transactions in the text
  const allMatches: RegExpExecArray[] = [];
  while ((match = txnPattern.exec(text)) !== null) {
    allMatches.push([...match] as any);
  }

  for (const m of allMatches) {
    const [, dateStr, txnType, rawDesc, amt1, amt2, amt3] = m;

    // Skip header/total rows
    if (rawDesc.toLowerCase().includes('opening balance') ||
        rawDesc.toLowerCase().includes('balance brought forward') ||
        rawDesc.toLowerCase().includes('totals at end')) {
      continue;
    }

    // Handle year - be smart about it
    const monthNum = getMonthNumber(dateStr.split(/\s+/)[1]);

    // If this month is in the future relative to current date, use previous year
    if (txnYear === thisYear && monthNum > thisMonth) {
      txnYear = thisYear - 1;
    }

    // Handle year rollover in statement
    if (monthNum < lastMonth && lastMonth >= 10 && monthNum <= 3) {
      // Rolled from Dec to Jan - increment year
      txnYear = Math.min(txnYear + 1, thisYear);
    } else if (monthNum > lastMonth && lastMonth <= 3 && monthNum >= 10) {
      // Rolled back from Jan to Dec (going backwards in statement)
      txnYear = txnYear - 1;
    }
    lastMonth = monthNum;

    let date = parseNZDate(dateStr + ' ' + txnYear);

    // Final sanity check: if the date is in the future, use previous year
    const parsedDate = new Date(date);
    const today = new Date();
    if (parsedDate > today) {
      txnYear = txnYear - 1;
      date = parseNZDate(dateStr + ' ' + txnYear);
    }

    // Determine amounts - ANZ format has withdrawal, deposit, then balance
    // For withdrawals: amt1 is withdrawal amount, last is balance
    // For deposits: we might have deposit then balance, or withdrawal then deposit then balance
    let amount = 0;
    const desc = cleanDescription(rawDesc);

    // Parse amounts
    const amounts = [amt1, amt2, amt3].filter(a => a && a.trim()).map(a => parseAmount(a));

    if (amounts.length >= 2) {
      // Last amount is always the balance
      // If it's a credit (DC, BP incoming, IF incoming), the deposit is before the balance
      // If it's a debit, the withdrawal is before the balance

      // Check if this is likely a credit transaction
      const isCredit = txnType === 'DC' ||
                       txnType === 'IF' ||
                       (txnType === 'BP' && rawDesc.toLowerCase().includes('bill payment') && !rawDesc.toLowerCase().includes('payment')) ||
                       rawDesc.toLowerCase().includes('wage') ||
                       rawDesc.toLowerCase().includes('salary');

      if (amounts.length === 2) {
        // One amount + balance
        amount = isCredit ? amounts[0] : -amounts[0];
      } else if (amounts.length === 3) {
        // Withdrawal + Deposit + Balance OR just one of withdrawal/deposit plus balance
        // Need to figure out which column has the value
        // Usually: if withdrawal column has value, it's negative; if deposit has value, it's positive
        if (amounts[0] > 0 && amounts[1] === 0) {
          amount = -amounts[0]; // Withdrawal
        } else if (amounts[0] === 0 && amounts[1] > 0) {
          amount = amounts[1]; // Deposit
        } else {
          // Both have values - unusual, take the larger as the transaction
          amount = amounts[1] > amounts[0] ? amounts[1] : -amounts[0];
        }
      }
    } else if (amounts.length === 1) {
      // Only balance, skip this as it's likely a header row
      continue;
    }

    // Refine credit/debit detection based on transaction type
    if (txnType === 'DC' || txnType === 'IF') {
      // Direct Credits and International Payments IN are usually credits
      if (amount < 0) amount = Math.abs(amount);
    } else if (txnType === 'DD' || txnType === 'AP' || txnType === 'EP' || txnType === 'AT') {
      // Direct Debits, Auto Payments, EFTPOS, ATM are usually debits
      if (amount > 0 && !rawDesc.toLowerCase().includes('refund')) {
        amount = -Math.abs(amount);
      }
    } else if (txnType === 'BP') {
      // Bill Payments can be either - incoming payments to you or outgoing
      // If the description suggests it's a payment TO someone, it's a debit
      if (rawDesc.toLowerCase().includes('bill payment') && !accountHolder.toLowerCase().includes(rawDesc.split(' ')[0].toLowerCase())) {
        if (amount > 0) amount = -Math.abs(amount);
      }
    }

    if (amount === 0) continue;

    const category = categorizeTransaction(desc + ' ' + rawDesc, amount, txnType);

    // Find which page this transaction is on
    let pageNumber = 1;
    const textMatch = rawDesc.substring(0, 50); // Use first 50 chars for matching
    if (pageTexts) {
      for (const pt of pageTexts) {
        if (pt.text.includes(rawDesc.substring(0, 30))) {
          pageNumber = pt.pageNumber;
          break;
        }
      }
    }

    transactions.push({
      id: generateId(),
      date,
      description: `${ANZ_TXN_TYPES[txnType] || txnType}: ${desc}`,
      rawDescription: rawDesc,
      amount,
      type: amount > 0 ? 'credit' : 'debit',
      category,
      source: filename,
      accountNumber,
      documentId,
      pageNumber,
      textMatch
    });
  }

  // Create document info
  const document: DocumentInfo = {
    id: generateId(),
    filename,
    bank: 'ANZ',
    uploadedAt: new Date().toISOString(),
    periodStart,
    periodEnd
  };

  return { transactions, accounts, document };
}

// Parse Westpac statement format
export function parseWestpacStatement(text: string, filename: string, documentId?: string, pageTexts?: PageText[]): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];

  let accountNumber = '';
  let periodStart = '';
  let periodEnd = '';

  // Extract account details
  const accountMatch = text.match(/([\d-]+)\s+(\d+ months?)/);
  if (accountMatch) {
    accountNumber = accountMatch[1];
  }

  // Westpac transactions - try multiple patterns
  const patterns = [
    /(\d{1,2}\s+\w+\s+\d{4})\s+(.+?)\s+(Money (?:in|out)|Transfer)\s+(-?\$?[\d,]+\.\d{2})/gi,
    /(\d{1,2}\s+\w+\s+\d{4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s+(View)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, dateStr, desc, typeOrAmount, amountOrView] = match;

      const date = parseNZDate(dateStr);
      let amount: number;
      let type: string;

      if (amountOrView === 'View') {
        // Second pattern
        amount = parseAmount(typeOrAmount.replace('$', ''));
        type = amount >= 0 ? 'Money in' : 'Money out';
      } else {
        // First pattern
        type = typeOrAmount;
        amount = parseAmount(amountOrView.replace('$', '').replace('-', ''));
        if (type === 'Money out' || amountOrView.startsWith('-')) {
          amount = -amount;
        }
      }

      if (amount !== 0) {
        const category = categorizeTransaction(desc, amount, type);

        // Find which page this transaction is on
        let pageNumber = 1;
        const textMatch = desc.substring(0, 50);
        if (pageTexts) {
          for (const pt of pageTexts) {
            if (pt.text.includes(desc.substring(0, 30))) {
              pageNumber = pt.pageNumber;
              break;
            }
          }
        }

        transactions.push({
          id: generateId(),
          date,
          description: cleanDescription(desc),
          rawDescription: desc,
          amount,
          type: amount > 0 ? 'credit' : 'debit',
          category,
          source: filename,
          accountNumber,
          isTransfer: type === 'Transfer',
          documentId,
          pageNumber,
          textMatch
        });
      }
    }
  }

  const document: DocumentInfo = {
    id: generateId(),
    filename,
    bank: 'Westpac',
    uploadedAt: new Date().toISOString(),
    periodStart,
    periodEnd
  };

  return { transactions, accounts, document };
}

// Generic parser for unknown bank formats
export function parseGenericStatement(text: string, filename: string, bank: string, documentId?: string, pageTexts?: PageText[]): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];

  // Try to find date + description + amount patterns
  // Common formats:
  // DD/MM/YYYY Description Amount
  // DD Mon YYYY Description Amount

  const patterns = [
    // Date DD Mon YYYY + text + amount
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})/gi,
    // Date DD/MM/YYYY + text + amount
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, dateStr, desc, amountStr] = match;

      // Skip headers and totals
      if (desc.toLowerCase().includes('opening') ||
          desc.toLowerCase().includes('closing') ||
          desc.toLowerCase().includes('total') ||
          desc.toLowerCase().includes('balance')) {
        continue;
      }

      const date = parseNZDate(dateStr);
      const amount = parseAmount(amountStr.replace('$', ''));

      if (amount !== 0 && desc.trim()) {
        const category = categorizeTransaction(desc, amount, '');

        // Find which page this transaction is on
        let pageNumber = 1;
        const textMatch = desc.substring(0, 50);
        if (pageTexts) {
          for (const pt of pageTexts) {
            if (pt.text.includes(desc.substring(0, 30))) {
              pageNumber = pt.pageNumber;
              break;
            }
          }
        }

        transactions.push({
          id: generateId(),
          date,
          description: cleanDescription(desc),
          rawDescription: desc,
          amount,
          type: amount > 0 ? 'credit' : 'debit',
          category,
          source: filename,
          documentId,
          pageNumber,
          textMatch
        });
      }
    }
  }

  const document: DocumentInfo = {
    id: documentId || generateId(),
    filename,
    bank,
    uploadedAt: new Date().toISOString()
  };

  return { transactions, accounts, document };
}

// Helper functions
function parseNZDate(dateStr: string): string {
  if (!dateStr) return '';

  const months: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };

  let result = '';

  // DD Mon YYYY or DD Month YYYY
  const match1 = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match1) {
    const [, day, month, year] = match1;
    const m = months[month.toLowerCase()];
    if (m) {
      result = `${year}-${m}-${day.padStart(2, '0')}`;
    }
  }

  // DD Mon YY
  if (!result) {
    const match2 = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{2})$/);
    if (match2) {
      const [, day, month, year] = match2;
      const m = months[month.toLowerCase()];
      if (m) {
        const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
        result = `${fullYear}-${m}-${day.padStart(2, '0')}`;
      }
    }
  }

  // DD/MM/YYYY
  if (!result) {
    const match3 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match3) {
      const [, day, month, year] = match3;
      result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // DD/MM/YY
  if (!result) {
    const match4 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (match4) {
      const [, day, month, year] = match4;
      const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      result = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  if (!result) return dateStr;

  // Final check: if date is in the future, adjust year back
  const parsed = new Date(result);
  const today = new Date();
  if (parsed > today) {
    const year = parseInt(result.substring(0, 4)) - 1;
    result = `${year}${result.substring(4)}`;
  }

  return result;
}

function getMonthNumber(monthStr: string): number {
  const months: Record<string, number> = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };
  return months[monthStr.toLowerCase().substring(0, 3)] || 0;
}

function parseAmount(amountStr: string): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.replace(/[$,\s]/g, '').replace(/OD$/i, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/\d{6}\*+\d*/g, '') // Card numbers like 503646****** 1047
    .replace(/\s+C$/i, '') // Trailing C
    .replace(/\s+\d{4}$/i, '') // Trailing 4 digits
    .replace(/\s{2,}/g, ' ') // Multiple spaces
    .trim();
}

export { generateId };
