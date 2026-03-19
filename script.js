/*
  URL base da API principal.
  Vem do arquivo config.js, permitindo trocar ambiente sem alterar a lógica.
*/
const api = window.APP_CONFIG.API_BASE_URL;

/*
  Referências aos elementos principais da interface.
  Centralizar essas referências facilita manutenção e leitura.
*/
const locationInput = document.getElementById("locationInput");
const keywordInput = document.getElementById("keywordInput");
const modeSelect = document.getElementById("modeSelect");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const placesList = document.getElementById("placesList");
const mapFrame = document.getElementById("mapFrame");
const routeInfo = document.getElementById("routeInfo");
const catToggle = document.getElementById("catToggle");
const catList = document.getElementById("catList");

const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");
const loginName = document.getElementById("loginName");
const loginCpf = document.getElementById("loginCpf");
const loginPhone = document.getElementById("loginPhone");

/*
  Estado local da interface.

  allPlaces:
    armazena o resultado bruto da última busca.

  activeSlug:
    controla a categoria selecionada no filtro.

  originCache:
    guarda a origem da última busca para reutilizar no cálculo de rota.
*/
let allPlaces = [];
let activeSlug = "todos";
let originCache = "";

/*
  Recupera o id do usuário salvo localmente após o Easy Login.

  O backend é a fonte oficial do usuário.
  O localStorage apenas persiste a sessão simplificada no navegador.
*/
function getUserId() {
  const raw = localStorage.getItem("petfriendly_user");
  if (!raw) return null;

  try {
    const user = JSON.parse(raw);
    return user?.id || null;
  } catch {
    return null;
  }
}

/*
  Carrega categorias da API e monta o dropdown de filtro.

  Isso evita hardcode no front-end e mantém a interface alinhada ao banco.
*/
async function loadCategories() {
  try {
    const res = await fetch(`${api}/categories/`);
    const cats = await res.json();

    catList.innerHTML = "";

    cats.forEach((category) => {
      const li = document.createElement("li");
      li.className = "cat-item" + (category.slug === "todos" ? " active" : "");
      li.dataset.slug = category.slug;
      li.textContent = category.name;

      li.onclick = () => filterCategory(category.slug, li);
      catList.appendChild(li);
    });
  } catch (error) {
    console.error("Erro ao carregar categorias:", error);
  }
}

/*
  Define a categoria ativa e reaplica a renderização da lista.
*/
function filterCategory(slug, element) {
  activeSlug = slug;

  document.querySelectorAll(".cat-item").forEach((item) => {
    item.classList.remove("active");
  });

  element.classList.add("active");
  renderPlaces();
}

/*
  Faz a busca principal de locais.

  Fluxo:
  1. lê a localização digitada;
  2. converte CEP para endereço quando necessário;
  3. chama /places/search;
  4. salva os resultados em memória;
  5. renderiza a lista;
  6. busca o clima da região.
*/
async function buscarLocais() {
  let location = locationInput.value.trim();

  if (!location) {
    alert("Digite uma localização ou CEP.");
    return;
  }

  /*
    Se o usuário digitou CEP, o front usa ViaCEP para converter
    em endereço textual antes de chamar a API principal.
  */
  if (/^\d{5}-?\d{3}$/.test(location)) {
    const cep = location.replace("-", "");

    try {
      const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const viaCepData = await viaCepResponse.json();

      if (!viaCepData.erro) {
        location = `${viaCepData.logradouro}, ${viaCepData.bairro}, ${viaCepData.localidade} - ${viaCepData.uf}`;
      }
    } catch (error) {
      console.error("Erro ao consultar ViaCEP:", error);
    }
  }

  originCache = location;
  placesList.innerHTML = "<li>Buscando...</li>";

  const keyword = keywordInput.value.trim() || "pet friendly";

  const url = `${api}/places/search?location=${encodeURIComponent(location)}&keyword=${encodeURIComponent(keyword)}&radius=3000`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Erro na busca.");
    }

    allPlaces = data.results || [];
    renderPlaces();
    buscarClima(location);
  } catch (error) {
    placesList.innerHTML = `<li>Erro: ${error.message}</li>`;
  }
}

/*
  Renderiza a lista de locais com base:
  - no resultado da busca;
  - no filtro de categoria ativo.

  Cada card recebe três ações:
  - ver no mapa;
  - traçar rota;
  - salvar favorito.
*/
function renderPlaces() {
  let filteredPlaces = allPlaces;

  /*
    Filtro simples por tipo retornado pela API.
    Como a taxonomia do Google pode variar, o filtro é aproximado.
  */
  if (activeSlug !== "todos") {
    filteredPlaces = allPlaces.filter((place) =>
      (place.types || []).some((type) =>
        type.toLowerCase().includes(activeSlug.replace("-", "_"))
      )
    );
  }

  if (!filteredPlaces.length) {
    placesList.innerHTML = "<li>Nenhum local encontrado para esta categoria.</li>";
    return;
  }

  placesList.innerHTML = "";

  filteredPlaces.slice(0, 12).forEach((place) => {
    const nome = place.name || "Sem nome";
    const endereco = place.formatted_address || nome;
    const rating = place.rating ? `⭐ ${place.rating}` : "⭐ sem nota";

    const li = document.createElement("li");

    li.innerHTML = `
      <strong>${nome}</strong><br />
      <small>${endereco}</small><br />
      <small>${rating}</small>
      <div class="place-actions">
        <button data-map>Ver no mapa</button>
        <button data-route>Traçar rota</button>
        <button data-fav>Salvar favorito</button>
      </div>
    `;

    li.querySelector("[data-map]").onclick = () => verMapa(endereco);
    li.querySelector("[data-route]").onclick = () => calcularRota(originCache, endereco);
    li.querySelector("[data-fav]").onclick = () => salvarFavorito(place);

    placesList.appendChild(li);
  });
}

/*
  Atualiza o iframe do mapa com o endereço selecionado.
*/
function verMapa(endereco) {
  mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&z=15&output=embed`;
}

/*
  Solicita à API principal o cálculo da rota entre origem e destino.

  O backend repassa a chamada ao Google Directions.
*/
async function calcularRota(origin, destination) {
  routeInfo.textContent = "Calculando rota...";

  const url = `${api}/places/route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${modeSelect.value}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Erro ao calcular rota.");
    }

    const leg = data.routes?.[0]?.legs?.[0];

    routeInfo.textContent = leg
      ? `Distância: ${leg.distance?.text} | Duração: ${leg.duration?.text}`
      : "Sem rota disponível.";

    verMapa(destination);
  } catch (error) {
    routeInfo.textContent = `Erro: ${error.message}`;
  }
}

/*
  Salva um local como favorito para o usuário logado.

  Requisito:
  - deve existir um usuário salvo pelo Easy Login;
  - o backend recebe user_id e associa o favorito a esse usuário.
*/
async function salvarFavorito(place) {
  const userId = getUserId();

  if (!userId) {
    alert("Faça o Easy Login antes de salvar favoritos.");
    return;
  }

  const body = {
    name: place.name || "Sem nome",
    category: place.types?.[0] || "pet",
    address: place.formatted_address || "",
    latitude: place.geometry?.location?.lat ?? null,
    longitude: place.geometry?.location?.lng ?? null,
    distance_km: null,
    rating: place.rating ?? null,
  };

  try {
    const res = await fetch(`${api}/places/favorites?user_id=${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Erro ao salvar favorito.");
    }

    alert(`Favorito salvo: ${data.name}`);
  } catch (error) {
    alert(`Erro: ${error.message}`);
  }
}

/*
  Busca o clima da região pesquisada.

  Estratégia:
  - tenta extrair a cidade do texto;
  - consulta a rota /weather da API principal;
  - preenche os cards de clima.
*/
async function buscarClima(location) {
  const city = location.split(",")[1]?.trim() || location.split(",")[0].trim();

  try {
    const res = await fetch(`${api}/weather/?city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (!res.ok) return;

    document.getElementById("wTemp").textContent = `${data.temperatura}°C`;
    document.getElementById("wDesc").textContent = data.descricao;
    document.getElementById("wHum").textContent = `${data.humidade}%`;

    const icon = document.getElementById("wIcon");
    icon.src = data.icone;
    icon.style.display = "inline";
  } catch (error) {
    console.error("Erro ao buscar clima:", error);
  }
}

/*
  Fluxo de Easy Login.

  O usuário informa nome, CPF e telefone.
  A API cria ou atualiza esse usuário no banco.
  Em seguida, os dados retornados são salvos no localStorage.
*/
async function handleEasyLogin() {
  const payload = {
    name: loginName.value.trim(),
    cpf: loginCpf.value.trim(),
    phone: loginPhone.value.trim(),
  };

  if (!payload.name || !payload.cpf || !payload.phone) {
    loginMsg.textContent = "Preencha nome, CPF e telefone.";
    loginMsg.style.color = "#d950a6";
    return;
  }

  try {
    const res = await fetch(`${api}/users/easy-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Falha no login.");
    }

    localStorage.setItem("petfriendly_user", JSON.stringify(data));
    loginMsg.textContent = `Olá, ${data.name}! Login salvo com sucesso.`;
    loginMsg.style.color = "#4c9b5f";
  } catch (error) {
    loginMsg.textContent = error.message;
    loginMsg.style.color = "#d950a6";
  }
}

/*
  Limpa a tela para uma nova busca.

  Também redefine:
  - rota;
  - mapa;
  - clima;
  - lista de lugares.
*/
function limpar() {
  locationInput.value = "";
  placesList.innerHTML = "";
  routeInfo.textContent = "Aqui aparecerão distância e duração da rota.";
  mapFrame.src = "https://maps.google.com/maps?q=Brasil&z=5&output=embed";

  document.getElementById("wTemp").textContent = "—";
  document.getElementById("wDesc").textContent = "—";
  document.getElementById("wHum").textContent = "—";
  document.getElementById("wIcon").style.display = "none";
}

/*
  Registro dos eventos da interface.
*/
searchBtn.addEventListener("click", buscarLocais);
clearBtn.addEventListener("click", limpar);
catToggle.addEventListener("click", () => catList.classList.toggle("hidden"));

if (loginBtn) {
  loginBtn.addEventListener("click", handleEasyLogin);
}

/*
  Inicialização do dashboard.
  Ao carregar a página, as categorias já são buscadas.
*/
loadCategories();