// Native builds never load jsPDF (the slip is made with expo-print there).
// Metro picks jspdfLoader.web.js for Expo web.
export const jsPDF = null;
