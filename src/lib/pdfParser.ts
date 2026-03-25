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

// Parse ANZ statement format
export function parseANZStatement(text: string, filename: string): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Extract account holder name
  let accountHolder = '';
  const nameMatch = text.match(/Account name\s+([A-Z\s]+)\n/);
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

  // Parse transactions - ANZ format:
  // Date | Type | Description | Withdrawals | Deposits | Balance
  // Example: "10 Dec EP THE LOOKOUT BAR 503646****** 1047 C 57.00 1,309.10"

  // ANZ transaction type codes
  const txnTypes: Record<string, string> = {
    'AP': 'Automatic Payment',
    'BP': 'Bill Payment',
    'DC': 'Direct Credit',
    'DD': 'Direct Debit',
    'EP': 'EFTPOS',
    'AT': 'ATM',
    'VT': 'Visa Transaction',
    'IF': 'International Payment',
    'CQ': 'Cheque'
  };

  // Regex to match ANZ transaction lines
  // Format: DD Mon TYPE DESCRIPTION AMOUNT [AMOUNT] BALANCE
  const txnRegex = /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(AP|BP|DC|DD|EP|AT|VT|IF|CQ|ED|FX|IP|IA)\s+(.+?)(?:\s+([\d,]+\.\d{2}))?(?:\s+([\d,]+\.\d{2}))?\s+([\d,]+\.\d{2}(?:\s+OD)?)\s*$/i;

  // Also try simpler format for continuation lines
  const simpleRegex = /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})?$/i;

  let currentYear = new Date().getFullYear();
  let lastMonth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines
    if (line.includes('Opening balance') ||
        line.includes('Balance brought forward') ||
        line.includes('Totals at end') ||
        line.includes('Date') && line.includes('Transaction type')) {
      continue;
    }

    let match = line.match(txnRegex);

    if (match) {
      const [, dateStr, txnType, desc, withdrawal, deposit, balance] = match;

      // Handle year rollover (statement can span Dec to Jan)
      const monthNum = getMonthNumber(dateStr.split(' ')[1]);
      if (monthNum < lastMonth && lastMonth >= 10) {
        currentYear++;
      }
      lastMonth = monthNum;

      const date = parseNZDate(dateStr + ' ' + currentYear);
      const amount = deposit
        ? parseAmount(deposit)
        : withdrawal
          ? -parseAmount(withdrawal)
          : 0;

      if (amount !== 0) {
        const category = categorizeTransaction(desc, amount, txnType);

        transactions.push({
          id: generateId(),
          date,
          description: `${txnTypes[txnType] || txnType}: ${cleanDescription(desc)}`,
          rawDescription: desc,
          amount,
          type: amount > 0 ? 'credit' : 'debit',
          category,
          source: filename,
          accountNumber
        });
      }
    }
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
export function parseWestpacStatement(text: string, filename: string): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let accountNumber = '';
  let periodStart = '';
  let periodEnd = '';

  // Extract account details
  const accountMatch = text.match(/([\d-]+)\s+(\d+ months?)/);
  if (accountMatch) {
    accountNumber = accountMatch[1];
  }

  // Westpac transactions are in a table format
  // Date | Description | Category | Type | Amount
  const txnRegex = /^(\d{1,2}\s+\w+\s+\d{4})\s+(.+?)\s+(Money (?:in|out)|Transfer)\s+(-?\$?[\d,]+\.\d{2})/;

  for (const line of lines) {
    const match = line.match(txnRegex);
    if (match) {
      const [, dateStr, desc, type, amountStr] = match;

      const date = parseNZDate(dateStr);
      let amount = parseAmount(amountStr.replace('$', '').replace('-', ''));

      if (type === 'Money out' || amountStr.startsWith('-')) {
        amount = -amount;
      }

      if (amount !== 0) {
        const category = categorizeTransaction(desc, amount, type);

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
          isTransfer: type === 'Transfer'
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
export function parseGenericStatement(text: string, filename: string, bank: string): {
  transactions: Transaction[];
  accounts: Account[];
  document: DocumentInfo;
} {
  const transactions: Transaction[] = [];
  const accounts: Account[] = [];

  // Try to find any date + amount patterns
  const lines = text.split('\n');

  // Common date patterns
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,           // DD/MM/YYYY or DD/MM/YY
    /(\d{1,2}-\d{1,2}-\d{2,4})/,             // DD-MM-YYYY
    /(\d{1,2}\s+\w{3}\s+\d{2,4})/,           // DD Mon YYYY
    /(\d{1,2}\s+\w+\s+\d{4})/                // DD Month YYYY
  ];

  // Amount pattern
  const amountPattern = /(-?\$?[\d,]+\.\d{2})/g;

  for (const line of lines) {
    // Skip headers and totals
    if (line.toLowerCase().includes('opening') ||
        line.toLowerCase().includes('closing') ||
        line.toLowerCase().includes('total') ||
        line.toLowerCase().includes('balance')) {
      continue;
    }

    let date = '';
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        date = parseNZDate(match[1]);
        break;
      }
    }

    if (date) {
      const amounts = line.match(amountPattern);
      if (amounts && amounts.length > 0) {
        // Usually the first amount is the transaction, last is balance
        const amountStr = amounts[0];
        let amount = parseAmount(amountStr.replace('$', ''));

        // Try to extract description (text between date and amount)
        const desc = line.replace(date, '').replace(amountStr, '').trim();

        if (amount !== 0 && desc) {
          const category = categorizeTransaction(desc, amount, '');

          transactions.push({
            id: generateId(),
            date,
            description: cleanDescription(desc),
            rawDescription: desc,
            amount,
            type: amount > 0 ? 'credit' : 'debit',
            category,
            source: filename
          });
        }
      }
    }
  }

  const document: DocumentInfo = {
    id: generateId(),
    filename,
    bank,
    uploadedAt: new Date().toISOString()
  };

  return { transactions, accounts, document };
}

// Helper functions
function parseNZDate(dateStr: string): string {
  if (!dateStr) return '';

  // Handle various formats
  const months: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };

  // DD Mon YYYY or DD Month YYYY
  const match1 = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match1) {
    const [, day, month, year] = match1;
    const m = months[month.toLowerCase()];
    if (m) {
      return `${year}-${m}-${day.padStart(2, '0')}`;
    }
  }

  // DD Mon YY
  const match2 = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{2})/);
  if (match2) {
    const [, day, month, year] = match2;
    const m = months[month.toLowerCase()];
    if (m) {
      const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      return `${fullYear}-${m}-${day.padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY
  const match3 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match3) {
    const [, day, month, year] = match3;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD/MM/YY
  const match4 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (match4) {
    const [, day, month, year] = match4;
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return dateStr;
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
  const cleaned = amountStr.replace(/[$,\s]/g, '').replace('OD', '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function cleanDescription(desc: string): string {
  // Remove card numbers, reference numbers, etc.
  return desc
    .replace(/\d{6}\*+\d+/g, '') // Card numbers like 503646****** 1047
    .replace(/\s+C$/i, '') // Trailing C
    .replace(/\s{2,}/g, ' ') // Multiple spaces
    .trim();
}

export { generateId };
