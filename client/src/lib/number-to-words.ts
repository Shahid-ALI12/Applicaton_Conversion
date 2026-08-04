/**
 * Convert a number to English words using the Pakistani (Lakh / Crore) numbering system.
 * Examples:
 *   0           → "Zero Rupees Only"
 *   15          → "Fifteen Rupees Only"
 *   100         → "One Hundred Rupees Only"
 *   1,000       → "One Thousand Rupees Only"
 *   10,000      → "Ten Thousand Rupees Only"  (NOT "Ten Thousand" — this is "one lakh" territory)
 *   1,00,000    → "One Lakh Rupees Only"
 *   10,00,000   → "Ten Lakh Rupees Only"
 *   1,00,00,000 → "One Crore Rupees Only"
 *
 * For display purposes the caller can strip "Rupees Only" if they want raw words.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

/** Convert a number < 1000 to words (no trailing space) */
function belowThousand(n: number): string {
  if (n >= 1000) return ""; // safety
  if (n === 0) return "";
  let words = "";
  if (n >= 100) {
    words += ONES[Math.floor(n / 100)] + " Hundred";
    n %= 100;
    if (n > 0) words += " ";
  }
  if (n >= 20) {
    words += TENS[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) words += " " + ONES[n];
  } else if (n > 0) {
    words += ONES[n];
  }
  return words;
}

/**
 * Convert an integer to English words (Indian/Pakistani system: lakh, crore).
 * Returns empty string for 0.
 */
function intToWords(n: number): string {
  if (n === 0) return "Zero";

  const parts: string[] = [];

  // Crore (10,000,000)
  if (n >= 10_000_000) {
    parts.push(belowThousand(Math.floor(n / 10_000_000)) + " Crore");
    n %= 10_000_000;
  }

  // Lakh (100,000)
  if (n >= 100_000) {
    const lakhVal = Math.floor(n / 100_000);
    if (lakhVal > 0) {
      parts.push(belowThousand(lakhVal) + " Lakh");
    }
    n %= 100_000;
  }

  // Thousand (1,000)
  if (n >= 1_000) {
    const thousandVal = Math.floor(n / 1_000);
    if (thousandVal > 0) {
      parts.push(belowThousand(thousandVal) + " Thousand");
    }
    n %= 1_000;
  }

  // Below 1000
  if (n > 0) {
    parts.push(belowThousand(n));
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Convert a number (can have decimals) to full English words with "Rupees ... Only".
 * Handles up to 2 decimal places for paisa.
 */
export function numberToRupeeWords(amount: number): string {
  if (amount === 0) return "Zero Rupees Only";

  const isNeg = amount < 0;
  if (isNeg) amount = Math.abs(amount);

  const rupees = Math.floor(amount);
  const paisa = Math.round((amount - rupees) * 100);

  let words = intToWords(rupees) + " Rupees";

  if (paisa > 0) {
    words += " and " + intToWords(paisa) + " Paisa";
  }

  words += " Only";
  if (isNeg) words = "Minus " + words;

  return words;
}

/**
 * Convert a number to English counting words WITHOUT "Rupees Only" suffix.
 * Useful for labels / tooltips.
 */
export function numberToWords(amount: number): string {
  if (amount === 0) return "Zero";
  const isNeg = amount < 0;
  if (isNeg) amount = Math.abs(amount);

  const rupees = Math.floor(amount);
  const paisa = Math.round((amount - rupees) * 100);

  let words = intToWords(rupees);

  if (paisa > 0) {
    words += " Point " + intToWords(paisa);
  }

  if (isNeg) words = "Minus " + words;
  return words;
}