/**
 * Simple lightweight translation dictionary for MED-GUARD.
 * Supports English ('en') and Telugu ('te') for Patient Kiosk & Prescriptions.
 */

const translations = {
  en: {
    // Kiosk
    kioskTitle: 'Patient Confirmation',
    kioskSubtitle: 'Did you consult the doctor today? Please enter your OPD token.',
    opdTokenPlaceholder: 'e.g. 001',
    continue: 'Continue',
    didYouConsult: 'Did you consult the doctor today?',
    yesConsulted: 'YES — I met the doctor',
    noDidNotConsult: 'NO — I did not meet the doctor',
    optionalFeedback: 'Feedback (Optional)',
    staffAssisting: 'Staff is assisting this patient',
    staffId: 'Staff ID',
    staffPin: 'Staff PIN',
    cancel: 'Cancel',
    recordedSuccess: 'Confirmation recorded successfully!',
    recordedDispute: 'Dispute recorded. Hospital admin notified.',
    // Roles & General
    patient: 'Patient',
    doctor: 'Doctor',
    reception: 'Reception',
    admin: 'Admin',
    token: 'Token',
    status: 'Status',
    language: 'Language / భాష',
    // Prescription
    rxTitle: 'Prescription & Advice',
    adviceOnly: 'Advice only — no medicines prescribed.',
    morning: 'Morning',
    afternoon: 'Afternoon',
    night: 'Night',
    afterFood: 'After food',
    days: 'days',
    qty: 'Qty',
    keepPaper: 'Keep this paper prescription for reference.',
  },
  te: {
    // Kiosk
    kioskTitle: 'రోగి ధృవీకరణ (Patient Confirmation)',
    kioskSubtitle: 'మీరు ఈరోజు డాక్టర్‌ను కలిశారా? దయచేసి మీ OPD టోకెన్ సంఖ్యను నమోదు చేయండి.',
    opdTokenPlaceholder: 'ఉదా. 001',
    continue: 'ముందుకు సాగండి (Continue)',
    didYouConsult: 'మీరు ఈరోజు డాక్టర్‌ను సంప్రదించారా?',
    yesConsulted: 'అవును — నేను డాక్టర్‌ను కలిశాను',
    noDidNotConsult: 'లేదు — నేను డాక్టర్‌ను కలవలేదు',
    optionalFeedback: 'అభిప్రాయం (ఐచ్ఛికం)',
    staffAssisting: 'సిబ్బంది రోగికి సహాయం చేస్తున్నారు',
    staffId: 'సిబ్బంది ఐడీ (Staff ID)',
    staffPin: 'సిబ్బంది పిన్ (Staff PIN)',
    cancel: 'రద్దు చేయి (Cancel)',
    recordedSuccess: 'ధృవీకరణ విజయవంతంగా నమోదైంది!',
    recordedDispute: 'ఫిర్యాదు నమోదైంది. అడ్మిన్‌కు తెలియజేయబడింది.',
    // Roles & General
    patient: 'రోగి',
    doctor: 'డాక్టర్',
    reception: 'రిసెప్షన్',
    admin: 'అడ్మిన్',
    token: 'టోకెన్',
    status: 'స్థితి',
    language: 'Language / భాష',
    // Prescription
    rxTitle: 'మందుల చీటీ (Prescription & Advice)',
    adviceOnly: 'సలహా మాత్రమే — మందులు సూచించబడలేదు.',
    morning: 'ఉదయం (Morning)',
    afternoon: 'మధ్యాహ్నం (Afternoon)',
    night: 'రాత్రి (Night)',
    afterFood: 'భోజనం తర్వాత (After food)',
    days: 'రోజులు',
    qty: 'పరిమాణం',
    keepPaper: 'దయచేసి ఈ మందుల చీటీని మీ వద్ద ఉంచుకోండి.',
  },
};

export function getTranslation(lang = 'en') {
  return translations[lang] || translations.en;
}
