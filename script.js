const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const tabs = document.querySelectorAll(".tab");
const genreSelect = document.getElementById("genre-select");
const listFilters = document.getElementById("list-filters");
const filterBtns = document.querySelectorAll(".chip-btn");
const listCount = document.getElementById("list-count");
const title = document.getElementById("title");
const message = document.getElementById("message");
const grid = document.getElementById("anime-grid");
const loadMoreBtn = document.getElementById("load-more");
const popup = document.getElementById("popup");
const popupModal = new bootstrap.Modal(popup);
const toast = bootstrap.Toast.getOrCreateInstance(document.getElementById("toast"), { delay: 2000 });

const tabSettings = {
  trending: { title: "Trending Now", sort: ["TRENDING_DESC"] },
  top: { title: "Top Rated", sort: ["SCORE_DESC"] },
  popular: { title: "Most Popular", sort: ["POPULARITY_DESC"] },
  upcoming: { title: "Upcoming", sort: ["POPULARITY_DESC"], status: "NOT_YET_RELEASED" }
};

const statusNames = {
  FINISHED: "Finished",
  RELEASING: "Airing",
  NOT_YET_RELEASED: "Not Yet Aired",
  CANCELLED: "Cancelled",
  HIATUS: "On Hiatus"
};

let myList = JSON.parse(localStorage.getItem("myList")) || [];
let currentTab = "trending";
let searchText = "";
let page = 1;
let listFilter = "All";
let heroAnime = null;
let popupAnime = null;
let requestNumber = 0;

// anilist uses graphql, so we send a query saying which fields we want
const query = `
  query ($page: Int, $search: String, $sort: [MediaSort], $genre: String, $status: MediaStatus) {
    Page(page: $page, perPage: 24) {
      pageInfo { hasNextPage }
      media(type: ANIME, isAdult: false, search: $search, sort: $sort, genre: $genre, status: $status) {
        id
        title { romaji english }
        coverImage { extraLarge }
        bannerImage
        averageScore
        popularity
        episodes
        duration
        seasonYear
        format
        status
        genres
        description
        siteUrl
        trailer { id site }
        studios(isMain: true) { nodes { name } }
      }
    }
  }
`;

// the api gives a lot of data, we only keep what we need
function makeAnime(item) {
  let synopsis = "No synopsis available.";
  if (item.description) {
    synopsis = item.description.replace(/<[^>]*>/g, ""); // remove html tags like <br>
  }

  let trailer = "";
  if (item.trailer && item.trailer.site === "youtube") {
    trailer = "https://www.youtube.com/watch?v=" + item.trailer.id;
  }

  let studio = "-";
  if (item.studios.nodes.length > 0) {
    studio = item.studios.nodes[0].name;
  }

  return {
    id: item.id,
    title: item.title.english || item.title.romaji,
    image: item.coverImage.extraLarge,
    banner: item.bannerImage,
    score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
    popularity: item.popularity,
    episodes: item.episodes,
    duration: item.duration,
    year: item.seasonYear,
    format: item.format ? item.format.replace("_", " ") : "",
    status: statusNames[item.status] || "-",
    genres: item.genres,
    synopsis: synopsis,
    trailer: trailer,
    link: item.siteUrl,
    studio: studio
  };
}

async function fetchAnime(variables) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query, variables: variables })
  });
  const data = await response.json();

  const list = [];
  for (let i = 0; i < data.data.Page.media.length; i++) {
    list.push(makeAnime(data.data.Page.media[i]));
  }

  return { list: list, hasNext: data.data.Page.pageInfo.hasNextPage };
}

function getVariables() {
  const variables = { page: page };

  if (searchText !== "") {
    variables.search = searchText;
    variables.sort = ["SEARCH_MATCH"];
  } else {
    variables.sort = tabSettings[currentTab].sort;
    if (tabSettings[currentTab].status) {
      variables.status = tabSettings[currentTab].status;
    }
  }

  if (genreSelect.value !== "") {
    variables.genre = genreSelect.value;
  }

  return variables;
}

async function loadAnime(addMore) {
  // remember which request this is, so an old slow one can't overwrite a new one
  requestNumber++;
  const thisRequest = requestNumber;

  message.textContent = "";
  loadMoreBtn.classList.add("d-none");

  if (addMore) {
    loadMoreBtn.textContent = "Loading...";
  } else {
    page = 1;
    showSkeletons();
  }

  try {
    const result = await fetchAnime(getVariables());
    if (thisRequest !== requestNumber) return;

    if (!addMore) {
      grid.innerHTML = "";
    }

    if (result.list.length === 0 && !addMore) {
      message.textContent = "No anime found 😢";
      return;
    }

    for (let i = 0; i < result.list.length; i++) {
      grid.appendChild(createCard(result.list[i], false));
    }

    if (result.hasNext) {
      loadMoreBtn.textContent = "Load More";
      loadMoreBtn.classList.remove("d-none");
    }
  } catch (error) {
    if (thisRequest !== requestNumber) return;
    grid.innerHTML = "";
    message.textContent = "Something went wrong, try again";
  }
}

function showSkeletons() {
  grid.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `
      <div class="card anime-card border-0 placeholder-glow">
        <span class="placeholder skeleton-img w-100"></span>
        <div class="card-body p-2">
          <span class="placeholder col-10"></span>
          <span class="placeholder col-6"></span>
        </div>
      </div>`;
    grid.appendChild(col);
  }
}

function createCard(anime, inMyList) {
  const col = document.createElement("div");
  col.className = "col";

  const card = document.createElement("div");
  card.className = "card anime-card h-100 border-0";

  const poster = document.createElement("div");
  poster.className = "position-relative";

  const img = document.createElement("img");
  img.className = "card-img-top";
  img.src = anime.image;
  img.alt = anime.title;
  img.loading = "lazy";
  poster.appendChild(img);

  if (anime.score) {
    const score = document.createElement("span");
    score.className = "badge bg-dark text-warning score-badge";
    score.textContent = "⭐ " + anime.score;
    poster.appendChild(score);
  }

  if (anime.format) {
    const format = document.createElement("span");
    format.className = "badge bg-dark format-badge";
    format.textContent = anime.format;
    poster.appendChild(format);
  }

  const body = document.createElement("div");
  body.className = "card-body p-2 d-flex flex-column";

  const name = document.createElement("h6");
  name.className = "card-title mb-1";
  name.textContent = anime.title;

  const info = document.createElement("small");
  info.className = "text-secondary mb-2";
  info.textContent = getInfoText(anime);

  const genres = document.createElement("div");
  genres.className = "d-flex flex-wrap gap-1 mb-2";
  for (let i = 0; i < anime.genres.length && i < 2; i++) {
    const genre = document.createElement("span");
    genre.className = "badge text-bg-secondary fw-normal";
    genre.textContent = anime.genres[i];
    genres.appendChild(genre);
  }

  body.appendChild(name);
  body.appendChild(info);
  body.appendChild(genres);

  if (inMyList) {
    // on my list show a status dropdown and a remove button
    const actions = document.createElement("div");
    actions.className = "d-flex gap-1 mt-auto";

    const select = document.createElement("select");
    select.className = "form-select form-select-sm";
    const options = ["Plan to Watch", "Watching", "Completed"];
    for (let i = 0; i < options.length; i++) {
      const option = document.createElement("option");
      option.textContent = options[i];
      select.appendChild(option);
    }
    select.value = anime.watchStatus;
    select.onclick = function (e) {
      e.stopPropagation();
    };
    select.onchange = function () {
      changeStatus(anime.id, select.value);
    };

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-sm btn-outline-danger";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove";
    removeBtn.onclick = function (e) {
      e.stopPropagation();
      toggleList(anime);
    };

    actions.appendChild(select);
    actions.appendChild(removeBtn);
    body.appendChild(actions);
  } else {
    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-purple w-100 mt-auto add-btn";
    btn.dataset.id = anime.id;
    btn.onclick = function (e) {
      e.stopPropagation(); // so the popup doesn't open
      toggleList(anime);
    };
    body.appendChild(btn);
  }

  card.onclick = function () {
    openPopup(anime);
  };

  card.appendChild(poster);
  card.appendChild(body);
  col.appendChild(card);
  updateButtons(col);
  return col;
}

function getInfoText(anime) {
  const parts = [];
  if (anime.year) parts.push(anime.year);
  if (anime.episodes) parts.push(anime.episodes + (anime.episodes === 1 ? " ep" : " eps"));
  if (anime.status) parts.push(anime.status);
  return parts.join(" · ");
}

// ----- my list -----

function findInList(id) {
  for (let i = 0; i < myList.length; i++) {
    if (myList[i].id === id) {
      return myList[i];
    }
  }
  return null;
}

function saveList() {
  localStorage.setItem("myList", JSON.stringify(myList));
  listCount.textContent = myList.length;
}

function toggleList(anime) {
  if (findInList(anime.id)) {
    myList = myList.filter(function (item) {
      return item.id !== anime.id;
    });
    showToast("Removed from My List");
  } else {
    anime.watchStatus = "Plan to Watch";
    myList.push(anime);
    showToast("Added to My List ✓");
  }

  saveList();
  updateButtons(document);
  updatePopupButtons();

  if (currentTab === "mylist") {
    showMyList();
  }
}

function changeStatus(id, status) {
  const anime = findInList(id);
  anime.watchStatus = status;
  saveList();
  showToast("Moved to " + status);

  if (currentTab === "mylist" && listFilter !== "All") {
    showMyList();
  }
}

// update every "+ My List" button on the page
function updateButtons(parent) {
  const buttons = parent.querySelectorAll(".add-btn");
  for (let i = 0; i < buttons.length; i++) {
    let id = Number(buttons[i].dataset.id);
    if (buttons[i].id === "hero-add" && heroAnime) id = heroAnime.id;
    if (buttons[i].id === "popup-add" && popupAnime) id = popupAnime.id;

    if (findInList(id)) {
      buttons[i].textContent = "✓ In My List";
      buttons[i].classList.add("added");
    } else {
      buttons[i].textContent = "+ My List";
      buttons[i].classList.remove("added");
    }
  }
}

function showMyList() {
  title.textContent = "My List";
  grid.innerHTML = "";
  message.textContent = "";

  let shown = 0;
  for (let i = myList.length - 1; i >= 0; i--) {
    if (listFilter === "All" || myList[i].watchStatus === listFilter) {
      grid.appendChild(createCard(myList[i], true));
      shown++;
    }
  }

  if (myList.length === 0) {
    message.textContent = "Your list is empty. Add some anime!";
  } else if (shown === 0) {
    message.textContent = "Nothing in " + listFilter + " yet.";
  }
}

// ----- hero banner -----

async function loadHero() {
  try {
    const result = await fetchAnime({ page: 1, sort: ["TRENDING_DESC"] });

    // pick the first one that has a banner image
    heroAnime = result.list[0];
    for (let i = 0; i < result.list.length; i++) {
      if (result.list[i].banner) {
        heroAnime = result.list[i];
        break;
      }
    }

    document.getElementById("hero").style.backgroundImage = "url(" + heroAnime.banner + ")";
    document.getElementById("hero-title").textContent = heroAnime.title;
    document.getElementById("hero-info").textContent = (heroAnime.score ? "⭐ " + heroAnime.score + " · " : "") + getInfoText(heroAnime);
    document.getElementById("hero-desc").textContent = heroAnime.synopsis;
    updateButtons(document);
  } catch (error) {
    document.getElementById("hero-title").textContent = "Welcome to AnimeFinder";
  }
}

// ----- popup -----

function openPopup(anime) {
  popupAnime = anime;

  document.getElementById("popup-banner").style.backgroundImage = anime.banner ? "url(" + anime.banner + ")" : "none";
  document.getElementById("popup-cover").src = anime.image;
  document.getElementById("popup-title").textContent = anime.title;
  document.getElementById("popup-info").textContent = (anime.score ? "⭐ " + anime.score + " · " : "") + getInfoText(anime);
  document.getElementById("popup-synopsis").textContent = anime.synopsis;

  const genres = document.getElementById("popup-genres");
  genres.innerHTML = "";
  for (let i = 0; i < anime.genres.length; i++) {
    const genre = document.createElement("span");
    genre.className = "badge text-bg-secondary fw-normal";
    genre.textContent = anime.genres[i];
    genres.appendChild(genre);
  }

  document.getElementById("d-format").textContent = anime.format || "-";
  document.getElementById("d-episodes").textContent = anime.episodes || "?";
  document.getElementById("d-duration").textContent = anime.duration ? anime.duration + " min" : "-";
  document.getElementById("d-status").textContent = anime.status;
  document.getElementById("d-studio").textContent = anime.studio;
  document.getElementById("d-popularity").textContent = anime.popularity.toLocaleString() + " fans";

  const trailer = document.getElementById("popup-trailer");
  if (anime.trailer) {
    trailer.href = anime.trailer;
    trailer.classList.remove("d-none");
  } else {
    trailer.classList.add("d-none");
  }

  document.getElementById("popup-link").href = anime.link;

  updatePopupButtons();
  popupModal.show();
}

function updatePopupButtons() {
  if (!popupAnime) return;
  updateButtons(popup);

  const statusSelect = document.getElementById("popup-status");
  const saved = findInList(popupAnime.id);
  if (saved) {
    statusSelect.value = saved.watchStatus;
    statusSelect.classList.remove("d-none");
  } else {
    statusSelect.classList.add("d-none");
  }
}

function showToast(text) {
  document.getElementById("toast-text").textContent = text;
  toast.show();
}

// ----- tabs and search -----

function setTab(tabName) {
  currentTab = tabName;
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].dataset.tab === tabName);
  }

  if (tabName === "mylist") {
    genreSelect.classList.add("d-none");
    listFilters.classList.remove("d-none");
    loadMoreBtn.classList.add("d-none");
    showMyList();
  } else {
    genreSelect.classList.remove("d-none");
    listFilters.classList.add("d-none");
    title.textContent = tabSettings[tabName].title;
    loadAnime(false);
  }
}

function search() {
  searchText = searchInput.value.trim();
  if (searchText === "") {
    setTab("trending");
    return;
  }

  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove("active");
  }
  currentTab = "search";
  genreSelect.classList.remove("d-none");
  listFilters.classList.add("d-none");
  title.textContent = 'Results for "' + searchText + '"';
  loadAnime(false);
}

for (let i = 0; i < tabs.length; i++) {
  tabs[i].onclick = function () {
    searchText = "";
    searchInput.value = "";
    setTab(tabs[i].dataset.tab);
  };
}

for (let i = 0; i < filterBtns.length; i++) {
  filterBtns[i].onclick = function () {
    for (let j = 0; j < filterBtns.length; j++) {
      filterBtns[j].classList.remove("active");
    }
    filterBtns[i].classList.add("active");
    listFilter = filterBtns[i].dataset.status;
    showMyList();
  };
}

genreSelect.onchange = function () {
  loadAnime(false);
};

loadMoreBtn.onclick = function () {
  page++;
  loadAnime(true);
};

searchBtn.onclick = search;
searchInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    search();
  }
});

document.getElementById("hero-more").onclick = function () {
  if (heroAnime) openPopup(heroAnime);
};
document.getElementById("hero-add").onclick = function () {
  if (heroAnime) toggleList(heroAnime);
};
document.getElementById("popup-add").onclick = function () {
  toggleList(popupAnime);
};
document.getElementById("popup-status").onchange = function () {
  changeStatus(popupAnime.id, this.value);
};

// bootstrap closes the popup with esc or clicking outside
popup.addEventListener("hidden.bs.modal", function () {
  popupAnime = null;
});

listCount.textContent = myList.length;
loadHero();
setTab("trending");
