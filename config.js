const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.APP_CONFIG = {
  API_BASE_URL: isLocalhost ? "http://127.0.0.1:8000" : "https://petfriendly-api.onrender.com",
  ENDPOINTS: {
    SEARCH_PLACES: "/places/search",
    GET_ROUTE: "/places/route",
    FAVORITES: "/places/favorites"
  }
};