// ============================================
// CONFIGURACIÓN INICIAL
// ============================================
document.documentElement.classList.add("js-ready");

const API_URL = "https://localhost:7245/api/Productos";
const USUARIOS_URL = "https://localhost:7245/api/Usuarios";
const EMAILS_AUTORIZADOS = [
    "tec.jereferreyra@gmail.com",
    "valentinaaudisio07@gmail.com"
];

// ============================================
// VARIABLES GLOBALES
// ============================================
let productosData = [];
let primeraCarga = true;
let productosFiltrados = [];
let productosRenderizados = 0;

// ⭐ CAMBIO 1: Cambiar de 10 a 8 para cargar en bloques de 8
const BLOQUE_CARGA = 8;

let isLoadingProductos = false;
let productoSeleccionado = null;
let idProdEliminar = null;

const LIMITE_INICIAL = 8;

// Cache de elementos del DOM
const domCache = {
    contenedor: null,
    userModal: null,
    modal: null,
    searchInput: null,
    btnBuscar: null,
    btnVerMas: null,
    hamburger: null,
    mobileMenu: null,
    greeting: null,
    mobileGreeting: null,
    toggleSearch: null,
    searchWrapper: null
};

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function activarModoModal() {
    document.documentElement.classList.add("modal-open");
    document.getElementById("pageWrapper")?.classList.add("blur-layer");
}
function desactivarModoModal() {
    document.documentElement.classList.remove("modal-open");
    document.getElementById("pageWrapper")?.classList.remove("blur-layer");
}

const safeText = (texto, fallback = "—") => {
    if (texto == null || texto === "") return fallback;
    return String(texto);
};


const normalizar = texto => {
    return texto
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quita acentos
        .replace(/s\b/g, "")            // Borra las 's' finales (convierte plural a singular)
        .replace(/\s+/g, " ")           // Quita espacios dobles
        .trim();
};

/**
 * Debounce para optimizar eventos
 */
const debounce = (func, delay) => {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

// ============================================
// AUTORIZACIÓN DE USUARIO
// ============================================

function esUsuarioAutorizado() {
    const correo = localStorage.getItem("correoDelicata");
    return correo && EMAILS_AUTORIZADOS.includes(correo.toLowerCase());
}

function verificarUsuarioAutorizado() {
    const correo = localStorage.getItem("correoDelicata");
    const usuario = localStorage.getItem("usuarioDelicata");

    // Actualizar saludo
    if (usuario) {
        if (domCache.greeting) {
            domCache.greeting.textContent = `¡Hola ${usuario}!`;

        }
        if (domCache.mobileGreeting) {
            domCache.mobileGreeting.textContent = `¡Hola ${usuario}!`;
        }
    } else {
        if (domCache.greeting) {
            domCache.greeting.textContent = "¡Hola Visitante!";
        }
        if (domCache.mobileGreeting) {
            domCache.mobileGreeting.textContent = "¡Hola Visitante!";
        }
    }

    // Mostrar/ocultar botones
    const btnLogin = document.getElementById("openLogin");
    const btnLogout = document.getElementById("logoutBtn");

    if (correo) {
        if (btnLogin) btnLogin.style.display = "none";
        if (btnLogout) btnLogout.style.display = "inline-block";
    } else {
        if (btnLogin) btnLogin.style.display = "inline-block";
        if (btnLogout) btnLogout.style.display = "none";
    }
}

// ============================================
// NORMALIZACIÓN DE PRODUCTOS
// ============================================

function normalizarProducto(producto) {
    return {
        IdProducto: producto.IdProducto ?? producto.idProducto ?? producto.id ?? null,
        Nombre: producto.Nombre ?? producto.nombre ?? "—",
        Modelo: producto.Modelo ?? producto.modelo ?? "—",
        Color: producto.Color ?? producto.color ?? "—",
        Categoria: producto.Categoria ?? producto.categoria ?? "—",
        Marca: producto.Marca ?? producto.marca ?? "—",
        Material: producto.Material ?? producto.material ?? "—",
        Medida: producto.Medida ?? producto.medida ?? "—",
        Talle: Number(producto.Talle ?? producto.talle ?? 0),
        Stock: Number(producto.Stock ?? producto.stock ?? 0),
        ImagenUrl: producto.ImagenUrl ?? producto.imagenUrl ?? "/ImagenUrl/default.jpg",
        Disponible: Number(producto.Stock ?? producto.stock ?? 0) > 0
    };
}

// ============================================
// GESTIÓN DE CAMPOS (TALLE/MEDIDA)
// ============================================

function toggleFieldsByNombre(nombre, modo = "form") {
    const nombreNormalizado = (nombre || "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ");

    let inputTalle, inputMedida;

    function toggleVisibility(input, visible) {
        if (!input) return;
        if (modo === "view") {
            const parent = input.closest(".modal-detail-item");
            if (parent) {
                parent.style.display = visible ? "" : "none";
            }
        } else {
            const parent = input.closest(".col");
            if (parent) {
                parent.style.display = visible ? "" : "none";
            }
        }
    }

    if (modo === "view") {
        inputTalle = document.getElementById("modalTalle");
        inputMedida = document.getElementById("modalMedida");
    } else if (modo === "edit") {
        inputTalle = document.getElementById("prodTalleEditar");
        inputMedida = document.getElementById("prodMedidaEditar");
    } else {
        inputTalle = document.getElementById("prodTalle");
        inputMedida = document.getElementById("prodMedida");
    }

    // Por defecto: ocultar talle, mostrar medida
    toggleVisibility(inputTalle, false);
    toggleVisibility(inputMedida, true);

    // Si es anillo, mostrar talle y ocultar medida
    if (nombreNormalizado.includes("anillo") || nombreNormalizado.includes("anillos")) {
        toggleVisibility(inputTalle, true);
        toggleVisibility(inputMedida, false);
    }
}

function appendIfVisible(formData, inputId, fieldName, defaultValue = null) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const parentCol = input.closest(".col");
    if (parentCol && parentCol.style.display !== "none") {
        const val = input.value?.trim();
        if (val) {
            formData.append(fieldName, val);
        } else if (defaultValue !== null) {
            formData.append(fieldName, defaultValue);
        }
    } else if (defaultValue !== null) {
        formData.append(fieldName, defaultValue);
    }
}

// ============================================
// INICIALIZACIÓN DEL DOM
// ============================================

function initDOMCache() {
    domCache.contenedor = document.getElementById("contenedor-productos");
    domCache.userModal = document.getElementById("userModal");
    domCache.modal = document.getElementById("modalProducto");
    domCache.searchInput = document.getElementById("sidebarSearchInput");
    domCache.btnBuscar = document.getElementById("sidebarBtnBuscar");
    domCache.btnVerMas = document.getElementById("btnVerMas");
    domCache.hamburger = document.querySelector(".hamburger");
    domCache.mobileMenu = document.querySelector(".mobile-menu");
    domCache.greeting = document.getElementById("greeting");
    domCache.mobileGreeting = document.getElementById("mobileGreeting");
    domCache.toggleSearch = document.getElementById("toggleSearch");
    domCache.searchWrapper = document.getElementById("searchWrapper");
}

// ============================================
// CREACIÓN DE TARJETAS DE PRODUCTO
// ============================================

function crearTarjetaDOM(producto, index) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.id = producto.IdProducto;

    // Imagen
    const img = new Image();
    img.src = safeText(producto.ImagenUrl);
    img.alt = `${safeText(producto.Nombre)} - ${safeText(producto.Color)}`;

    if (index < 6) {
        img.loading = "eager";
        img.fetchPriority = "high";
    } else {
        img.loading = "lazy";
        img.fetchPriority = "low";
    }
    img.decoding = "async";

    card.classList.add("loading");
    img.onload = () => card.classList.remove("loading");

    card.appendChild(img);

    // Contenido
    const content = document.createElement("div");
    content.className = "product-card-content";

    const title = document.createElement("h3");
    title.textContent = safeText(producto.Nombre);
    content.appendChild(title);

    // Grid de información
    const infoGrid = document.createElement("div");
    infoGrid.className = "product-info-grid";

    const infoItems = [
        { icon: "fa-tag", label: "Modelo", value: producto.Modelo },
        { icon: "fa-palette", label: "Color", value: producto.Color },
        { icon: "fa-copyright", label: "Marca", value: producto.Marca },
        { icon: "fa-layer-group", label: "Categoría", value: producto.Categoria }
    ];

    infoItems.forEach(item => {
        if (item.value && item.value !== "0" && item.value !== "—") {
            const infoItem = document.createElement("div");
            infoItem.className = "product-info-item";
            infoItem.innerHTML = `
                <i class="fa-solid ${item.icon}"></i>
                <span><span class="product-info-label">${item.label}:</span> ${safeText(item.value)}</span>
            `;
            infoGrid.appendChild(infoItem);
        }
    });

    content.appendChild(infoGrid);

    // Badge de disponibilidad
    const disponible = producto.Stock > 0;
    const badge = document.createElement("span");
    badge.className = "disponible " + (disponible ? "en-stock" : "sin-stock");
    badge.textContent = disponible ? "✓ En stock" : "✕ Sin stock";
    content.appendChild(badge);

    card.appendChild(content);

    // Evento click
    card.addEventListener("click", () => abrirModal(producto), { passive: true });

    return card;
}

// ============================================
// SKELETONS (CARGA)
// ============================================

function renderSkeletons(count = 8) {
    if (!domCache.contenedor) return;

    domCache.contenedor.innerHTML = "";
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement("div");
        skeleton.className = "product-card-skeleton";
        skeleton.innerHTML = `
            <div class="skeleton-image"></div>
            <div class="skeleton-content">
                <div class="skeleton-title"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
            </div>
        `;
        fragment.appendChild(skeleton);
    }

    domCache.contenedor.appendChild(fragment);
}

// ============================================
// RENDERIZADO PROGRESIVO
// ============================================

function renderizarProductosProgresivo(cantidad = BLOQUE_CARGA) {
    const limite = Math.min(productosRenderizados + cantidad, productosFiltrados.length);
    const fragment = document.createDocumentFragment();

    for (let i = productosRenderizados; i < limite; i++) {
        const card = crearTarjetaDOM(productosFiltrados[i], i);
        card.classList.add("fade-in-node");
        const delay = (i - productosRenderizados) * 0.01;
        card.style.animationDelay = `${delay}s`;
        fragment.appendChild(card);
    }

    domCache.contenedor.appendChild(fragment);
    productosRenderizados = limite;

    // Botón "Ver más"
    if (domCache.btnVerMas) {
        domCache.btnVerMas.style.display =
            productosRenderizados < productosFiltrados.length ? "block" : "none";
    }
}

// ============================================
// CARGA DE PRODUCTOS DESDE API
// ============================================

async function cargarProductos() {
    if (isLoadingProductos) return;
    isLoadingProductos = true;

    try {
        if (primeraCarga) {
            renderSkeletons(8);
        }

        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Error cargando productos");

        const data = await response.json();
        productosData = data.map(normalizarProducto);
        productosFiltrados = [...productosData];

        if (primeraCarga) {
            productosRenderizados = 0;
            domCache.contenedor.innerHTML = "";
            renderizarProductosProgresivo(LIMITE_INICIAL);
            primeraCarga = false;
        }

        // Mostrar botón "Ver más" si hay más productos
        if (domCache.btnVerMas) {
            domCache.btnVerMas.style.display =
                productosFiltrados.length > LIMITE_INICIAL ? "block" : "none";
        }

    } catch (error) {
        console.error("Error cargando productos", error);
        domCache.contenedor.innerHTML = `
            <p style="grid-column:1/-1;text-align:center;padding:50px">
                Error al cargar productos.
            </p>`;
        domCache.btnVerMas.style.display = "none";
    } finally {
        isLoadingProductos = false;
    }
}

// ============================================
// BÚSQUEDA DE PRODUCTOS
// ============================================

const ejecutarBusqueda = () => {
    const textoDesktop = domCache.searchInput?.value || "";
    const textoMovil = document.getElementById("mobileSearchInput")?.value || "";
    const textoBusqueda = normalizar(textoMovil || textoDesktop);

    productosFiltrados = productosData.filter(producto => {
        const camposCombinados = [
            producto.Nombre,
            producto.Modelo,
            producto.Color,
            producto.Marca,
            producto.Material,
            producto.Categoria?.Nombre || producto.Categoria
        ].filter(Boolean).join(" ");

        return normalizar(camposCombinados).includes(textoBusqueda);
    });

    productosRenderizados = 0;
    domCache.contenedor.innerHTML = "";

    if (productosFiltrados.length === 0) {
        domCache.contenedor.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:50px;min-height: 30svh;display: flex;justify-content: center;align-items: center;">
                No se encontraron productos
            </div>`;
        if (domCache.btnVerMas) {
            domCache.btnVerMas.style.display = "none";
        }
        return;
    }

    renderizarProductosProgresivo();

    if (domCache.btnVerMas) {
        domCache.btnVerMas.style.display =
            productosFiltrados.length > LIMITE_INICIAL ? "block" : "none";
    }
};

const busquedaDebounced = debounce(ejecutarBusqueda, 500);

// ============================================
// TOGGLE DE BÚSQUEDA
// ============================================

function inicializarToggleBusqueda() {
    if (!domCache.toggleSearch || !domCache.searchWrapper) return;

    domCache.toggleSearch.addEventListener("click", () => {
        const isActive = domCache.searchWrapper.classList.toggle("active");
        domCache.toggleSearch.setAttribute("aria-expanded", isActive);

        if (isActive && domCache.searchInput) {
            setTimeout(() => domCache.searchInput.focus(), 150);
        }
    });
}

// ============================================
// FILTROS POR CATEGORÍA
// ============================================

function inicializarFiltrosCategorias() {
    const categorias = document.querySelectorAll(".categories-vertical a");

    categorias.forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            const categoriaSeleccionada = normalizar(e.target.dataset.cat || "");
            console.log("Cat seleccionada:", categoriaSeleccionada);
            console.log("Contenido de productosData:", productosData);
            // Actualizar clase "active"
            categorias.forEach(cat => cat.classList.remove("active"));
            e.target.classList.add("active");

            // Evitar múltiples clicks
            if (domCache.contenedor.classList.contains("is-changing")) return;

            domCache.contenedor.classList.add("is-changing");

            setTimeout(() => {
                domCache.contenedor.replaceChildren();
                productosRenderizados = 0;

                // Filtrar productos
              
                if (categoriaSeleccionada === "" || categoriaSeleccionada === "todos" || categoriaSeleccionada === "todo") {
                    productosFiltrados = [...productosData];
                } else {
                    productosFiltrados = productosData.filter(producto => {
                        const categoriaProd = normalizar(
                            producto.Categoria?.Nombre ||
                            producto.categoria?.Nombre ||
                            producto.Categoria ||
                            producto.categoria ||
                            ""
                        );
                        return categoriaProd.includes(categoriaSeleccionada) ||
                            categoriaSeleccionada.includes(categoriaProd);
                    });
                }

                // Si no hay productos
                if (productosFiltrados.length === 0) {
                    domCache.contenedor.innerHTML = `
        <p class="mensaje-sin-productos">
            No hay productos en esta categoría
        </p>`;
                    if (domCache.btnVerMas) {
                        domCache.btnVerMas.style.display = "none";
                    }
                    domCache.contenedor.classList.remove("is-changing");
                    return;
                }

                // Renderizar productos
                if (domCache.btnVerMas) {
                    domCache.btnVerMas.style.display = "flex";
                }

                renderizarProductosProgresivo();
                domCache.contenedor.classList.remove("is-changing");

                // Scroll suave si es necesario
                const rect = domCache.contenedor.getBoundingClientRect();
                if (rect.top < -100 || rect.top > window.innerHeight) {
                    domCache.contenedor.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }, 180);
        });
    });
}

// ============================================
// MODAL DE PRODUCTO
// ============================================
function cerrarModal() {
    if (!domCache.modal) return;

    if (domCache.modal.contains(document.activeElement)) {
        document.activeElement.blur();
    }

    domCache.modal.classList.remove("show");

    domCache.modal.setAttribute("aria-hidden", "true");
    domCache.modal.setAttribute("inert", "");
    desactivarModoModal();
}

function abrirModal(producto) {
    productoSeleccionado = producto;
    if (!domCache.modal) return;

    const esAdmin = esUsuarioAutorizado();

    // Detalles del producto
    const detalles = [
        { label: "Modelo", value: producto.Modelo, icon: "fa-tag", id: "modalModelo" },
        { label: "Color", value: producto.Color, icon: "fa-palette", id: "modalColor" },
        { label: "Categoría", value: producto.Categoria, icon: "fa-layer-group", id: "modalCategoria" },
        { label: "Marca", value: producto.Marca, icon: "fa-copyright", id: "modalMarca" },
        { label: "Material", value: producto.Material, icon: "fa-gem", id: "modalMaterial" },
        { label: "Medida", value: producto.Medida !== "—" ? `${producto.Medida}` : null, icon: "fa-ruler-horizontal", id: "modalMedida" },
        { label: "Talle", value: producto.Talle, icon: "fa-ruler-horizontal", id: "modalTalle" },
        { label: "Stock", value: producto.Stock, icon: "fa-boxes-stacked", id: "modalStock" }
    ]
        .filter(item => item.value && item.value !== "—" && item.value !== "0" && item.value !== 0)
        .map(item => `
        <div class="modal-detail-item" id="${item.id}">
            <div class="modal-detail-label">
                <i class="fa-solid ${item.icon}"></i> ${item.label}
            </div>
            <div class="modal-detail-value">${safeText(item.value)}</div>
        </div>
    `)
        .join("");

    // Acciones
    const acciones = `
        <div class="modal-actions-container ${esAdmin ? "" : "solo-whatsapp"}">
            <a href="https://wa.me/5493573446504?text=Hola Vale, cómo estás? Me interesa ${encodeURIComponent(safeText(producto.Nombre))} modelo ${encodeURIComponent(safeText(producto.Modelo))}. Me podrías pasar el precio? Gracias!"
   target="_blank"
   rel="noopener noreferrer"
   class="modal-whatsapp"
   aria-label="Consultar precio por WhatsApp">
    <i class="fa-brands fa-whatsapp"></i>
    Consultar precio
</a>

            ${esAdmin ? `
                <button class="btn-admin-action btn-admin-add">
                    <i class="fa-solid fa-plus"></i>
                    Agregar
                </button>
                <button class="btn-admin-action btn-admin-edit" data-id="${producto.IdProducto}">
                    <i class="fa-solid fa-pen-to-square"></i>
                    Editar
                </button>
                <button class="btn-admin-action btn-admin-delete" data-id="${producto.IdProducto}">
                    <i class="fa-solid fa-trash"></i>
                    Eliminar
                </button>
            ` : ""}
        </div>
    `;

    domCache.modal.innerHTML = `
        <div class="modal-content ${esAdmin ? "modo-admin" : "modo-user"}">
            <button class="modal-close-new" aria-label="Cerrar modal">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <div class="modal-body">
                <div class="modal-image-container-centered">
                    <img src="${safeText(producto.ImagenUrl)}"
                         alt="${safeText(producto.Nombre)} - Imagen detallada">
                </div>

                <div class="modal-info-container">
                    <h2 id="modalNombre">${safeText(producto.Nombre)}</h2>

                    <div class="modal-details">
                        ${detalles}
                    </div>

                    ${acciones}
                </div>
            </div>
        </div>
    `;

    toggleFieldsByNombre(producto.Nombre, "view");

    // Eventos
    const btnClose = domCache.modal.querySelector(".modal-close-new");
    btnClose?.addEventListener("click", cerrarModal);



    if (esAdmin) {
        domCache.modal.querySelector(".btn-admin-add")?.addEventListener("click", () => {
            cerrarModal();
            abrirFormularioNuevo();

        });

        domCache.modal.querySelector(".btn-admin-edit")?.addEventListener("click", () => {
            cerrarModal();
            abrirEditarProducto(producto.IdProducto);
        });

        domCache.modal.querySelector(".btn-admin-delete")?.addEventListener("click", () => {
            cerrarModal();
            abrirEliminarProducto(producto.IdProducto, producto.Nombre);
        });
    }

    domCache.modal.classList.add("show");
    domCache.modal.removeAttribute("inert");
    domCache.modal.setAttribute("aria-hidden", "false");
    activarModoModal();



    btnClose?.focus();
}

// ============================================
// CRUD: AGREGAR PRODUCTO
// ============================================

function abrirFormularioNuevo() {
    const modal = document.getElementById("modalAgregar");
    if (!modal) return;

    const form = document.getElementById("formAgregar");
    if (form) form.reset();

    const preview = document.getElementById("imgPreviewAgregar");
    if (preview) {
        preview.src = "";
        preview.style.display = "none";
    }

    modal.classList.add("active");
    activarModoModal();
    cargarOpcionesDatalist();
    toggleFieldsByNombre("", "add");

    const inputNombre = document.getElementById("prodNombre");
    if (inputNombre) {
        inputNombre.addEventListener("input", () => {
            toggleFieldsByNombre(inputNombre.value, "add");
        });
    }
}
async function guardarNuevoProducto() {
    try {
        const formData = new FormData();

        // ... (Tu código de recolección de datos se mantiene igual)
        formData.append("Nombre", document.getElementById("prodNombre").value.trim());
        formData.append("Modelo", document.getElementById("prodModelo").value.trim());
        formData.append("Color", document.getElementById("prodColor").value.trim());

        let categoriaValue = document.getElementById("prodCategoria").value.trim();
        formData.append("Categoria", categoriaValue);
        formData.append("Marca", document.getElementById("prodMarca").value.trim());
        formData.append("Material", document.getElementById("prodMaterial").value.trim());

        appendIfVisible(formData, "prodMedida", "Medida", "");
        appendIfVisible(formData, "prodTalle", "Talle", "0");
        formData.append("Stock", document.getElementById("prodStock").value || "0");

        const imagen = document.getElementById("prodImagen").files[0];
        if (imagen) {
            formData.append("imagen", imagen);
        }

        const response = await fetch(API_URL, {
            method: "POST",
            body: formData
        });

        // --- CAMBIO AQUÍ: Procesamiento inteligente del error ---
        if (!response.ok) {
            const errorData = await response.json(); // Intentamos leer el JSON de errores

            if (errorData.errors) {
                // Extraemos los mensajes definidos en tu ProductoCreateDTO
                let mensajes = Object.values(errorData.errors).flat().join("\n");
                alert("Errores de validación:\n" + mensajes);
            } else {
                alert("Error al agregar producto: " + (errorData.title || "Error desconocido"));
            }
            return;
        }
        // --------------------------------------------------------

        cerrarModalCRUD("modalAgregar");
        await cargarProductos();

        const filtroActivo = document.querySelector(".categories-vertical a.active");
        if (filtroActivo && filtroActivo.dataset.cat !== "todos") {
            filtroActivo.click();
        }
    } catch (error) {
        console.error("Error completo:", error);
        alert("Error inesperado: " + error.message);
    }
}
// ============================================
// CRUD: EDITAR PRODUCTO
// ============================================
function abrirEditarProducto(id) {
    if (!id) return;

    // 1. BUSCAR LOS DATOS EN MEMORIA (Instantáneo, sin fetch)
    // Buscamos el producto en nuestro array local de productosData
    const producto = productosData.find(p => p.IdProducto == id || p.id == id);

    if (!producto) {
        console.error("Producto no encontrado en memoria, reintentando con API...");
        // Opcional: Si no está en memoria, podrías llamar a la API como backup
        return;
    }

    const modal = document.getElementById("modalEditar");
    const form = document.getElementById("formEditar");
    const preview = document.getElementById("imgPreviewEditar");

    // 2. LLENADO DE DATOS (Sincrónico y ultra rápido)
    if (modal) {
        if (form) form.reset();

        // Mapeamos los datos del objeto local a los inputs
        document.getElementById("prodIdEditar").value = id;
        document.getElementById("prodNombreEditar").value = producto.Nombre || producto.nombre || "";
        document.getElementById("prodModeloEditar").value = producto.Modelo || producto.modelo || "";
        document.getElementById("prodColorEditar").value = producto.Color || producto.color || "";
        document.getElementById("prodCategoriaEditar").value = producto.Categoria || producto.categoria || "";
        document.getElementById("prodMarcaEditar").value = producto.Marca || producto.marca || "";
        document.getElementById("prodMaterialEditar").value = producto.Material || producto.material || "";
        document.getElementById("prodMedidaEditar").value = producto.Medida || producto.medida || "";
        document.getElementById("prodTalleEditar").value = producto.Talle || producto.talle || "";
        document.getElementById("prodStockEditar").value = producto.Stock || producto.stock || "";

        // Imagen instantánea
        if (preview && (producto.ImagenUrl || producto.imagenUrl)) {
            preview.src = producto.ImagenUrl || producto.imagenUrl;
            preview.style.display = "block";
        }

        // 3. MOSTRAR TODO JUNTO
        // Al final activamos el modal, así ya aparece con los inputs llenos
        modal.classList.add("active");
        activarModoModal();
        
        // Ejecutamos lógicas visuales
        toggleFieldsByNombre(producto.Nombre || producto.nombre, "edit");
    }
}
function handleNombreChange(e) {
    toggleFieldsByNombre(e.target.value, "edit");
}

async function guardarEdicionProducto() {
    try {
        const id = document.getElementById("prodIdEditar").value;
        if (!id) {
            alert("Error: ID de producto inválido");
            return;
        }
        const formData = new FormData();
        formData.append("id_producto", id);
        formData.append("Nombre", document.getElementById("prodNombreEditar").value);
        formData.append("Modelo", document.getElementById("prodModeloEditar").value || "");
        formData.append("Color", document.getElementById("prodColorEditar").value || "");

        // ✅ CAMBIO AQUÍ: Normalizar categoría
        let categoriaValueEdit = document.getElementById("prodCategoriaEditar").value.trim();

        formData.append("Categoria", categoriaValueEdit);


        formData.append("Marca", document.getElementById("prodMarcaEditar").value);
        formData.append("Material", document.getElementById("prodMaterialEditar").value || "");
        const nombre = document.getElementById("prodNombreEditar").value;
        if (nombre.toLowerCase().includes("anillo")) {
            const talle = document.getElementById("prodTalleEditar").value;
            formData.append("Talle", talle || "0");
            formData.append("Medida", "");
        } else {
            const medida = document.getElementById("prodMedidaEditar").value;
            formData.append("Medida", medida || "");
            formData.append("Talle", "0");
        }
        formData.append("Stock", document.getElementById("prodStockEditar").value || "0");
        const imagen = document.getElementById("prodImagenEditar").files[0];
        if (imagen) {
            formData.append("imagen", imagen);
        }

        // ✅ CAMBIO AQUÍ: Paréntesis en lugar de backticks
        const response = await fetch(`${API_URL}/${id}`, {
            method: "PUT",
            body: formData
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error al editar producto:", errorText);
            alert("Error al editar producto: " + errorText);
            return;
        }
        cerrarModalCRUD("modalEditar");

        // ✅ CAMBIO AQUÍ: Paréntesis en lugar de backticks
        const responseGet = await fetch(`${API_URL}/${id}`);
        if (responseGet.ok) {
            const productoActualizado = normalizarProducto(await responseGet.json());
            const index = productosData.findIndex(p => p.IdProducto == id);
            if (index !== -1) {
                productosData[index] = productoActualizado;
                productosFiltrados = [...productosData];

                // ✅ CAMBIO AQUÍ: Paréntesis en lugar de backticks
                const cardExistente = document.querySelector(`[data-id="${id}"]`);
                if (cardExistente) {
                    const nuevaCard = crearTarjetaDOM(productoActualizado, index);
                    cardExistente.replaceWith(nuevaCard);
                }
            }
        }
    } catch (error) {
        console.error(error);
        alert("Error inesperado.");
    }
}

// ============================================
// CRUD: ELIMINAR PRODUCTO
// ============================================

function abrirEliminarProducto(id, nombre) {
    idProdEliminar = id;

    const texto = document.getElementById("prodTextoEliminar");
    if (texto) {
        texto.textContent = `¿Seguro que desea eliminar "${nombre}"?`;
    }

    const modal = document.getElementById("modalEliminar");
    if (modal) {
        modal.classList.add("active");
        activarModoModal();

    }
}

async function confirmarEliminar() {
    if (!idProdEliminar) {
        alert("ID inválido");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${idProdEliminar}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("No se pudo eliminar");
        }

        cerrarModalCRUD("modalEliminar");

        // --- SOLUCIÓN AQUÍ ---
        // 1. Resetear el estado de carga para que cargarProductos se comporte como al inicio
        primeraCarga = true;
        productosRenderizados = 0;

        // 2. Volver a cargar y renderizar desde cero
        await cargarProductos();

        idProdEliminar = null;

    } catch (error) {
        console.error("Error eliminando:", error);
        alert("No se pudo eliminar el producto");
    }
}
// ============================================
// CERRAR MODALES CRUD
// ============================================

function cerrarModalCRUD(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("active");
    desactivarModoModal();
}



function resetFormAndClose(modalId, formId) {
    const form = document.getElementById(formId);
    if (form) form.reset();

    const preview = document.querySelector(`#${modalId} img[id*="Preview"]`);
    if (preview) {
        preview.src = "";
        preview.style.display = "none";
    }

    cerrarModalCRUD(modalId);
}

// ============================================
// DATALISTS (CATEGORÍAS, MARCAS, MATERIALES)
// ============================================

async function cargarOpcionesDatalist() {
    try {
        const baseUrl = API_URL.replace("/Productos", "");

        const [categorias, marcas, materiales] = await Promise.all([
            fetch(`${baseUrl}/Categorias`).then(r => r.json()),
            fetch(`${baseUrl}/Marcas`).then(r => r.json()),
            fetch(`${baseUrl}/Materiales`).then(r => r.json())
        ]);

        const dlCategorias = document.getElementById("dlCategorias");
        const dlMarcas = document.getElementById("dlMarcas");
        const dlMateriales = document.getElementById("dlMateriales");

        if (dlCategorias) {
            dlCategorias.innerHTML = "";
            categorias.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat.Nombre;
                option.dataset.id = cat.id;
                dlCategorias.appendChild(option);
            });
        }

        if (dlMarcas) {
            dlMarcas.innerHTML = "";
            marcas.forEach(marca => {
                const option = document.createElement("option");
                option.value = marca.Nombre;
                option.dataset.id = marca.id;
                dlMarcas.appendChild(option);
            });
        }

        if (dlMateriales) {
            dlMateriales.innerHTML = "";
            materiales.forEach(mat => {
                const option = document.createElement("option");
                option.value = mat.Nombre;
                option.dataset.id = mat.id;
                dlMateriales.appendChild(option);
            });
        }

    } catch (error) {
        console.error("Error al cargar los datalist:", error);
    }
}

async function cargarOpcionesDatalistEditar() {
    try {
        const baseUrl = API_URL.replace("/Productos", "");

        const [categorias, marcas, materiales] = await Promise.all([
            fetch(`${baseUrl}/Categorias`).then(r => r.json()),
            fetch(`${baseUrl}/Marcas`).then(r => r.json()),
            fetch(`${baseUrl}/Materiales`).then(r => r.json())
        ]);

        const dlCategorias = document.getElementById("dlCategoriasEditar");
        const dlMarcas = document.getElementById("dlMarcasEditar");
        const dlMateriales = document.getElementById("dlMaterialesEditar");

        if (dlCategorias) {
            dlCategorias.innerHTML = "";
            categorias.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat.Nombre;
                option.dataset.id = cat.id;
                dlCategorias.appendChild(option);
            });
        }

        if (dlMarcas) {
            dlMarcas.innerHTML = "";
            marcas.forEach(marca => {
                const option = document.createElement("option");
                option.value = marca.Nombre;
                option.dataset.id = marca.id;
                dlMarcas.appendChild(option);
            });
        }

        if (dlMateriales) {
            dlMateriales.innerHTML = "";
            materiales.forEach(mat => {
                const option = document.createElement("option");
                option.value = mat.Nombre;
                option.dataset.id = mat.id;
                dlMateriales.appendChild(option);
            });
        }

    } catch (error) {
        console.error("Error al cargar los datalist:", error);
    }
}

// ============================================
// MENÚ MÓVIL
// ============================================

function inicializarMenuMovil() {
    const hamburger = domCache.hamburger;
    const mobileMenu = domCache.mobileMenu;
    const closeBtn = document.querySelector(".menu-close");

    if (!hamburger || !mobileMenu) return;

    hamburger.addEventListener("click", () => {
        const isActive = mobileMenu.classList.toggle("active");
        hamburger.setAttribute("aria-expanded", isActive);

        if (isActive) {
            document.body.classList.add("menu-open");
        } else {
            document.body.classList.remove("menu-open");
        }
    });

    closeBtn?.addEventListener("click", () => {
        mobileMenu.classList.remove("active");
        hamburger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
    });

    // Categorías móviles
    document.querySelectorAll(".mobile-categories li").forEach(item => {
        item.addEventListener("click", () => {
            const cat = item.dataset.cat;
            const link = document.querySelector(
                `.categories-vertical a[data-cat="${cat}"]`
            );
            link?.click();

            mobileMenu.classList.remove("active");
            hamburger.setAttribute("aria-expanded", "false");
            document.body.classList.remove("menu-open");
        });
    });
}

// ============================================
// MODAL DE USUARIO (LOGIN/REGISTER)
// ============================================

function openUserModalAsLogin() {
    if (!domCache.userModal) return;

    domCache.userModal.innerHTML = `
        <div class="user-modal-content">
            <button class="modal-close-new" aria-label="Cerrar modal">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <h2 class="user-title">Iniciar sesión</h2>

            <form id="loginFormLocal">
                <input type="email" id="loginCorreoLocal" placeholder="Correo electrónico" required>
                <input type="password" id="loginContrasenaLocal" placeholder="Contraseña" required>

                <a href="#" class="forgot-password">¿Olvidaste tu contraseña?</a>

                <button type="submit" class="btn-user">Iniciar Sesión</button>
            </form>

            <hr>
            <p>¿No tenés cuenta?</p>
            <button type="button" id="toRegisterBtn" class="btn-user">Registrar</button>
        </div>
    `;

    domCache.userModal.style.display = "flex";
    activarModoModal();
    // Forzar reflow para transición
    requestAnimationFrame(() => {
        domCache.userModal.classList.add("active");
    });



    domCache.userModal.querySelector(".modal-close-new")?.addEventListener("click", cerrarModalUsuario);
    document.getElementById("toRegisterBtn")?.addEventListener("click", openUserModalAsRegister);
    document.getElementById("loginFormLocal")?.addEventListener("submit", handleLogin);
    domCache.userModal.querySelector(".forgot-password")?.addEventListener("click", e => {
        e.preventDefault();
        openRecuperarModal();
    });

    setTimeout(() => domCache.userModal.querySelector("input")?.focus(), 100);
}

function openUserModalAsRegister() {
    if (!domCache.userModal) return;

    domCache.userModal.innerHTML = `
        <div class="user-modal-content">
            <button class="modal-close-new" aria-label="Cerrar modal">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <h2 class="user-title">Crear cuenta</h2>
            <form id="registerFormLocal">
                <input type="text" id="regNombreLocal" placeholder="Nombre completo" required>
                <input type="email" id="regCorreoLocal" placeholder="Correo electrónico" required>
                <input type="password" id="regContrasenaLocal" placeholder="Contraseña" required>
                <button type="submit" class="btn-user">Registrar</button>
            </form>
            <hr>
            <p>¿Ya tenés cuenta?</p>
            <button type="button" id="toLoginBtn" class="btn-user">Iniciar Sesión</button>
        </div>
    `;

    domCache.userModal.style.display = "flex";
    activarModoModal();
    requestAnimationFrame(() => {
        domCache.userModal.classList.add("active");
    });

    const closeBtn = domCache.userModal.querySelector(".modal-close-new");
    closeBtn?.addEventListener("click", cerrarModalUsuario);

    const toLoginBtn = document.getElementById("toLoginBtn");
    toLoginBtn?.addEventListener("click", openUserModalAsLogin);

    const form = document.getElementById("registerFormLocal");
    form?.addEventListener("submit", handleRegister);

    const firstInput = domCache.userModal.querySelector("input");
    setTimeout(() => firstInput?.focus(), 100);
}

function cerrarModalUsuario() {
    if (!domCache.userModal) return;

    domCache.userModal.classList.remove("active");
    desactivarModoModal(); // moverlo acá

    setTimeout(() => {
        domCache.userModal.style.display = "none";
    }, 150);
}



function openRecuperarModal() {
    if (!domCache.userModal) return;

    domCache.userModal.innerHTML = `
        <div class="user-modal-content">
            <button class="modal-close-new" aria-label="Cerrar modal">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <h2 class="user-title">Recuperar contraseña</h2>

            <input type="email" id="recuperarEmail" placeholder="Correo electrónico" required>

            <button id="btnRecuperar" class="btn-user">Enviar enlace</button>
        </div>
    `;

    domCache.userModal.style.display = "flex";
    activarModoModal();
    requestAnimationFrame(() => {
        domCache.userModal.classList.add("active");
    });



    domCache.userModal.querySelector(".modal-close-new")?.addEventListener("click", cerrarModalUsuario);

    document.getElementById("btnRecuperar")?.addEventListener("click", async () => {
        const email = document.getElementById("recuperarEmail").value.trim();
        if (!email) {
            alert("Ingresá un correo válido");
            return;
        }

        await fetch(`${USUARIOS_URL}/recuperar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        alert("Si el correo existe, se enviará un enlace.");
        cerrarModalUsuario();
    });

    setTimeout(() => domCache.userModal.querySelector("input")?.focus(), 100);
}

// ============================================
// LOGIN/REGISTER HANDLERS
// ============================================

async function handleLogin(e) {
    e.preventDefault();

    const correo = document.getElementById("loginCorreoLocal").value;
    const contrasena = document.getElementById("loginContrasenaLocal").value;

    try {
        const response = await fetch(`${USUARIOS_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Correo: correo, Contrasena: contrasena })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("usuarioDelicata", data.userName);
            localStorage.setItem("correoDelicata", data.correo);
            verificarUsuarioAutorizado();
            cerrarModalUsuario();
            alert(`¡Bienvenido/a ${data.userName}!`);
        } else {
            alert("Error al iniciar sesión. Verifica tus credenciales.");
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error de conexión, intenta nuevamente.");
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const nombre = document.getElementById("regNombreLocal").value;
    const correo = document.getElementById("regCorreoLocal").value;
    const contrasena = document.getElementById("regContrasenaLocal").value;

    try {
        const response = await fetch(`${USUARIOS_URL}/registro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Nombre: nombre, Correo: correo, Contrasena: contrasena })
        });

        if (response.ok) {
            alert("¡Registro exitoso! Ahora puedes iniciar sesión.");
            openUserModalAsLogin();
        } else {
            const data = await response.json();
            alert(data.message || "Error al registrarse");
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error de conexión. Por favor, intenta nuevamente.");
    }
}

// ============================================
// LOGOUT
// ============================================

function mostrarLogoutConfirm() {
    const modal = document.getElementById("logoutModal");
    if (!modal) return;

    modal.style.display = "flex";
    activarModoModal();
    // ✅ AGREGAR ESTA LÍNEA para activar la animación
    requestAnimationFrame(() => {
        modal.classList.add("active");
    });

    const btnConfirm = document.getElementById("confirmLogout");
    const btnCancel = document.getElementById("cancelLogout");

    btnConfirm.onclick = () => {
        localStorage.removeItem("usuarioDelicata");
        localStorage.removeItem("correoDelicata");
        verificarUsuarioAutorizado();
        modal.classList.remove("active");
        setTimeout(() => {
            modal.style.display = "none";
            desactivarModoModal();
        }, 300);
    };

    btnCancel.onclick = () => {
        modal.classList.remove("active");
        setTimeout(() => {
            modal.style.display = "none";
            desactivarModoModal();
        }, 300);
    };
}

// ============================================
// VISTA PREVIA DE IMÁGENES
// ============================================

function configurarVistasPrevias() {
    // Agregar producto
    const inputAgregar = document.getElementById("prodImagen");
    const previewAgregar = document.getElementById("imgPreviewAgregar");

    if (inputAgregar && previewAgregar) {
        inputAgregar.addEventListener("change", () => {
            const file = inputAgregar.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                    previewAgregar.src = e.target.result;
                    previewAgregar.style.display = "block";
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Editar producto
    const inputEditar = document.getElementById("prodImagenEditar");
    const previewEditar = document.getElementById("imgPreviewEditar");

    if (inputEditar && previewEditar) {
        inputEditar.addEventListener("change", () => {
            const file = inputEditar.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                    previewEditar.src = e.target.result;
                    previewEditar.style.display = "block";
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

// ============================================
// BÚSQUEDA MÓVIL
// ============================================

const inputMovil = document.getElementById("mobileSearchInput");
const botonMovil = document.getElementById("mobileBtnBuscar");

if (inputMovil) {
    inputMovil.addEventListener("input", () => {
        busquedaDebounced();
    });
}

if (botonMovil) {
    botonMovil.addEventListener("click", () => {
        ejecutarBusqueda();
    });
}

// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    initDOMCache();
    cargarProductos();
    verificarUsuarioAutorizado();

    inicializarToggleBusqueda();
    inicializarFiltrosCategorias();
    inicializarMenuMovil();
    configurarVistasPrevias();

    // Eventos de Búsqueda
    if (domCache.searchInput) domCache.searchInput.addEventListener("input", busquedaDebounced);
    if (domCache.btnBuscar) domCache.btnBuscar.addEventListener("click", ejecutarBusqueda);

    // Botón "Ver más"
    if (domCache.btnVerMas) {
        domCache.btnVerMas.addEventListener("click", e => {
            const btn = e.currentTarget;
            btn.style.transform = "scale(0.95)";
            setTimeout(() => btn.style.transform = "", 150);
            renderizarProductosProgresivo();
        });
    }

    // Auth
    document.getElementById("openLogin")?.addEventListener("click", openUserModalAsLogin);
    document.getElementById("logoutBtn")?.addEventListener("click", mostrarLogoutConfirm);

    // Tecla ESC y Cierres
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            cerrarModal();
            cerrarModalUsuario();
            cerrarModalCRUD("modalAgregar");
            cerrarModalCRUD("modalEditar");
            cerrarModalCRUD("modalEliminar");
        }
    });

    // Cierre por click fuera
    [domCache.modal, domCache.userModal].forEach(m => {
        m?.addEventListener("click", e => { if (e.target === m) m.id.includes("user") ? cerrarModalUsuario() : cerrarModal(); });
    });

    // 🔥 PRECARGA TOTAL (Sin await para que sea instantáneo)
    // Esto "llena" el caché del navegador mientras el usuario mira la página
    cargarOpcionesDatalist().catch(() => { });
    cargarOpcionesDatalistEditar().catch(() => { });

    console.log("✨ Diamonds Accessory: Listo y Precargado");
});