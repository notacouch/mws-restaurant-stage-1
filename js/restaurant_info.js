let restaurant;
let newMap;

/**
 * Initialize map as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', event => {
  initMap();
});

/**
 * Initialize leaflet map
 */
initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) {
      // Got an error!
      console.error(error);
    } else {
      fillBreadcrumb();
      // run the following if leaflet is available,
      // e.g. if we're offline, then no dice.
      if (typeof L !== 'undefined') {
        self.newMap = L.map('map', {
          center: [restaurant.latlng.lat, restaurant.latlng.lng],
          zoom: 16,
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
        ).addTo(self.newMap);
        DBHelper.mapMarkerForRestaurant(self.restaurant, self.newMap);
      }
    }
  });
};

/**
 * Get current restaurant from page URL.
 */
fetchRestaurantFromURL = callback => {
  if (self.restaurant) {
    // restaurant already fetched!
    callback(null, self.restaurant);
    return;
  }
  const id = getParameterByName('id');
  if (!id) {
    // no id found in URL
    error = 'No restaurant id in URL';
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantById(id, (error, restaurant) => {
      self.restaurant = restaurant;
      if (!restaurant) {
        console.error(error);
        return;
      }
      fillRestaurantHTML();
      callback(null, restaurant);
    });
  }
};

/**
 * Create restaurant HTML and add it to the webpage
 */
fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;
  document.title = restaurant.name + ' - ' + document.title;

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img';
  image.src = DBHelper.imageUrlForRestaurant(restaurant);
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

  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;

  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
  // fill reviews
  fillReviewsHTML();
};

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
fillRestaurantHoursHTML = (
  operatingHours = self.restaurant.operating_hours
) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
};

/**
 * Create all reviews HTML and add them to the webpage.
 */
fillReviewsHTML = (reviews = self.restaurant.reviews) => {
  const container = document.getElementById('reviews-container');
  const title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }
  const reviewsList = document.getElementById('reviews-list');
  reviews.forEach(review => {
    reviewsList.appendChild(createReviewHTML(review));
  });
  container.appendChild(reviewsList);
};

/**
 * Create review HTML and add it to the webpage.
 */
createReviewHTML = review => {
  const reviewNode = document.createElement('article');
  reviewNode.className = 'reviews-list__review';

  const name = document.createElement('p');
  name.className = 'author';
  name.innerHTML = review.name;
  reviewNode.appendChild(name);

  const date = document.createElement('time');
  date.innerHTML = review.date;
  reviewNode.appendChild(date);

  const rating = document.createElement('p');
  rating.innerHTML = `Rating: ${review.rating}`;
  reviewNode.appendChild(rating);

  const comments = document.createElement('p');
  comments.innerHTML = review.comments;
  reviewNode.appendChild(comments);

  return reviewNode;
};

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
fillBreadcrumb = (restaurant = self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const span = document.createElement('span');
  span.className = 'breadcrumb__list-item';
  span.innerHTML = restaurant.name;
  breadcrumb.appendChild(span);
};

/**
 * Get a parameter by name from page URL.
 */
getParameterByName = (name, url) => {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};
