// tools/seed.mjs — mengunggah data/seed-*.json ke Firestore.
// CARA PAKAI (lihat README.md untuk penjelasan lengkap):
//   1. Isi dulu ../firebase-config.js dengan config asli.
//   2. cd tools && npm install
//   3. node seed.mjs
// Skrip ini memakai Firebase client SDK (bukan Admin SDK) sehingga tidak
// butuh service-account key. PENTING: firestore.rules menutup tulis publik
// (allow write: if false). Untuk seed PERTAMA, longgarkan aturan tulis
// SEMENTARA di Firebase Console (Rules), jalankan skrip ini, lalu
// kembalikan aturan ke semula dan publish lagi. Jangan biarkan aturan
// tulis-terbuka ter-publish lebih lama dari yang perlu.
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config.js";

if (!firebaseConfig.apiKey) {
  console.error("firebase-config.js belum diisi (apiKey kosong). Isi dulu dengan config asli, lalu jalankan lagi.");
  process.exit(1);
}
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const materials = JSON.parse(await readFile(new URL("../data/seed-materials.json", import.meta.url), "utf8"));
const articles = JSON.parse(await readFile(new URL("../data/seed-articles.json", import.meta.url), "utf8"));
const quiz = JSON.parse(await readFile(new URL("../data/seed-quiz.json", import.meta.url), "utf8"));
try {
  for (const m of materials) {
    const { id, ...rest } = m;
    await setDoc(doc(db, "materials", id), rest);
    console.log("materials/" + id);
  }
  for (const a of articles) {
    const { id, ...rest } = a;
    await setDoc(doc(db, "articles", id), rest);
    console.log("articles/" + a.id);
  }
  await setDoc(doc(db, "quiz", quiz.id), { questions: quiz.questions, results: quiz.results });
  console.log("quiz/" + quiz.id);
  console.log("SEED SELESAI.");
} catch (e) {
  console.error("SEED GAGAL:", e.message);
  console.error("Bila pesannya permission-denied, longgarkan dulu aturan tulis di firestore.rules (lihat README.md bagian 'Seed pertama'), lalu jalankan lagi.");
  process.exit(1);
}
