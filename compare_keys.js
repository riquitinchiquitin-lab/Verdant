import fs from 'fs';

const content = fs.readFileSync('/context/LanguageContext.tsx', 'utf8');

const extractKeys = (langCode) => {
  const regex = new RegExp(`${langCode}: \\{([\\s\\S]*?)\\},`, 'm');
  const match = content.match(regex);
  if (!match) return [];
  const lines = match[1].split('\n');
  return lines
    .map(line => line.trim())
    .filter(line => line.includes(':'))
    .map(line => line.split(':')[0].trim());
};

const enKeys = extractKeys('en');
const zhKeys = extractKeys('zh');
const jaKeys = extractKeys('ja');
const tlKeys = extractKeys('tl');

console.log('EN Keys:', enKeys.length);
console.log('ZH Keys:', zhKeys.length);
console.log('JA Keys:', jaKeys.length);
console.log('TL Keys:', tlKeys.length);

const allKeys = Array.from(new Set([...enKeys, ...zhKeys, ...jaKeys, ...tlKeys]));

const missing = {
  zh: allKeys.filter(k => !zhKeys.includes(k)),
  ja: allKeys.filter(k => !jaKeys.includes(k)),
  tl: allKeys.filter(k => !tlKeys.includes(k)),
  en: allKeys.filter(k => !enKeys.includes(k))
};

console.log('Missing in ZH:', missing.zh);
console.log('Missing in JA:', missing.ja);
console.log('Missing in TL:', missing.tl);
console.log('Missing in EN:', missing.en);
