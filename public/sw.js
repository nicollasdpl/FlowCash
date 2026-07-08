/* FlowCash PWA — service worker (notificações locais + FCM em background) */
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

function initFcm() {
  try {
    importScripts("/fcm-init.js");
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const n = payload.notification || {};
      const title = n.title || "FlowCash";
      const body = n.body || "";
      const data = payload.data || {};
      return self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag || "flowcash-push",
        data: { url: data.url || "/" },
        requireInteraction: data.requireInteraction === "true",
      });
    });
  } catch (err) {
    console.warn("[sw] FCM init skipped:", err);
  }
}

initFcm();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
