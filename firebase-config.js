// firebase-config.js — konfigurasi web Firebase untuk TemanParenting.
// TODO(Arkasha): isi field yang masih kosong dengan config ASLI dari
// Firebase Console: Project settings > Your apps > Web app (ikon </>) >
// salin objek firebaseConfig. projectId sudah terisi (temanparenting-1e6ca).
// Config web ini memang ditujukan untuk dipakai di sisi klien, jadi aman
// ada di repo. Yang TIDAK BOLEH masuk repo: service-account key (file JSON
// yang diunduh dari Project settings > Service accounts) — itu rahasia.
// Sampai config ini diisi, halaman yang butuh data menampilkan pesan
// "Konfigurasi Firebase belum diisi" dan situs belum bisa dipakai penuh.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "temanparenting-1e6ca",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
