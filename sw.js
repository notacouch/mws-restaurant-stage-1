const appVersion = '0.0.2';
const cacheID = 'restaurant-reviews-' + appVersion;

// Re-used strings here
const imgFallback = '/img/ouch.png'; // credit: https://pixabay.com/en/connection-lost-no-connection-cloud-3498366/
const offlineText = 'Not online right now';

self.addEventListener('install', event => {
  console.log('SW installed!', event);
  event.waitUntil(
    caches.open(cacheID).then(cache =>
      cache
        .addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/css/styles.css',
          '/data/restaurants.json',
          '/js/',
          '/js/dbhelper.js',
          '/js/main.js',
          '/js/restaurant_info.js',
          '/js/register-sw.js',
          '/node_modules/focus-visible/dist/focus-visible.min.js',
          // @todo: Use IDB in register-sw to determine which of these should be cached
          '/node_modules/vanilla-lazyload/dist/lazyload.min.js',
          '/node_modules/vanilla-lazyload-compat/dist/lazyload.min.js',
          imgFallback,
        ])
        .catch(error => {
          console.log('SW installation, cache addAll error: ', error);
        })
    )
  );
});

self.addEventListener('message', event => {
  console.log('SW client message has been received');
  if (event.data.cacheImages) {
    console.log('SW: Client wants me to cache images...');
    caches.open(cacheID).then(cache =>
      cache.addAll(event.data.cacheImages).catch(error => {
        console.log(
          'SW: Something went wrong caching at least one of the images',
          error
        );
      })
    );
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  event.respondWith(
    // We need ignoreSearch so restaurant.html?id=n always resolves to restaurant.html
    caches.match(event.request, { ignoreSearch: true }).then(
      cachedResponse =>
        cachedResponse ||
        fetch(event.request)
          .then(freshResponse =>
            caches.open(cacheID).then(cache => {
              cache.put(event.request, freshResponse.clone());
              return freshResponse;
            })
          )
          .catch(
            error =>
              url.pathname.endsWith('.jpg')
                ? caches.match(imgFallback)
                : new Response(offlineText, {
                    status: 404,
                    statusText: offlineText,
                  })
          )
    )
  );
});
