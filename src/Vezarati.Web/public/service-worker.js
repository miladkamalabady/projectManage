/* Push notification service worker for Vezarati.
   Place at the web root as /service-worker.js so its scope covers the whole app. */

const DEFAULT_TITLE = "پیگیری مصوبات";
const DEFAULT_ICON = "/icons/notification-192.png";
const DEFAULT_BADGE = "/icons/notification-badge-72.png";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

function safeAppUrl(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = String(payload.title || DEFAULT_TITLE);
  const options = {
    body: String(payload.body || payload.text || "یک یادآوری جدید برای شما ثبت شده است."),
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || (payload.resolutionId ? "resolution-" + payload.resolutionId : "vezarati-notification"),
    data: {
      url: safeAppUrl(payload.url || "/"),
      resolutionId: payload.resolutionId || null
    },
    dir: "rtl",
    lang: "fa",
    renotify: Boolean(payload.renotify),
    timestamp: payload.timestamp ? Number(payload.timestamp) : Date.now()
  };

  if (Array.isArray(payload.actions)) {
    options.actions = payload.actions.slice(0, 2).map((action) => ({
      action: String(action.action || "open"),
      title: String(action.title || "مشاهده")
    }));
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeAppUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        if ("navigate" in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

/* Local test helper: run from the page after registering the worker:
   navigator.serviceWorker.controller.postMessage({ type: "TEST_NOTIFICATION" }) */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TEST_NOTIFICATION") {
    event.waitUntil(self.registration.showNotification(DEFAULT_TITLE + " · آزمایشی", {
      body: "اعلان آزمایشی این مرورگر آماده است.",
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE,
      tag: "vezarati-test",
      dir: "rtl",
      lang: "fa",
      data: { url: self.location.origin + "/" }
    }));
  }
});
