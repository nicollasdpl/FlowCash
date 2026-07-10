/* FlowCash SW v4 — FCM em background sem travar o app */
const SW_VERSION = "v4";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(initFcmSafe());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function initFcmSafe() {
  try {
    importScripts(
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js",
    );
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
    console.warn(`[sw ${SW_VERSION}] FCM opcional indisponível:`, err);
  }
  return Promise.resolve();
}

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
