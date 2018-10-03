// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    // @todo: There is no way to pass custom data to SW pre-install, e.g. so we
    //        can determine if IO API is available, so we know which version of
    //        the LazyLoad package to cache. For now we'll just cache both.
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
}
