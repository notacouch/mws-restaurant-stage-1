// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
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
}
