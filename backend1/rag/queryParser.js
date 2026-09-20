'use strict';

/**
 * queryParser.js
 * Extracts structured clinical constraints from free-text user queries.
 * Handles:
 *   - Dates: exact dates (YYYY-MM-DD, Month Day YYYY, etc.), Month/Year (February 2026)
 *   - Sections: lab, medication, visit, patient_profile
 *   - Biomarkers / Lab Tests: creatinine, hba1c, egfr, blood pressure, glucose, etc.
 *   - Medications: drug names, dosage queries
 *   - Temporal intent: trend, history, over time, latest, earliest
 */

const MONTHS = {
  january: '01', jan: '01',
  february: '02', feb: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  may: '05',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08',
  september: '09', sep: '09', sept: '09',
  october: '10', oct: '10',
  november: '11', nov: '11',
  december: '12', dec: '12'
};

const COMMON_BIOMARKERS = [
  { name: 'creatinine', aliases: ['creatinine', 'serum creatinine', 'creat', 'sr creatinine'] },
  { name: 'hba1c', aliases: ['hba1c', 'a1c', 'glycated hemoglobin', 'hemoglobin a1c'] },
  { name: 'egfr', aliases: ['egfr', 'gfr', 'glomerular filtration rate'] },
  { name: 'blood pressure', aliases: ['blood pressure', 'bp', 'systolic', 'diastolic', 'hypertension'] },
  { name: 'glucose', aliases: ['glucose', 'blood sugar', 'fasting glucose', 'fbs', 'ppbs'] },
  { name: 'hemoglobin', aliases: ['hemoglobin', 'haemoglobin', 'hb'] },
  { name: 'cholesterol', aliases: ['cholesterol', 'ldl', 'hdl', 'triglycerides', 'lipid'] },
  { name: 'potassium', aliases: ['potassium', 'k+'] },
  { name: 'sodium', aliases: ['sodium', 'na+'] },
  { name: 'ast', aliases: ['ast', 'sgot'] },
  { name: 'alt', aliases: ['alt', 'sgpt'] },
  { name: 'microalbumin', aliases: ['microalbumin', 'urine albumin', 'acr', 'albuminuria'] }
];

const COMMON_MEDS = [
  'metformin', 'amlodipine', 'simvastatin', 'atorvastatin', 'lipitor',
  'aspirin', 'ecosprin', 'lisinopril', 'ramipril', 'losartan', 'telmisartan',
  'glycomet', 'pan 40', 'pantoprazole', 'insulin', 'glargine', 'sitagliptin',
  'januvia', 'augmentin', 'amoxicillin'
];

function extractDate(text) {
  const clean = text.toLowerCase();

  // Pattern 1: ISO YYYY-MM-DD
  const isoMatch = clean.match(/\b(19\d\d|20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return { exactDate: isoMatch[0], monthYear: `${isoMatch[1]}-${isoMatch[2]}` };
  }

  // Pattern 2: "February 8 2026", "Feb 8, 2026", "8 February 2026", "8th Feb 2026"
  const monthNames = Object.keys(MONTHS).join('|');
  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(19\\d\\d|20\\d\\d)\\b`, 'i');
  const mdyMatch = clean.match(monthDayYear);
  if (mdyMatch) {
    const month = MONTHS[mdyMatch[1].toLowerCase()];
    const day = mdyMatch[2].padStart(2, '0');
    const year = mdyMatch[3];
    return { exactDate: `${year}-${month}-${day}`, monthYear: `${year}-${month}` };
  }

  const dayMonthYear = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})(?:,)?\\s+(19\\d\\d|20\\d\\d)\\b`, 'i');
  const dmyMatch = clean.match(dayMonthYear);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = MONTHS[dmyMatch[2].toLowerCase()];
    const year = dmyMatch[3];
    return { exactDate: `${year}-${month}-${day}`, monthYear: `${year}-${month}` };
  }

  // Pattern 3: Month and Year only (e.g. "February 2026", "Feb 2026", "2026-02")
  const monthYearOnly = new RegExp(`\\b(${monthNames})\\s+(19\\d\\d|20\\d\\d)\\b`, 'i');
  const myMatch = clean.match(monthYearOnly);
  if (myMatch) {
    const month = MONTHS[myMatch[1].toLowerCase()];
    const year = myMatch[2];
    return { exactDate: null, monthYear: `${year}-${month}` };
  }

  const isoYearMonth = clean.match(/\b(19\d\d|20\d\d)-(0[1-9]|1[0-2])\b/);
  if (isoYearMonth) {
    return { exactDate: null, monthYear: isoYearMonth[0] };
  }

  return { exactDate: null, monthYear: null };
}

function parseClinicalQuery(query = '') {
  const clean = String(query || '').toLowerCase();

  // 1. Extract dates
  const { exactDate, monthYear } = extractDate(clean);

  // 2. Extract Biomarker
  let detectedBiomarker = null;
  for (const b of COMMON_BIOMARKERS) {
    for (const alias of b.aliases) {
      const regex = new RegExp(`\\b${alias.replace(/\+/g, '\\+')}\\b`, 'i');
      if (regex.test(clean)) {
        detectedBiomarker = b.name;
        break;
      }
    }
    if (detectedBiomarker) break;
  }

  // 3. Extract Medication
  let detectedMed = null;
  for (const m of COMMON_MEDS) {
    const regex = new RegExp(`\\b${m}\\b`, 'i');
    if (regex.test(clean)) {
      detectedMed = m;
      break;
    }
  }

  // 4. Determine primary section intent
  let section = null;
  if (detectedBiomarker || /\b(lab|labs|test|tests|results?|level|levels|value|reading|panel)\b/i.test(clean)) {
    section = 'lab';
  } else if (detectedMed || /\b(med|meds|medication|medications|drug|drugs|prescription|prescribed|dose|dosage)\b/i.test(clean)) {
    section = 'medication';
  } else if (/\b(visit|visits|consult|consultation|doctor|appointment|encounter|notes?|symptoms?|complaint)\b/i.test(clean)) {
    section = 'visit';
  } else if (/\b(age|gender|allergy|allergies|diagnosis|diagnoses|profile|contact|address)\b/i.test(clean)) {
    section = 'patient_profile';
  }

  // 5. Detect Trend / Chronological intent
  const isTrendQuery = /\b(trend|trends|over time|history|trajectory|timeline|progression|all results|serial|longitudinal|previous values)\b/i.test(clean);

  // 6. Detect latest / recent intent
  const isLatestIntent = /\b(latest|most recent|current|last|newest)\b/i.test(clean);

  return {
    rawQuery: query,
    exactDate,
    monthYear,
    section,
    biomarker: detectedBiomarker,
    medication: detectedMed,
    isTrendQuery,
    isLatestIntent,
  };
}

module.exports = { parseClinicalQuery, extractDate };
