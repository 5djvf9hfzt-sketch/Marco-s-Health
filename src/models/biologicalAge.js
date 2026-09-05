/**
 * ============================================================================
 *  BIOLOGICAL AGE MODUL
 * ============================================================================
 *
 * Dieses Modul berechnet ein geschätztes "biologisches Alter" aus:
 *   1. dem chronologischen Alter (manuell im Onboarding eingegeben),
 *   2. automatisch aus Fitbit geladenen Vitalwerten (gemittelt über ein
 *      Zeitfenster, typischerweise die letzten 30 Tage),
 *   3. manuell im Lifestyle-Fragebogen eingegebenen Faktoren
 *      (Rauchen, Alkohol, Ernährung, Stress).
 *
 * WICHTIGER HINWEIS ZUR WISSENSCHAFTLICHKEIT:
 * Die Referenzbereiche und Jahres-Zu-/Abschläge unten sind GROBE,
 * vereinfachte Anhaltspunkte, lose inspiriert von öffentlich bekannten
 * epidemiologischen Trends (z.B. WHO-Einordnungen zu Rauchen/Alkohol,
 * publizierte Zusammenhänge zwischen Ruhepuls/HRV/VO2max und
 * Gesamtmortalität/Alterung). Sie sind KEIN validierter klinischer
 * Biological-Age-Algorithmus, beruhen auf keiner einzelnen Studie und wurden
 * nicht wissenschaftlich kalibriert. Das Ergebnis ist ein Schätzwert zur
 * Selbstreflexion – KEIN medizinischer Rat, keine Diagnose (siehe
 * Disclaimer-Komponente, die auf jedem Screen mit Bio-Age sichtbar ist).
 *
 * WARUM ALLES HIER IN EINEM MODUL:
 * Jede Zahl, die das Ergebnis beeinflusst, steht in BIOLOGICAL_AGE_CONFIG
 * weiter unten. Wer Gewichtungen/Schwellenwerte anpassen möchte, muss NUR
 * diesen Config-Block bearbeiten – die Berechnungslogik darunter bleibt
 * unverändert und muss nicht verstanden werden, um z.B. den
 * Rauchen-Malus zu ändern.
 *
 * FUNKTIONSPRINZIP pro Faktor:
 * Jeder Faktor definiert eine Liste von Stützpunkten [{ value, years }],
 * aufsteigend nach "value" sortiert. Der tatsächliche Messwert wird
 * zwischen den beiden nächstgelegenen Stützpunkten LINEAR interpoliert.
 * Werte außerhalb des definierten Bereichs werden auf den Rand geklemmt
 * (kein Extrapolieren ins Unbegrenzte – ein Ruhepuls von 200 soll nicht zu
 * absurden +50 Jahren führen).
 * "years" ist der Jahres-BEITRAG zum biologischen Alter: positiv = altert
 * schneller (schlechter als Referenz), negativ = altert langsamer (besser).
 */

// ---------------------------------------------------------------------------
// KONFIGURATION – hier anpassen, ohne den Rest der Datei zu verstehen.
// ---------------------------------------------------------------------------

export const BIOLOGICAL_AGE_CONFIG = {
  // Ab wie vielen Tagen mit Fitbit-Daten gilt die Berechnung als
  // "verlässlich genug" (Confidence-Indikator). Vorher: "niedrig".
  confidence: {
    lowBelowDays: 20,
    mediumBelowDays: 60, // ab hier "hoch"
  },

  categories: {
    cardiovascular: {
      label: "Herz-Kreislauf",
      factors: {
        restingHeartRate: {
          label: "Ruhepuls",
          unit: "bpm",
          // Niedriger Ruhepuls (trainiertes Herz) = negativer (guter) Beitrag.
          breakpoints: [
            { value: 40, years: -3 },
            { value: 50, years: -1.5 },
            { value: 60, years: 0 },
            { value: 70, years: 2 },
            { value: 80, years: 4 },
            { value: 90, years: 7 },
            { value: 100, years: 10 },
          ],
        },
        hrv: {
          label: "Herzratenvariabilität (HRV, RMSSD)",
          unit: "ms",
          // Höhere HRV = besser (autonomes Nervensystem, Erholungsfähigkeit).
          breakpoints: [
            { value: 15, years: 4 },
            { value: 25, years: 2 },
            { value: 35, years: 1 },
            { value: 45, years: 0 },
            { value: 60, years: -1.5 },
            { value: 80, years: -3 },
            { value: 100, years: -4 },
          ],
        },
        cardioFitness: {
          label: "Cardio Fitness Score (VO2max-Schätzung)",
          unit: "ml/kg/min",
          // Hinweis: VO2max ist stark alters- und geschlechtsabhängig zu
          // interpretieren. Diese Breakpoints sind ein vereinfachter,
          // altersunabhängiger Default – für mehr Präzision könnten hier
          // später alters-/geschlechtsspezifische Tabellen ergänzt werden,
          // ohne die Berechnungslogik anzufassen.
          breakpoints: [
            { value: 20, years: 6 },
            { value: 30, years: 3 },
            { value: 40, years: 0 },
            { value: 50, years: -3 },
            { value: 60, years: -6 },
            { value: 70, years: -8 },
          ],
        },
      },
    },

    sleep: {
      label: "Schlaf",
      factors: {
        duration: {
          label: "Schlafdauer",
          unit: "h/Nacht",
          // U-förmig: sowohl zu wenig als auch zu viel Schlaf ist in der
          // Literatur mit höherer Mortalität assoziiert.
          breakpoints: [
            { value: 4, years: 4 },
            { value: 5, years: 2 },
            { value: 6, years: 1 },
            { value: 7, years: 0 },
            { value: 8, years: -1 },
            { value: 9, years: 0.5 },
            { value: 10, years: 2 },
          ],
        },
        efficiency: {
          label: "Schlafeffizienz",
          unit: "%",
          breakpoints: [
            { value: 70, years: 2 },
            { value: 80, years: 1 },
            { value: 85, years: 0.5 },
            { value: 90, years: 0 },
            { value: 95, years: -1 },
          ],
        },
        consistency: {
          label: "Schlaf-Konsistenz (7-Tage)",
          unit: "Minuten Standardabweichung der Einschlafzeit",
          // Niedrige Standardabweichung = regelmäßiger Rhythmus = besser.
          breakpoints: [
            { value: 0, years: -1 },
            { value: 30, years: 0 },
            { value: 60, years: 0.5 },
            { value: 120, years: 1 },
            { value: 180, years: 2 },
          ],
        },
      },
    },

    activity: {
      label: "Aktivität",
      factors: {
        activeMinutes: {
          label: "Moderate/intensive Aktivität",
          unit: "min/Woche",
          // Orientiert an der WHO-Empfehlung von 150min moderater bzw.
          // 75min intensiver Aktivität pro Woche als Referenzpunkt "0".
          breakpoints: [
            { value: 0, years: 3 },
            { value: 75, years: 1.5 },
            { value: 150, years: 0 },
            { value: 300, years: -1.5 },
            { value: 450, years: -2.5 },
          ],
        },
        steps: {
          label: "Tägliche Schritte",
          unit: "Schritte/Tag",
          // Kleinerer Zusatzfaktor neben activeMinutes (Vermeidung von
          // Doppelgewichtung reiner Alltagsbewegung vs. Trainingsintensität).
          breakpoints: [
            { value: 2000, years: 1.5 },
            { value: 5000, years: 0.5 },
            { value: 8000, years: 0 },
            { value: 10000, years: -0.5 },
            { value: 12000, years: -1 },
          ],
        },
      },
    },

    respiratory: {
      label: "Atmung / Sauerstoff",
      factors: {
        spo2: {
          label: "Sauerstoffsättigung (SpO2, Schlaf-Ø)",
          unit: "%",
          breakpoints: [
            { value: 88, years: 3 },
            { value: 92, years: 1.5 },
            { value: 95, years: 0.5 },
            { value: 97, years: 0 },
          ],
        },
        breathingRate: {
          label: "Atemfrequenz (Schlaf-Ø)",
          unit: "Atemzüge/min",
          breakpoints: [
            { value: 12, years: -0.5 },
            { value: 16, years: 0 },
            { value: 18, years: 0.5 },
            { value: 22, years: 1.5 },
            { value: 26, years: 3 },
          ],
        },
      },
    },

    lifestyle: {
      label: "Lifestyle",
      factors: {
        // Rauchen wird speziell behandelt (siehe computeSmokingYears unten),
        // da es vom kategorialen Status (nie/früher/aktuell) UND, im Fall
        // "aktuell", zusätzlich von Zigaretten/Tag abhängt.
        smoking: {
          label: "Rauchen",
          unit: "Status",
          neverYears: 0,
          formerYears: 1.5,
          // Zigaretten/Tag -> Jahres-Malus bei aktuellem Rauchen.
          currentBreakpointsByCigsPerDay: [
            { value: 1, years: 3 },
            { value: 5, years: 3 },
            { value: 10, years: 5 },
            { value: 20, years: 7 },
            { value: 40, years: 9 },
            { value: 60, years: 10 },
          ],
        },
        alcohol: {
          label: "Alkohol",
          unit: "Einheiten/Woche",
          breakpoints: [
            { value: 0, years: 0 },
            { value: 7, years: 0.5 },
            { value: 14, years: 1.5 },
            { value: 21, years: 3 },
            { value: 28, years: 5 },
            { value: 35, years: 7 },
          ],
        },
        diet: {
          label: "Ernährungsqualität",
          unit: "Score 1 (schlecht) – 5 (sehr gut)",
          breakpoints: [
            { value: 1, years: 3 },
            { value: 2, years: 1.5 },
            { value: 3, years: 0 },
            { value: 4, years: -1 },
            { value: 5, years: -2 },
          ],
        },
        stress: {
          label: "Subjektives Stresslevel",
          unit: "Score 1 (niedrig) – 5 (hoch)",
          breakpoints: [
            { value: 1, years: -1 },
            { value: 2, years: -0.3 },
            { value: 3, years: 0 },
            { value: 4, years: 1.5 },
            { value: 5, years: 3 },
          ],
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// BERECHNUNGSLOGIK – ab hier normalerweise nichts anpassen.
// ---------------------------------------------------------------------------

/** Lineare Interpolation zwischen den Stützpunkten, geklemmt an den Rändern. */
function interpolateYears(value, breakpoints) {
  if (value == null || !Number.isFinite(value)) return null;
  const sorted = breakpoints; // Konfiguration ist bereits aufsteigend sortiert.

  if (value <= sorted[0].value) return sorted[0].years;
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].years;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lower = sorted[i];
    const upper = sorted[i + 1];
    if (value >= lower.value && value <= upper.value) {
      const ratio = (value - lower.value) / (upper.value - lower.value);
      return lower.years + ratio * (upper.years - lower.years);
    }
  }
  return 0;
}

function computeSmokingYears(smokingConfig, lifestyle) {
  if (!lifestyle) return null;
  switch (lifestyle.smokingStatus) {
    case "never":
      return smokingConfig.neverYears;
    case "former":
      return smokingConfig.formerYears;
    case "current":
      return interpolateYears(lifestyle.cigarettesPerDay ?? 10, smokingConfig.currentBreakpointsByCigsPerDay);
    default:
      return null;
  }
}

/**
 * Berechnet das biologische Alter.
 *
 * @param {object} input
 * @param {number} input.chronologicalAge
 * @param {number} [input.avgRestingHeartRate]
 * @param {number} [input.avgHrv]
 * @param {number} [input.avgCardioFitness]
 * @param {number} [input.avgSleepDurationHours]
 * @param {number} [input.avgSleepEfficiency]
 * @param {number} [input.sleepConsistencyStdDevMinutes]
 * @param {number} [input.weeklyActiveMinutes]
 * @param {number} [input.avgSteps]
 * @param {number} [input.avgSpo2]
 * @param {number} [input.avgBreathingRate]
 * @param {object} [input.lifestyle] { smokingStatus, cigarettesPerDay, alcoholUnitsPerWeek, dietScore, stressLevel }
 * @param {number} input.daysOfData Anzahl Tage mit mind. einem Fitbit-Messwert (für Confidence).
 *
 * @returns {{
 *   biologicalAge: number,
 *   deltaYears: number,
 *   confidence: "low"|"medium"|"high",
 *   breakdown: Array<{ categoryKey: string, categoryLabel: string, factorKey: string, label: string, years: number|null, inputValue: number|string|null }>
 * }}
 */
export function computeBiologicalAge(input) {
  const cfg = BIOLOGICAL_AGE_CONFIG;
  const breakdown = [];

  const addFactor = (categoryKey, categoryLabel, factorKey, factorLabel, years, inputValue) => {
    breakdown.push({ categoryKey, categoryLabel, factorKey, label: factorLabel, years, inputValue });
  };

  const cardio = cfg.categories.cardiovascular.factors;
  addFactor(
    "cardiovascular",
    cfg.categories.cardiovascular.label,
    "restingHeartRate",
    cardio.restingHeartRate.label,
    interpolateYears(input.avgRestingHeartRate, cardio.restingHeartRate.breakpoints),
    input.avgRestingHeartRate ?? null
  );
  addFactor(
    "cardiovascular",
    cfg.categories.cardiovascular.label,
    "hrv",
    cardio.hrv.label,
    interpolateYears(input.avgHrv, cardio.hrv.breakpoints),
    input.avgHrv ?? null
  );
  addFactor(
    "cardiovascular",
    cfg.categories.cardiovascular.label,
    "cardioFitness",
    cardio.cardioFitness.label,
    interpolateYears(input.avgCardioFitness, cardio.cardioFitness.breakpoints),
    input.avgCardioFitness ?? null
  );

  const sleep = cfg.categories.sleep.factors;
  addFactor(
    "sleep",
    cfg.categories.sleep.label,
    "duration",
    sleep.duration.label,
    interpolateYears(input.avgSleepDurationHours, sleep.duration.breakpoints),
    input.avgSleepDurationHours ?? null
  );
  addFactor(
    "sleep",
    cfg.categories.sleep.label,
    "efficiency",
    sleep.efficiency.label,
    interpolateYears(input.avgSleepEfficiency, sleep.efficiency.breakpoints),
    input.avgSleepEfficiency ?? null
  );
  addFactor(
    "sleep",
    cfg.categories.sleep.label,
    "consistency",
    sleep.consistency.label,
    interpolateYears(input.sleepConsistencyStdDevMinutes, sleep.consistency.breakpoints),
    input.sleepConsistencyStdDevMinutes ?? null
  );

  const activity = cfg.categories.activity.factors;
  addFactor(
    "activity",
    cfg.categories.activity.label,
    "activeMinutes",
    activity.activeMinutes.label,
    interpolateYears(input.weeklyActiveMinutes, activity.activeMinutes.breakpoints),
    input.weeklyActiveMinutes ?? null
  );
  addFactor(
    "activity",
    cfg.categories.activity.label,
    "steps",
    activity.steps.label,
    interpolateYears(input.avgSteps, activity.steps.breakpoints),
    input.avgSteps ?? null
  );

  const respiratory = cfg.categories.respiratory.factors;
  addFactor(
    "respiratory",
    cfg.categories.respiratory.label,
    "spo2",
    respiratory.spo2.label,
    interpolateYears(input.avgSpo2, respiratory.spo2.breakpoints),
    input.avgSpo2 ?? null
  );
  addFactor(
    "respiratory",
    cfg.categories.respiratory.label,
    "breathingRate",
    respiratory.breathingRate.label,
    interpolateYears(input.avgBreathingRate, respiratory.breathingRate.breakpoints),
    input.avgBreathingRate ?? null
  );

  const lifestyleFactors = cfg.categories.lifestyle.factors;
  addFactor(
    "lifestyle",
    cfg.categories.lifestyle.label,
    "smoking",
    lifestyleFactors.smoking.label,
    computeSmokingYears(lifestyleFactors.smoking, input.lifestyle),
    input.lifestyle?.smokingStatus ?? null
  );
  addFactor(
    "lifestyle",
    cfg.categories.lifestyle.label,
    "alcohol",
    lifestyleFactors.alcohol.label,
    interpolateYears(input.lifestyle?.alcoholUnitsPerWeek, lifestyleFactors.alcohol.breakpoints),
    input.lifestyle?.alcoholUnitsPerWeek ?? null
  );
  addFactor(
    "lifestyle",
    cfg.categories.lifestyle.label,
    "diet",
    lifestyleFactors.diet.label,
    interpolateYears(input.lifestyle?.dietScore, lifestyleFactors.diet.breakpoints),
    input.lifestyle?.dietScore ?? null
  );
  addFactor(
    "lifestyle",
    cfg.categories.lifestyle.label,
    "stress",
    lifestyleFactors.stress.label,
    interpolateYears(input.lifestyle?.stressLevel, lifestyleFactors.stress.breakpoints),
    input.lifestyle?.stressLevel ?? null
  );

  const deltaYears = breakdown.reduce((sum, f) => sum + (f.years ?? 0), 0);
  const biologicalAge = Math.round((input.chronologicalAge + deltaYears) * 10) / 10;

  const confidence =
    input.daysOfData < cfg.confidence.lowBelowDays
      ? "low"
      : input.daysOfData < cfg.confidence.mediumBelowDays
        ? "medium"
        : "high";

  return {
    biologicalAge,
    deltaYears: Math.round(deltaYears * 10) / 10,
    confidence,
    breakdown,
  };
}

/** Aggregiert Kategorie-Summen aus dem Breakdown, für die "Faktor-Breakdown"-Ansicht. */
export function summarizeByCategory(breakdown) {
  const byCategory = new Map();
  for (const item of breakdown) {
    const prev = byCategory.get(item.categoryKey) ?? { categoryLabel: item.categoryLabel, years: 0, factors: [] };
    prev.years += item.years ?? 0;
    prev.factors.push(item);
    byCategory.set(item.categoryKey, prev);
  }
  return Array.from(byCategory.entries()).map(([categoryKey, data]) => ({
    categoryKey,
    ...data,
    years: Math.round(data.years * 10) / 10,
  }));
}
