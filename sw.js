/**
 * ==============================================================================
 * KACIDA BERSATU - Service Worker (sw.js)
 * Strategi: Cache-First untuk Aset Visual (Drive LH3, Font, Script CDN)
 * Network-First untuk Google Apps Script & Firebase Realtime Database
 * ==============================================================================
 */

const CACHE_NAME = "kacida-cache-v1.0.0";
const IMAGE_CACHE_NAME = "kacida-images-v1.0.0";

// Aset Inti (App Shell) yang langsung disimpan di cache saat install
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
];

// Identitas Aset Google Drive Utama (Format URL LH3)
const DRIVE_IMAGES = [
  "https://lh3.googleusercontent.com/d/13s7CfV9C0h6NXGZQzA79AdbuycKiFRc9", // Background Login
  "https://lh3.googleusercontent.com/d/1gLnfmRQsyrHAmuo1xiyulHEKfg1iYk0-", // Logo & Preloader
  "https://lh3.googleusercontent.com/d/1dROWFJnnEIzxJeEJlpmsMkih9ppnGy7V", // Watermark Tabel
  "https://lh3.googleusercontent.com/d/1T-e5lMua-WeSj7VhHy7BE1m8-ukONs4J", // Foto Info Toko
  "https://lh3.googleusercontent.com/d/16LWQVS2khktL1miWFSAzMnHU_tf0blDa"  // Background Hero Card
];

// ------------------------------------------------------------------------------
// 1. EVENT: INSTALL (Pre-caching Shell & Gambar Drive)
// ------------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(CORE_ASSETS).catch((err) => {
          console.warn("Sebagian aset CDN gagal di-cache pada tahap install:", err);
        });
      }),
      caches.open(IMAGE_CACHE_NAME).then((cache) => {
        return cache.addAll(DRIVE_IMAGES).catch((err) => {
          console.warn("Sebagian gambar Drive gagal di-cache pada tahap install:", err);
        });
      })
    ]).then(() => self.skipWaiting())
  );
});

// ------------------------------------------------------------------------------
// 2. EVENT: ACTIVATE (Pembersihan Versi Cache Lama)
// ------------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  const allowedCaches = [CACHE_NAME, IMAGE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!allowedCaches.includes(name)) {
            console.log("Menghapus cache versi lama:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ------------------------------------------------------------------------------
// 3. EVENT: FETCH (Strategi Cache-First vs Network-First)
// ------------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // A. Abaikan permintaan selain HTTP/HTTPS (misal: chrome-extension://)
  if (!url.protocol.startsWith("http")) return;

  // B. ABAIKAN (NETWORK ONLY) untuk panggilan REST API Apps Script & Firebase Realtime DB
  // Agar mutasi transaksi tidak pernah stale/basi
  if (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com/calendar") ||
    url.searchParams.has("action") ||
    req.method !== "GET"
  ) {
    event.respondWith(
      fetch(req).catch(() => {
        // Fallback jika offline saat memanggil API
        return new Response(
          JSON.stringify({ status: "OFFLINE", message: "Anda sedang dalam mode offline. Data diambil dari memori lokal perangkat." }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // C. STRATEGI CACHE-FIRST: Khusus untuk Gambar Google Drive LH3
  if (url.hostname.includes("googleusercontent.com") || url.hostname.includes("lh3.googleusercontent.com")) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) => {
        return cache.match(req).then((cachedResponse) => {
          if (cachedResponse) {
            // Segera kirim gambar dari cache (0,1 detik)
            return cachedResponse;
          }
          // Jika belum ada di cache, unduh lalu simpan
          return fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Fallback gambar kosong jika gagal diunduh dan belum ada di cache
            return new Response("", { status: 408, statusText: "Offline" });
          });
        });
      })
    );
    return;
  }

  // D. STRATEGI STALE-WHILE-REVALIDATE: Untuk Aset Font, Skrip CDN, dan Dokumen Shell
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, resClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// ------------------------------------------------------------------------------
// 4. EVENT: PUSH NOTIFICATION (Dukungan Notifikasi Browser / PWA)
// ------------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let notifData = {
    title: "KACIDA BERSATU",
    body: "Terdapat pembaruan tugas operasional di toko Anda.",
    icon: "https://lh3.googleusercontent.com/d/1gLnfmRQsyrHAmuo1xiyulHEKfg1iYk0-",
    badge: "https://lh3.googleusercontent.com/d/1gLnfmRQsyrHAmuo1xiyulHEKfg1iYk0-",
    data: { url: "./index.html" }
  };

  if (event.data) {
    try {
      notifData = Object.assign(notifData, event.data.json());
    } catch (e) {
      notifData.body = event.data.text();
    }
  }

  const options = {
    body: notifData.body,
    icon: notifData.icon,
    badge: notifData.badge,
    vibrate: [100, 50, 100],
    data: notifData.data,
    actions: [
      { action: "open_app", title: "Buka Aplikasi" },
      { action: "close", title: "Tutup" }
    ]
  };

  event.waitUntil(self.registration.showNotification(notifData.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;

  const targetUrl = event.notification.data?.url || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
