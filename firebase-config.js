// firebase-config.js — konfigurasi web Firebase untuk TemanParenting.
// Diisi 13 Nov 2026 dari Firebase Console (Project settings > Your apps >
// Web app). Config web ini memang ditujukan untuk dipakai di sisi klien,
// jadi aman ada di repo. Yang TIDAK BOLEH masuk repo: service-account key
// (file JSON dari Project settings > Service accounts) — itu rahasia.
export const firebaseConfig = {
  apiKey: "AIzaSyAxGb-uP9TFKHNwfs8-EkzvcIPN22nQP24",
  authDomain: "temanparenting-1e6ca.firebaseapp.com",
  projectId: "temanparenting-1e6ca",
  storageBucket: "temanparenting-1e6ca.firebasestorage.app",
  messagingSenderId: "343342685143",
  appId: "1:343342685143:web:c0c36b7d258131b52c0992"
};
