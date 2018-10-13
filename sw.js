self.importScripts('/node_modules/idb/lib/idb.js');

const appVersion = '0.0.4';
const cachePrefix = 'restaurant-reviews-';
const cacheID = cachePrefix + appVersion;
const dbName = 'restaurant-reviews';
const dbVersion = 4;
const fileTableName = 'feature-based-files';
const restaurantTableName = 'restaurants';
const faveTableName = 'favorite-restaurants';
const reviewTableName = 'review-queue';
const restaurantReviewsTableName = 'reviews';

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
  if (!upgradeDb.objectStoreNames.contains(reviewTableName)) {
    upgradeDb.createObjectStore(reviewTableName);
  }
  if (!upgradeDb.objectStoreNames.contains(restaurantReviewsTableName)) {
    upgradeDb.createObjectStore(restaurantReviewsTableName, {
      keyPath: 'id',
    });
  }

  upgradeDb.createObjectStore;
});

// closure to produce specified version of `const idbKeyval` as seen in idb README:
// https://github.com/jakearchibald/idb#keyval-store
function newKeyVal(objectStoreName) {
  return {
    get(key) {
      return dbPromise.then(db => {
        return db
          .transaction(objectStoreName)
          .objectStore(objectStoreName)
          .get(key);
      });
    },
    getAll(query, count) {
      return dbPromise.then(db => {
        return db
          .transaction(objectStoreName)
          .objectStore(objectStoreName)
          .getAll(query, count);
      });
    },
    set(key, val) {
      return dbPromise.then(db => {
        const tx = db.transaction(objectStoreName, 'readwrite');
        tx.objectStore(objectStoreName).put(val, key);
        return tx.complete;
      });
    },
    delete(key) {
      return dbPromise.then(db => {
        const tx = db.transaction(objectStoreName, 'readwrite');
        tx.objectStore(objectStoreName).delete(key);
        return tx.complete;
      });
    },
    clear() {
      return dbPromise.then(db => {
        const tx = db.transaction(objectStoreName, 'readwrite');
        tx.objectStore(objectStoreName).clear();
        return tx.complete;
      });
    },
    keys() {
      return dbPromise.then(db => {
        const tx = db.transaction(objectStoreName);
        const keys = [];
        const store = tx.objectStore(objectStoreName);

        // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
        // openKeyCursor isn't supported by Safari, so we fall back
        (store.iterateKeyCursor || store.iterateCursor).call(store, cursor => {
          if (!cursor) return;
          keys.push(cursor.key);
          cursor.continue();
        });

        return tx.complete.then(() => keys);
      });
    },
  };
}

restaurantReviewKeyValStore = newKeyVal(restaurantReviewsTableName);

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
  '/favicon.ico',
];

self.addEventListener('install', event => {
  //console.log('SW installed!', event);

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
          console.error('SW installation, cache addAll error: ', error);
        });
    })()
  );
});

self.addEventListener('message', event => {
  //console.log('SW client message has been received');
  if (event.data.cacheImages) {
    //console.log('SW: Client wants me to cache images...');
    caches.open(cacheID).then(cache =>
      cache.addAll(event.data.cacheImages).catch(error => {
        console.error(
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
  const cacheOptions = {};
  let cacheUrl = url;
  if (/restaurant\.html/.test(url.pathname)) {
    cacheOptions.ignoreSearch = true;
  } else if (/reviews/.test(url.pathname)) {
    const restaurantId = url.searchParams.get('restaurant_id');
    if (restaurantId) {
      event.respondWith(
        (async () => {
          let reviews = await restaurantReviewKeyValStore.getAll();
          let matchingReviews = [];
          reviews.forEach(review => {
            if (review.restaurant_id == restaurantId) {
              // not ===, the data type is not consistent
              matchingReviews.push(review);
            }
          });

          if (matchingReviews.length) {
            fetch(url).then(async freshResponse => {
              const freshReviews = await freshResponse.json();
              if (freshReviews.length) {
                // sync idb by deleting all existing reviews for current restaurant
                restaurantReviewKeyValStore.getAll().then(async oldReviews => {
                  await oldReviews.forEach(async oldReview => {
                    if (oldReview.restaurant_id == restaurantId) {
                      await restaurantReviewKeyValStore.delete(oldReview.id);
                    }
                  });
                  freshReviews.forEach(freshReview =>
                    restaurantReviewKeyValStore.set(undefined, freshReview)
                  );
                });
              }
            });

            return new Response(JSON.stringify(matchingReviews), {
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            let reviewsClone;
            await fetch(url)
              .then(async freshResponse => {
                reviewsClone = freshResponse.clone();
                const freshReviews = await freshResponse.json();
                if (freshReviews.length) {
                  freshReviews.forEach(review =>
                    restaurantReviewKeyValStore.set(undefined, review)
                  );
                }
              })
              .catch(async error => {
                // Maybe the user is offline and hasn't hit up this restaurant yet,
                // populate a fake review as a notification and to keep the app running.
                reviewsClone = new Response(
                  JSON.stringify([
                    {
                      restaurant_id: restaurantId,
                      createdAt: null,
                      name: null,
                      rating: null,
                      comments: null,
                      error:
                        'There was an error while trying to get reviews for this restaurant. Perhaps something was wrong with your connection. Please try again later.',
                    },
                  ]),
                  {
                    headers: { 'Content-Type': 'application/json' },
                  }
                );
              });
            return reviewsClone;
          }
        })()
      );
      return;
    }
  }

  event.respondWith(
    // We need ignoreSearch so restaurant.html?id=n always resolves to restaurant.html
    caches.match(cacheUrl, cacheOptions).then(
      cachedResponse =>
        cachedResponse ||
        fetch(event.request)
          .then(freshResponse =>
            caches.open(cacheID).then(cache => {
              cache.put(cacheUrl, freshResponse.clone());
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
