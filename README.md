# APK Scope

APK Scope adalah aplikasi Android pribadi untuk menganalisis isi aplikasi Android (APK) secara mendalam. Aplikasi ini dibuat untuk kebutuhan pemilik proyek sendiri, bukan sebagai layanan publik atau produk multi-user.

## Tujuan

Menyediakan alat analisis APK dari perangkat Android dengan kemampuan:

- Mengidentifikasi informasi aplikasi, package, versi, SDK, izin, komponen, sertifikat, dan checksum.
- Mendeteksi framework, bahasa, serta library yang digunakan aplikasi.
- Menjelajahi hasil dekompilasi kode dan struktur file.
- Memeriksa library native dan ABI.
- Melakukan pemeriksaan keamanan statis.
- Menyimpan riwayat dan laporan analisis.

Hasil analisis harus menyertakan bukti dan tingkat keyakinan. Versi library hanya ditampilkan jika dapat dibuktikan; hasil dekompilasi tidak boleh dianggap sebagai source code asli.

## Keputusan Arsitektur

Proyek menggunakan arsitektur **client-server self-hosted untuk penggunaan pribadi**.

- **Client Android:** React Native dengan Expo.
- **Backend API:** Python FastAPI.
- **Mesin analisis utama:** MobSF.
- **Analisis/dekompilasi pendukung:** JADX dan Apktool.
- **Deteksi tambahan:** custom library dan framework signature detector.
- **Database awal:** SQLite.
- **Penyimpanan APK dan hasil:** filesystem pada server.
- **Deployment:** server/komputer yang dikelola sendiri dan hanya dapat diakses secara pribadi.

Backend dan mesin analisis berjalan di server, bukan di dalam aplikasi Android. Aplikasi mengirim APK ke backend, memantau proses analisis, lalu menampilkan hasilnya.

### Prinsip biaya

- Prioritaskan software gratis dan open-source.
- Tidak mewajibkan VPS berbayar, layanan cloud berlangganan, atau API berbayar.
- Tidak menggunakan PostgreSQL, Redis, maupun object storage pada tahap awal.
- Gunakan SQLite dan penyimpanan filesystem terlebih dahulu.
- Infrastruktur berbayar hanya dipertimbangkan jika kebutuhan kapasitas benar-benar mengharuskannya.

Google Cloud Shell dapat dipakai untuk pengembangan atau pengujian, tetapi bukan diasumsikan sebagai server produksi permanen. Lingkungan deployment harus mendukung proses analisis yang panjang, penyimpanan file, dan kebutuhan resource MobSF.

## Cakupan Analisis

### 1. APK Inspector

- Nama aplikasi, application ID/package name, versi, ukuran, dan checksum SHA-256.
- minSdkVersion dan targetSdkVersion.
- Permissions dan app components.
- Informasi signing certificate.

### 2. Library Detector

Mendeteksi library berdasarkan bukti seperti class/package descriptor DEX, metadata, resource, native library, dan signature yang dipelihara.

Kategori awal meliputi networking, database, backend, dependency injection, UI, analytics, advertising, security, media, dan utility.

Setiap temuan menyimpan nama, kategori, versi jika diketahui, bukti, lokasi bukti, metode deteksi, dan confidence. Jangan menyimpulkan library hanya dari nama yang mirip tanpa bukti pendukung.

### 3. Framework Detector

Mendeteksi framework dan teknologi aplikasi, misalnya native Android, Kotlin, Jetpack Compose, Flutter, React Native, Expo, dan Hermes jika bukti tersedia.

### 4. Code Explorer

- Menampilkan struktur package dan file.
- Menjelajahi hasil dekompilasi Java dan Smali.
- Mencari class, method, dan teks.
- Memuat konten secara bertahap; jangan memuat seluruh source sekaligus.

### 5. Native Library Analyzer

- Mendeteksi file .so.
- Mengidentifikasi ABI dan arsitektur ELF.
- Memeriksa dependency dan exported symbols jika tersedia.

### 6. Static Security Analyzer

Memeriksa indikator seperti permission berisiko, exported component, cleartext traffic, debuggable flag, hardcoded secret, endpoint, konfigurasi TLS/crypto, dan penyimpanan data sensitif.

Temuan statis adalah indikator untuk ditinjau, bukan bukti otomatis bahwa APK merupakan malware. Dynamic analysis dapat dipertimbangkan pada tahap lanjutan dengan lingkungan terisolasi.

### 7. Reports dan History

Laporan mencakup ringkasan aplikasi, metadata, library, framework, native library, permissions, hasil dekompilasi, file/resource, dan temuan keamanan. Riwayat dan perbandingan antar-APK dapat dikembangkan setelah alur analisis utama stabil.

## Alur Kerja

1. Pengguna memilih APK dari perangkat Android.
2. Aplikasi mengunggah APK ke backend pribadi.
3. Backend memvalidasi file dan membuat ID analisis.
4. Mesin analisis memproses APK.
5. Backend menyimpan metadata dan hasil analisis.
6. Aplikasi mengambil status dan menampilkan laporan.
7. Pengguna dapat membuka detail, menjelajahi kode, mencari, dan melihat riwayat.

Status analisis yang digunakan: `queued`, `validating`, `analyzing`, `enriching`, `completed`, atau `failed`.

## Tahapan Implementasi

1. **Fondasi backend:** FastAPI, Docker, MobSF, SQLite, filesystem, dan health check.
2. **Upload dan pipeline:** pemilihan APK, upload progress, validasi, proses asinkron, status, dan penanganan kegagalan.
3. **APK Inspector:** metadata dan informasi dasar APK.
4. **Library dan Framework Detector:** signature database, bukti deteksi, dan confidence.
5. **Code Explorer:** struktur file, dekompilasi, pencarian, dan pagination.
6. **Native dan Security Analyzer:** pemeriksaan file native serta analisis keamanan statis.
7. **History dan Reports:** riwayat, detail laporan, ekspor, dan perbandingan APK.
8. **Hardening dan optimasi:** isolasi worker, batas resource, retensi file, logging, backup, dan pengujian keamanan.

Implementasi dilakukan bertahap. Prioritas pertama adalah membuktikan alur upload APK sampai laporan JSON berhasil ditampilkan di aplikasi Android.

## Prinsip Keamanan

APK merupakan input yang tidak tepercaya. Karena itu:

- Proses analisis harus berjalan terisolasi dari sistem utama.
- Terapkan batas ukuran file, waktu proses, CPU, RAM, dan disk.
- Validasi arsip untuk mengurangi risiko ZIP bomb dan path traversal.
- Worker tidak diberi akses ke Docker socket atau file host yang tidak diperlukan.
- Batasi akses backend ke jaringan keluar secara default.
- Backend hanya dapat diakses melalui jaringan pribadi atau mekanisme akses yang aman.
- Rahasia dan API key mesin analisis tidak boleh ditanam di aplikasi Android.
- Terapkan kontrol akses untuk setiap analisis serta kebijakan penghapusan file.

## Batasan dan Ketentuan

- Fokus awal adalah analisis statis APK.
- Dynamic analysis bukan bagian dari MVP.
- Hasil dekompilasi bukan source code asli dan dapat tidak lengkap, terutama jika aplikasi di-obfuscate.
- Versi library/framework tidak boleh ditebak jika signature tidak cukup kuat.
- Analisis keamanan tidak boleh langsung memberi label malware tanpa verifikasi tambahan.
- Aplikasi ini ditujukan untuk penggunaan pribadi, bukan layanan upload publik atau multi-tenant.

## Struktur Target

Struktur berikut adalah arah pengembangan, bukan klaim bahwa seluruh direktori sudah tersedia.

```text
apk_scope/
├── src/
│   ├── app/
│   ├── features/
│   │   ├── apk-upload/
│   │   ├── apk-analysis/
│   │   ├── libraries/
│   │   ├── code-explorer/
│   │   ├── security/
│   │   └── reports/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   │   ├── api/
│   │   └── upload/
│   └── types/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── workers/
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml
├── infrastructure/
│   ├── docker/
│   └── deployment/
├── docs/
└── README.md
```

## Referensi Utama

- [Expo Documentation](https://docs.expo.dev/)
- [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF)
- [MobSF Documentation](https://mobsf.github.io/docs/)
- [JADX](https://github.com/skylot/jadx)
- [Apktool](https://github.com/iBotPeaches/Apktool)
- [OWASP MAS](https://mas.owasp.org/)


## Menjalankan MVP (Backend + Android)

### Persyaratan server

- Docker Engine dan Docker Compose plugin.
- RAM yang memadai untuk MobSF (disarankan minimal 8 GB) dan ruang disk kosong yang cukup untuk APK serta hasil analisis.
- Server hanya dapat dijangkau dari jaringan pribadi. Jangan membuka port API atau MobSF ke internet publik. MobSF ditempatkan pada jaringan Docker internal tanpa akses keluar; API hanya terhubung ke MobSF melalui jaringan tersebut.

### Konfigurasi backend

1. Salin `backend/.env.example` menjadi `backend/.env`.
2. Isi `MOBSF_API_KEY` dengan token acak panjang milikmu dan ganti `APP_API_TOKEN` dengan token acak panjang yang berbeda. Compose meneruskan `MOBSF_API_KEY` ke container MobSF sebagai API key statis.
3. Jalankan `docker compose up -d --build` dari root repository.
4. Periksa `http://ALAMAT_SERVER:8000/health`. Endpoint ini hanya memeriksa API dan apakah key MobSF telah diisi; bukan jaminan scan MobSF siap.
5. Pantau log dengan `docker compose logs -f api mobsf`.

Data APK, database SQLite, dan data MobSF disimpan pada Docker volumes. Jangan menghapus volume jika ingin mempertahankan riwayat.

### Konfigurasi aplikasi Android

1. Pasang dependency sesuai Expo SDK 58: `npx expo install expo-document-picker expo-file-system`.
2. Jalankan aplikasi dengan development build atau build internal Android.
3. Masukkan alamat IP server yang dapat dijangkau HP dan token yang sama dengan `APP_API_TOKEN`.
4. Pilih APK dari perangkat. Aplikasi akan mengunggahnya, lalu memperbarui riwayat secara berkala.

Alamat `127.0.0.1` pada HP menunjuk ke HP itu sendiri, bukan server. Untuk penggunaan melalui jaringan publik, wajib gunakan HTTPS dan autentikasi tambahan sebelum membuka akses.

### Batas MVP

- Pipeline saat ini memakai FastAPI BackgroundTasks dalam satu proses API; bukan worker queue persisten. Jika proses API restart, pekerjaan yang sedang berjalan tidak otomatis dipulihkan.
- Progres yang ditampilkan adalah progres upload dan status tahap analisis, bukan persentase internal MobSF.
- Riwayat menampilkan ringkasan; endpoint detail memuat JSON laporan penuh.
- Library/framework signature detector, Code Explorer, native analyzer, dan security enrichment khusus belum diimplementasikan pada tahap ini.
- Jalankan pengujian backend dan pemeriksaan Expo di lingkungan pengembangan sebelum mengirim APK untuk analisis nyata.
