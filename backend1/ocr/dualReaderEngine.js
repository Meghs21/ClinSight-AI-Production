'use strict';

/**
 * dualReaderEngine.js
 * Implements Step 2: Agreement check between two distinct readers (Dual-Reader Verification)
 *
 * Compares Primary Vision Reader (Gemini Multimodal) against Secondary Local Reader (Tesseract).
 * Measures character/token overlap and medication/entity agreement.
 * If readers disagree significantly or both struggle with clarity, the agreement score drops
 * and the document is routed for human clinical review.
 */

function calculateTokenOverlap(textA, textB) {
  if (!textA || !textB) return 0.0;

  const normalize = (t) => t.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const tokensA = new Set(normalize(textA));
  const tokensB = new Set(normalize(textB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  // Jaccard similarity between the two reader outputs
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.0;
}

function calculateMedicationAgreement(medsPrimary, rawSecondaryText) {
  if (!medsPrimary || medsPrimary.length === 0) {
    return {
      confirmedCount: 0,
      totalCount: 0,
      agreementRatio: 1.0, // No meds to disagree on
      unconfirmedMeds: []
    };
  }

  const secondaryLower = (rawSecondaryText || '').toLowerCase();
  let confirmed = 0;
  const unconfirmed = [];

  for (const med of medsPrimary) {
    const medClean = String(med).toLowerCase();
    // Extract root drug tokens (e.g. "dolo", "amoxicillin", "metformin")
    const words = medClean.replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['tablet', 'capsule', 'syrup', 'tabs', 'inj', 'dose'].includes(w));

    const isPresent = words.some(w => secondaryLower.includes(w));
    if (isPresent) {
      confirmed++;
    } else {
      unconfirmed.push(med);
    }
  }

  const ratio = confirmed / medsPrimary.length;
  return {
    confirmedCount: confirmed,
    totalCount: medsPrimary.length,
    agreementRatio: ratio,
    unconfirmedMeds: unconfirmed
  };
}

/**
 * Computes Dual-Reader Agreement Score:
 * Combines full-text semantic token overlap with explicit medication token presence.
 */
function computeReaderAgreement(primaryText, secondaryText, extractedMeds = []) {
  const tokenOverlap = calculateTokenOverlap(primaryText, secondaryText);
  const medAgreement = calculateMedicationAgreement(extractedMeds, secondaryText);

  // If secondary reader produced very little text (e.g. illegible cursive handwriting for Tesseract),
  // agreement is penalised proportionally but doesn't hard-fail if primary vision is strong.
  let agreementScore = 0.5;

  if (!secondaryText || secondaryText.trim().length < 10) {
    // Secondary reader could not decipher handwriting at all
    agreementScore = 0.55;
  } else {
    // Weighted combination: 40% token overlap + 60% critical medication agreement
    agreementScore = (tokenOverlap * 0.4) + (medAgreement.agreementRatio * 0.6);
    agreementScore = Math.min(Math.max(agreementScore, 0.2), 0.98);
  }

  const hasSignificantDisagreement = agreementScore < 0.60 && extractedMeds.length > 0;

  return {
    tokenOverlap: Number(tokenOverlap.toFixed(3)),
    medicationAgreement: medAgreement,
    agreementScore: Number(agreementScore.toFixed(3)),
    confidencePenalty: hasSignificantDisagreement ? 0.35 : 0.0,
    requiresHumanReview: hasSignificantDisagreement,
    reason: hasSignificantDisagreement
      ? `Dual-reader disagreement (Score: ${(agreementScore * 100).toFixed(0)}%). Secondary reader failed to confirm: ${medAgreement.unconfirmedMeds.join(', ') || 'prescribed items'}`
      : `Dual-reader verified (Score: ${(agreementScore * 100).toFixed(0)}%)`
  };
}

module.exports = {
  calculateTokenOverlap,
  calculateMedicationAgreement,
  computeReaderAgreement
};
