/* global idb:false */

// Register service worker
if ('serviceWorker' in navigator) {
  // // code duplication, it's in 2 places... (here and the service worker)
  // // @todo if/when we use build tools, we can throw this in a file
  // const appVersion = '0.0.3';
  // const cachePrefix = 'restaurant-reviews-';
  // const cacheID = cachePrefix + appVersion;
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

  // Using feature detection, we've determined which LazyLoad version to load.
  // We'll store that in IDB, then register our service worker so it will have
  // access to that value in time.
  //
  // concept and code credit Jake Archibald:
  // @link https://github.com/w3c/ServiceWorker/issues/1157#issuecomment-306469745
  // async function registerSw() {
  //   await idbKeyval.set('urlsToCache', ['/', '/cat.gif']);
  //   return navigator.serviceWorker.register('/sw.js');
  // }

  (async function registerSw() {
    await dbPromise.then(db => {
      const tx = db.transaction(fileTableName, 'readwrite');
      tx.objectStore(fileTableName).put(window.lazyLoadSrc, 'lazyLoadSrc'); // see top of dbhelper.js for what this is
      return tx.complete;
    });

    return navigator.serviceWorker
      .register('/sw.js', { foo: 'bar' })
      .then(register => {
        console.log('SW now in the main gibson ', register, register.scope);
        // This page was not reached via SW
        if (!navigator.serviceWorker.controller) {
          const sw = register.active || register.installing;
          if (sw) {
            // the page we are on definitely has images, cache existing images
            // in case we go offline.
            let cacheImages = [];
            const restaurantImages = document.getElementsByClassName(
              'restaurant-img'
            );
            const totalRestaurantImages = restaurantImages.length;
            for (let i = 0; i < totalRestaurantImages; ++i) {
              cacheImages.push(restaurantImages[i].getAttribute('src'));
            }
            if (cacheImages.length) {
              sw.postMessage({ cacheImages: cacheImages });
            }
          }
        }
      })
      .catch(error => {
        console.log('SW registration failed: ', error);
      });
  })();
}
