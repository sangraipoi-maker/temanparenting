# TemanParenting — Website Edukasi Positive Parenting

Website beneran TemanParenting: materi pengasuhan per kelompok usia (0–5, 6–12,
13–18 tahun), artikel & tips, dan kuis refleksi gaya respons. Datanya tinggal
di **Firestore**, kodenya di repo ini — jadi bisa diedit langsung, tanpa build
step (HTML + CSS + JS biasa, Firebase JS SDK v10 dari CDN).

Seluruh isi materi dan artikel bersumber dari **satu acuan saja**: Santrock
(2018), *A Topical Approach to Life-Span Development* (9th ed.). Setiap materi
mencantumkan bab acuannya. Konten di repo ini dipindahkan apa adanya dari
prototipe 12 Nov 2026 — tidak ada materi, artikel, atau soal kuis baru.

## Struktur folder

```
index.html            Beranda (hero, kartu usia, 4 prinsip, materi & artikel pilihan, kuis)
materi.html           Daftar materi + filter usia/domain + pencarian
materi-detail.html    Detail satu materi (?id=m1 … m12)
artikel.html          Daftar artikel
artikel-detail.html   Baca satu artikel (?id=a1 … a6)
tentang.html          Tentang rancangan, metode, tim penyusun, daftar acuan
kuis.html             Kuis refleksi 5 situasi (skor client-side, tanpa login)
app.js                Semua logika: baca Firestore, render kartu/detail, filter, kuis
firebase-config.js    Config web Firebase (PLACEHOLDER — isi dulu, lihat bawah)
styles.css            CSS dari prototipe (apa adanya)
firebase.json         Config Hosting (public ".", cleanUrls) + Firestore rules
firestore.rules       Baca publik, tulis ditutup
assets/img/           10 foto dari prototipe (dipakai ulang di beberapa tempat)
assets/favicon.svg    Logo hati dari prototipe
data/seed-*.json      Isi Firestore: 12 materi, 6 artikel, kuis (5 soal + 3 pita hasil)
tools/seed.mjs        Skrip mengunggah data seed ke Firestore
```

## Langkah 1 — Isi firebase-config.js

Config ini **belum diisi** (hanya `projectId: "temanparenting-1e6ca"` yang
sudah benar). Tanpa config asli, halaman menampilkan pesan "Konfigurasi
Firebase belum diisi".

1. Buka [Firebase Console](https://console.firebase.google.com), pilih project
   **TemanParenting**.
2. Klik ikon gerigi → **Project settings** → bagian **Your apps**.
3. Kalau belum ada aplikasi web, klik ikon `</>` (Web), beri nama
   `temanparenting-web`, lalu **Register app**.
4. Salin objek `firebaseConfig` yang tampil, tempel ke `firebase-config.js`
   menggantikan field yang masih kosong.

Config web ini memang ditujukan untuk dipakai di sisi klien, jadi aman ada di
repo. Yang **tidak boleh** masuk repo: service-account key (file JSON dari
Project settings → Service accounts) — itu rahasia.

## Langkah 2 — Buat database Firestore + pasang rules

1. Di Firebase Console: **Build → Firestore Database → Create database**.
2. Pilih **Production mode**, lokasi **asia-southeast2** (Jakarta), **Enable**.
3. Install Firebase CLI (sekali saja) lalu login:
   - `npm install -g firebase-tools`
   - `firebase login`
4. Dari folder repo ini, pasang rules:
   - `firebase deploy --only firestore`

Rules di `firestore.rules`: semua orang boleh **membaca**, tidak ada yang boleh
**menulis** dari klien. Penulisan data hanya lewat skrip seed di bawah.

## Langkah 3 — Seed pertama (unggah data ke Firestore)

Aturan di atas menutup tulis, jadi seed pertama butuh pelonggaran sementara:

1. Di Firebase Console: **Firestore Database → Rules**. Ubah ketiga
   `allow write: if false;` menjadi `allow write: if true;`, klik **Publish**.
2. Di terminal:
   - `cd tools`
   - `npm install`
   - `node seed.mjs`
   - Harusnya muncul `materials/m1` … `materials/m12`, `articles/a1` …
     `articles/a6`, `quiz/refleksi`, lalu `SEED SELESAI.`
3. **Segera** kembalikan rules ke `allow write: if false;`, klik **Publish**,
   lalu jalankan `firebase deploy --only firestore` dari folder repo.
4. Cek di Console → Firestore Database → Data: collections `materials` (12
   dokumen), `articles` (6), `quiz` (1) sudah terisi.

## Langkah 4 — Jalankan lokal

Situs ini memakai ES module, jadi **tidak bisa** dibuka langsung dengan
klik-dua-kali file HTML (`file://`). Jalankan server lokal dari folder repo:

- `python3 -m http.server 8000`

lalu buka http://localhost:8000 di browser.

## Langkah 5 — Deploy ke Firebase Hosting

- `firebase deploy` — mengunggah hosting + rules Firestore sekaligus.
- Atau pisah: `firebase deploy --only hosting` /
  `firebase deploy --only firestore`.

URL sementara (sebelum domain disambung): `https://temanparenting-1e6ca.web.app`

## Cara ngoding / nambah konten

- **Ubah tampilan/teks statis:** edit file HTML/CSS/JS di repo ini, commit,
  push — deploy ulang dengan `firebase deploy --only hosting`.
- **Nambah/ubah materi atau artikel:** ubah dokumennya langsung di Firebase
  Console (Firestore Database → Data), atau edit `data/seed-*.json` lalu
  jalankan `tools/seed.mjs` lagi (hati-hati: `setDoc` menimpa dokumen
  dengan id yang sama).
- **Foto:** file di `assets/img/` — field `img` di Firestore berisi path
  relatifnya (mis. `assets/img/ibu-membaca-buku-sofa.jpg`). Foto tidak
  disimpan di Firestore (dokumen Firestore dibatasi 1 MB).

## Catatan

- **Teks "prototipe" di situs:** strip atas, bagian "Batasan prototipe" di
  `tentang.html`, dan kalimat footer masih menyebut situs ini mockup tanpa
  basis data — itu teks asli prototipe yang dipertahankan apa adanya. Sekarang
  data sudah dibaca dari Firestore, jadi kalimat-kalimat itu perlu
  diperbarui/dihapus; tempatnya sudah ditandai `TODO(Arkasha)` di kode.
- Kuis tidak menyimpan jawaban ke mana pun — skor dihitung di browser saja.
- Tidak ada login, admin panel, atau pengumpulan data pengguna.

## Yang masih menunggu

- [ ] `firebase-config.js` diisi config asli (Langkah 1)
- [ ] Database Firestore dibuat + seed pertama (Langkah 2–3)
- [ ] Domain `temanparenting.my.id` dibeli & disambungkan ke Hosting
      (Firebase Console → Hosting → Add custom domain → ikuti DNS record
      yang diberikan; verifikasi + SSL bisa memakan waktu sampai 24 jam)
