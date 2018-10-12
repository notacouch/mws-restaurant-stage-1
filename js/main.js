let restaurants, neighborhoods, cuisines;
let newMap;
let lazyLoadInstance = false;
let firstBreakpoint = window.matchMedia('(min-width: 768px)').matches;
const markers = [];

/**
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', event => {
  initMap(); // added
  fetchNeighborhoods();
  fetchCuisines();
});

/**
 * Fetch all neighborhoods and set their HTML.
 */
fetchNeighborhoods = () => {
  DBHelper.fetchNeighborhoods((error, neighborhoods) => {
    if (error) {
      // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
};

/**
 * Set neighborhoods HTML.
 */
fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
  const select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(neighborhood => {
    const option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
};

/**
 * Fetch all cuisines and set their HTML.
 */
fetchCuisines = () => {
  DBHelper.fetchCuisines((error, cuisines) => {
    if (error) {
      // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
};

/**
 * Set cuisines HTML.
 */
fillCuisinesHTML = (cuisines = self.cuisines) => {
  const select = document.getElementById('cuisines-select');

  cuisines.forEach(cuisine => {
    const option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
};

/**
 * Initialize leaflet map, called from HTML.
 */
initMap = () => {
  // run the following if leaflet is available,
  // e.g. if we're offline, then no dice.
  if (typeof L !== 'undefined') {
    window.newMap = newMap = L.map('map', {
      // off center slightly more north/west in above mobile for better aesthetics,
      // off center to the north in mobile since the map details occupies some space
      center: firstBreakpoint
        ? [40.720216, -73.977501]
        : [40.712216, -73.987501],
      // zoom further out in mobile so we can reduce the overall visual area required
      // to showcase and interact with the content (restaurants' markers)
      zoom: firstBreakpoint ? 12 : 11,
      scrollWheelZoom: false,
    });
    L.tileLayer(
      'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}',
      {
        mapboxToken:
          'pk.eyJ1Ijoibm90YWNvdWNoIiwiYSI6ImNqbW15OW43NzA3OWIzcm1wNW1xYWx5eWgifQ.4hV2kJCYYEbh3zCU5uGt4Q',
        maxZoom: 18,
        attribution:
          'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
          '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
          'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        id: 'mapbox.streets',
      }
    ).addTo(newMap);
  }

  // whether leaflet/mapbox is available or not should not affect the rest of our app
  updateRestaurants();
};

/**
 * Update page and map for current restaurants.
 */
updateRestaurants = () => {
  const cSelect = document.getElementById('cuisines-select');
  const nSelect = document.getElementById('neighborhoods-select');

  const cIndex = cSelect.selectedIndex;
  const nIndex = nSelect.selectedIndex;

  const cuisine = cSelect[cIndex].value;
  const neighborhood = nSelect[nIndex].value;

  DBHelper.fetchRestaurantByCuisineAndNeighborhood(
    cuisine,
    neighborhood,
    (error, restaurants) => {
      if (error) {
        // Got an error!
        console.error(error);
      } else {
        resetRestaurants(restaurants);
        fillRestaurantsHTML();

        // Race condition, if LazyLoad has already loaded before the img tags
        // are rendered, it will never apply to new tags. So we create a new
        // instance or update the existing ones every time we create new img tags.
        if (window.LazyLoad) {
          console.log('LazyLoad available');
          if (!lazyLoadInstance) {
            console.log('No lazyLoadInstance, making new one');
            lazyLoadInstance = new window.LazyLoad(window.lazyLoadOptions);
          } else {
            console.log('lazyLoadInstance found, updating...');
            lazyLoadInstance.update();
          }
        } else {
          console.log('LazyLoad NOT available');
        }
      }
    }
  );
};

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
resetRestaurants = restaurants => {
  // Remove all restaurants
  self.restaurants = [];
  const ul = document.getElementById('restaurants-list');

  // Remove all map markers
  if (self.markers) {
    self.markers.forEach(marker => marker.remove());
  }
  self.markers = [];
  self.restaurants = restaurants;
};

/**
 * Create all restaurants HTML and add them to the webpage.
 */
fillRestaurantsHTML = (restaurants = self.restaurants) => {
  const ul = document.getElementById('restaurants-list');
  restaurants.forEach(restaurant => {
    ul.append(createRestaurantHTML(restaurant));
  });
  addMarkersToMap();
};

/**
 * Create restaurant HTML.
 */
createRestaurantHTML = restaurant => {
  const li = document.createElement('article');
  li.className = 'restaurants-list__restaurant';

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'restaurant-img-sizer';

  // Create XML fragment, not HTML, otherwise setAttribute forces lowercase, though viewBox is case-sensitive
  // @link https://stackoverflow.com/a/28734954/781824
  const svgAspectRatio = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg'
  );
  svgAspectRatio.setAttribute('viewBox', '0 0 4 3');
  imageWrapper.append(svgAspectRatio);

  const image = document.createElement('img');
  image.className = 'restaurant-img';
  // LazyLoad compatibility
  image.setAttribute('src', ''); // LazyLoad best practice is a blank src. We also utilize this in CSS.
  image.setAttribute('data-src', DBHelper.imageUrlForRestaurant(restaurant));

  // For a11y purposes, every img tag should at least have a blank alt attribute.
  // Better than that is to briefly describe the photo, but that information should
  // come from the content management system or digital asset manager, basically by
  // whoever uploaded the image, wherever they uploaded it from.
  //
  // The settings of the photos vary, it could be outside, inside, of a specific
  // food item, so we'll have to settle on a generic description. It's better than
  // just writing the name of the restaurant, because then we would say the name
  // repeatedly in screen readers, which is a sub-optimal experience, worse than a
  // blank alt attribute.
  image.setAttribute('alt', `Photo of or in ${restaurant.name}`);
  imageWrapper.append(image);
  li.append(imageWrapper);

  const name = document.createElement('h3');
  name.innerHTML = restaurant.name;
  li.append(name);

  // Fave icon, fave implementation via IDB to come later
  const faveIcon = document.createElement('button');
  faveIcon.className = 'parent-fave-icon parent-fave-icon--unfaved';
  faveIcon.innerHTML = `<span class="parent-fave-icon__label sr-only">Click to add this restaurant to your favorites!</span>
    <svg class="fave-icon fave-icon--unfaved" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <use xlink:href="#fave-icon" />
    </svg>`;
  li.append(faveIcon);

  const neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);

  const address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);

  // We leave these as links because, despite looking like buttons, they are intended
  // to behave as links. I subscribe to the opinion that we should resort to a <button>
  // tag for <button> kind of activity, e.g. form-related interactions, or to open a
  // modal or something to that effect.
  const more = document.createElement('a');

  // Stage 1 review suggested we add attribute aria-label="View details of restaurant name"
  // so screen readers wouldn't just read "View details". But if we did that I worry
  // the UA might read both! So we use our hide-to-all-but-screen-readers technique instead.
  more.innerHTML =
    'View Details<span class="sr-only"> of ' + restaurant.name + '</span>';
  more.href = DBHelper.urlForRestaurant(restaurant);
  li.append(more);

  return li;
};

/**
 * Add markers for current restaurants to the map.
 */
addMarkersToMap = (restaurants = self.restaurants) => {
  restaurants.forEach(restaurant => {
    // Add marker to the map
    const marker = DBHelper.mapMarkerForRestaurant(restaurant, newMap);
    if (marker) {
      marker.on('click', onClick);
      function onClick() {
        window.location.href = marker.options.url;
      }
      self.markers.push(marker);
    }
  });
};
