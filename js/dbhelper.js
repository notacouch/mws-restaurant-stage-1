// Dynamically and conditionally load the proper version of LazyLoad for this
// browser/device. We put this code here in dbhelper.js b/c this script is in both
// pages and before other scripts run.
(function(w, d) {
  const supportsIO = 'IntersectionObserver' in w;
  let b = d.getElementsByTagName('body')[0];
  let s = d.createElement('script');
  let v = !supportsIO ? '-compat' : '';
  s.async = true; // This includes the script as async. See the "recipes" section for more information about async loading of LazyLoad.
  s.src = '/node_modules/vanilla-lazyload' + v + '/dist/lazyload.min.js';
  w.lazyLoadOptions = {
    elements_selector: '.restaurant-img',
    callback_load: el => {
      //console.log('element loaded', el);
    },
    callback_finish: () => {
      //console.log('lazy load finished');
    },
  };
  b.appendChild(s);
  w.lazyLoadSrc = s.src; // save this value globally so we can pass it to IDB & thereby our service worker, too.
})(window, document);

const dbName = 'restaurant-reviews';
const dbVersion = 3;
const fileTableName = 'feature-based-files';
const restaurantTableName = 'restaurants';
const faveTableName = 'favorite-restaurants';

let dbPromise = false;
let faveKeyValStore;

window.idbConfig = {
  dbName,
  dbVersion,
  fileTableName,
  restaurantTableName,
  faveTableName,
  dbPromise,
  faveKeyValStore,
};

if (window.idb) {
  dbPromise = idb.open(dbName, dbVersion, upgradeDb => {
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
          (store.iterateKeyCursor || store.iterateCursor).call(
            store,
            cursor => {
              if (!cursor) return;
              keys.push(cursor.key);
              cursor.continue();
            }
          );

          return tx.complete.then(() => keys);
        });
      },
    };
  }

  idbConfig.dbPromise = dbPromise;
  idbConfig.faveKeyValStore = faveKeyValStore = newKeyVal(faveTableName);
}

/**
 * Common database helper functions.
 */
class DBHelper {
  /**
   * Database URL.
   * Basic getter for restaurant retrieval URL.
   */
  static get DATABASE_URL() {
    return DBHelper.databaseURL();
  }

  /**
   * Database URL.
   * Change this to the API endpoint for Stage 3.
   * Can switch between reviews and restaurants.
   */
  static databaseURL(dataType = 'restaurants') {
    const port = 1337; // Change this to your server port
    return `http://localhost:${port}/${dataType}/`;
  }

  /**
   * Fetch all restaurants.
   */
  static fetchRestaurants(callback) {
    let callbackRan = false;

    // Offline first
    if (dbPromise) {
      dbPromise.then(db => {
        db.transaction(restaurantTableName)
          .objectStore(restaurantTableName)
          .get('restaurants')
          .then(restaurants => {
            if (restaurants && !callbackRan) {
              callback(null, restaurants);
              callbackRan = true; // don't conflict with the XHR below
            }
          });
      });
    }
    // Even though the above may have returned a value,
    // if we're online we can grab the latest value behind the scenes.
    let xhr = new XMLHttpRequest();
    xhr.open('GET', DBHelper.DATABASE_URL);
    xhr.onload = () => {
      if (xhr.status === 200) {
        // Got a success response from server!
        const restaurants = JSON.parse(xhr.responseText);
        // if idb fails for some reason, or it's our first time here
        if (!callbackRan) {
          callback(null, restaurants);
          callbackRan = true;
        }
        // Store online call, especially if it contains updated information
        if (dbPromise) {
          dbPromise.then(db => {
            const tx = db.transaction(restaurantTableName, 'readwrite');
            tx.objectStore(restaurantTableName).put(restaurants, 'restaurants');
            return tx.complete;
          });
        }
      } else {
        // Oops!. Got an error from server.
        const error = `Request failed. Returned status of ${xhr.status}`;
        callback(error, null);
      }
    };
    xhr.send();
  }

  /**
   * Fetch a restaurant by its ID.
   */
  static fetchRestaurantById(id, callback) {
    // fetch all restaurants with proper error handling.
    DBHelper.fetchRestaurants(async (error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        const restaurant = restaurants.find(r => r.id == id);
        if (restaurant) {
          // Got the restaurant
          // now attach its reviews
          // stage 3 endpoint for that is:
          // http://localhost:1337/reviews/?restaurant_id=<restaurant_id>
          const reviewsResponse = await fetch(
            DBHelper.databaseURL('reviews') + '?restaurant_id=' + restaurant.id
          );
          restaurant.reviews = await reviewsResponse.json();

          callback(null, restaurant);
        } else {
          // Restaurant does not exist in the database
          callback('Restaurant does not exist', null);
        }
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   */
  static fetchRestaurantByCuisine(cuisine, callback) {
    // Fetch all restaurants  with proper error handling
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given cuisine type
        const results = restaurants.filter(r => r.cuisine_type == cuisine);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   */
  static fetchRestaurantByNeighborhood(neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given neighborhood
        const results = restaurants.filter(r => r.neighborhood == neighborhood);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   */
  static fetchRestaurantByCuisineAndNeighborhood(
    cuisine,
    neighborhood,
    callback
  ) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        let results = restaurants;
        if (cuisine != 'all') {
          // filter by cuisine
          results = results.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood != 'all') {
          // filter by neighborhood
          results = results.filter(r => r.neighborhood == neighborhood);
        }
        callback(null, results);
      }
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   */
  static fetchNeighborhoods(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all neighborhoods from all restaurants
        const neighborhoods = restaurants.map(
          (v, i) => restaurants[i].neighborhood
        );
        // Remove duplicates from neighborhoods
        const uniqueNeighborhoods = neighborhoods.filter(
          (v, i) => neighborhoods.indexOf(v) == i
        );
        callback(null, uniqueNeighborhoods);
      }
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   */
  static fetchCuisines(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all cuisines from all restaurants
        const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type);
        // Remove duplicates from cuisines
        const uniqueCuisines = cuisines.filter(
          (v, i) => cuisines.indexOf(v) == i
        );
        callback(null, uniqueCuisines);
      }
    });
  }

  /**
   * Restaurant page URL.
   */
  static urlForRestaurant(restaurant) {
    return `./restaurant.html?id=${restaurant.id}`;
  }

  /**
   * Restaurant image URL.
   */
  static imageUrlForRestaurant(restaurant) {
    // return `/img/${restaurant.photograph}.jpg`; // photograph property is not always available
    return `/img/${restaurant.id}.jpg`; // whereas currently a photo always actually exists, so we use the id property
  }

  /**
   * Map marker for a restaurant.
   */
  static mapMarkerForRestaurant(restaurant, map) {
    if (typeof L !== 'undefined') {
      // https://leafletjs.com/reference-1.3.0.html#marker
      const marker = new L.marker(
        [restaurant.latlng.lat, restaurant.latlng.lng],
        {
          title: restaurant.name,
          alt: restaurant.name,
          url: DBHelper.urlForRestaurant(restaurant),
        }
      );
      marker.addTo(window.newMap);
      return marker;
    }
  }
}
