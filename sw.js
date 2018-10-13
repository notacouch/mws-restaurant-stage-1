self.importScripts('/node_modules/idb/lib/idb.js');

const appVersion = '0.0.3';
const cachePrefix = 'restaurant-reviews-';
const cacheID = cachePrefix + appVersion;
const dbName = 'restaurant-reviews';
const dbVersion = 3;
const fileTableName = 'feature-based-files';
const restaurantTableName = 'restaurants';
const faveTableName = 'favorite-restaurants';

const dbPromise = idb.open(dbName, dbVersion, upgradeDb => {
  if (!upgradeDb.objectStoreNames.contains(fileTableName)) {
    upgradeDb.createObjectStore(fileTableName);
  }
  if (!upgradeDb.objectStoreNames.contains(restaurantTableName)) {
    upgradeDb.createObjectStore(restaurantTableName);
  }
  if (!upgradeDb.objectStoreNames.contains(faveTableName)) {
    upgradeDb.createObjectStore(faveTableName, {
      keyPath: 'restaurantId',
      autoIncrement: false,
    });
  }

  upgradeDb.createObjectStore;
});

// Re-used strings here
const imgFallback = '/img/ouch.png'; // credit: https://pixabay.com/en/connection-lost-no-connection-cloud-3498366/
const offlineText = 'Not online right now';

const urlsToCache = [
  '/',
  '/index.html',
  '/restaurant.html',
  '/css/styles.css',
  '/js/',
  '/node_modules/idb/lib/idb.js',
  '/js/dbhelper.js',
  '/js/main.js',
  '/js/restaurant_info.js',
  '/js/register-sw.js',
  '/node_modules/focus-visible/dist/focus-visible.min.js',
  // In register-sw.js, we determined which of these should be cached and stored
  // the value in IDB.
  // '/node_modules/vanilla-lazyload/dist/lazyload.min.js',
  // '/node_modules/vanilla-lazyload-compat/dist/lazyload.min.js',
  imgFallback,
  '/img/icons-192.png',
  '/img/icons-512.png',
];

self.addEventListener('install', event => {
  console.log('SW installed!', event);

  // We have determined which LazyLoad version to load and stored it in IDB,
  // retrieve that value and append it to our array of things to cache.
  //
  // concept and code credit Jake Archibald:
  // @link https://github.com/w3c/ServiceWorker/issues/1157#issuecomment-306469745

  event.waitUntil(
    (async function() {
      const [cache, lazyLoadSrc] = await Promise.all([
        caches.open(cacheID),
        dbPromise.then(db =>
          db
            .transaction(fileTableName)
            .objectStore(fileTableName)
            .get('lazyLoadSrc')
        ),
      ]);
      await cache
        .addAll(lazyLoadSrc ? urlsToCache.concat(lazyLoadSrc) : urlsToCache)
        .catch(error => {
          console.log('SW installation, cache addAll error: ', error);
        });
    })()
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
  // Once we started using PUT method w/ fetch (for fave/unfave), we get the
  // following error:
  // > Uncaught (in promise) TypeError: Request method 'PUT' is unsupported
  // It turns out it's because this service worker here hooks into the fetch,
  // and tries to catch it. This will happen with POST requests, too, when we
  // get to that point.
  //
  // https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent#Examples
  // Let the browser do its default thing
  // for non-GET requests.
  if (event.request.method != 'GET') return;

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
