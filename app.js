(() => {
  "use strict";

  const STORAGE_KEY = "inspect-ar-data-v1";
  const DB_NAME = "inspect-ar-files-v1";
  const DB_STORE = "files";
  const defaultData = { models: [], inspections: [], settings: { plant: "Unidade Sorocaba" } };
  const state = { data: loadData(), selectedProductId: null, checklist: [], objectUrls: new Map(), cameraStream: null, currentDetailId: null, operatorDraft: "", formPreviewUrl: "", formPreviewToken: 0 };
  const byId = (id) => document.getElementById(id);
  const modelDialog = byId("model-dialog");
  const viewerDialog = byId("viewer-dialog");
  const detailDialog = byId("inspection-detail-dialog");

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return structuredDefault();
      const models = (Array.isArray(saved.models) ? saved.models : []).map((model) => model.owner === "João Silva" ? { ...model, owner: "" } : model);
      const inspections = (Array.isArray(saved.inspections) ? saved.inspections : []).map((inspection) => inspection.inspector === "João Silva" ? { ...inspection, inspector: "" } : inspection);
      return {
        models,
        inspections,
        settings: { ...defaultData.settings, plant: saved.settings?.plant || defaultData.settings.plant }
      };
    } catch (error) {
      console.error("Não foi possível ler os dados locais do Inspect-AR.", error);
      return structuredDefault();
    }

  }

  function structuredDefault() {
    return { models: [], inspections: [], settings: { ...defaultData.settings } };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar os dados locais do Inspect-AR.", error);
      toast("Não foi possível salvar. O armazenamento do navegador pode estar cheio.", true);
      return false;
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("O navegador não oferece armazenamento de arquivos."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao abrir o armazenamento de arquivos."));
    });
  }

  async function fileOperation(mode, key, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, mode);
      const store = transaction.objectStore(DB_STORE);
      let request;
      if (mode === "readwrite" && value === undefined) request = store.delete(key);
      else if (mode === "readwrite") request = store.put(value, key);
      else request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao acessar um arquivo."));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("Falha ao concluir o acesso ao arquivo."));
      };
    });
  }

  async function getFileUrl(key) {
    if (!key) return "";
    if (state.objectUrls.has(key)) return state.objectUrls.get(key);
    try {
      const file = await fileOperation("readonly", key);
      if (!file) return "";
      const url = URL.createObjectURL(file);
      state.objectUrls.set(key, url);
      return url;
    } catch (error) {
      console.error(`Não foi possível carregar o arquivo ${key}.`, error);
      return "";
    }
  }

  function releaseFileUrl(key) {
    const url = state.objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    state.objectUrls.delete(key);
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `toast${error ? " error" : ""}`;
    item.textContent = message;
    byId("toast-region").appendChild(item);
    window.setTimeout(() => item.remove(), 3700);
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function navigate(pageName) {
    const page = byId(`page-${pageName}`);
    if (!page) return;
    document.querySelectorAll(".page").forEach((item) => item.classList.toggle("active", item === page));
    document.querySelectorAll(".nav-link[data-page]").forEach((item) => item.classList.toggle("active", item.dataset.page === pageName));
    const activeLabel = document.querySelector(`.nav-link[data-page="${pageName}"]`);
    byId("breadcrumb-current").textContent = activeLabel ? activeLabel.textContent.trim() : pageName === "settings" ? "Configurações" : "Visão geral";
    byId("sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (pageName === "models") renderModels();
    if (pageName === "inspection") renderProductPicker();
    if (pageName === "history") renderHistory();
  }

  function productThumb(model, className = "product-thumb") {
    if (model.imageKey) {
      return `<span class="${className}" data-image-key="${escapeHtml(model.imageKey)}"><span class="thumb-fallback">◇</span></span>`;
    }
    return `<span class="${className}">◇</span>`;
  }

  async function hydrateImages(root = document) {
    const nodes = [...root.querySelectorAll("[data-image-key]")];
    await Promise.all(nodes.map(async (node) => {
      const key = node.dataset.imageKey;
      const url = await getFileUrl(key);
      if (!url || !node.isConnected) return;
      const image = document.createElement("img");
      image.src = url;
      image.alt = "Imagem de referência";
      node.replaceChildren(image);
    }));
  }

  async function hydrateModelViewers(root = document) {
    const viewers = [...root.querySelectorAll("model-viewer[data-glb-key]")];
    await Promise.all(viewers.map(async (viewer) => {
      const url = await getFileUrl(viewer.dataset.glbKey);
      if (!viewer.isConnected) return;
      const placeholder = viewer.parentElement.querySelector("[data-model-placeholder]");
      if (!url) {
        viewer.hidden = true;
        if (placeholder) placeholder.classList.remove("hidden");
        return;
      }
      viewer.addEventListener("load", () => placeholder?.classList.add("hidden"), { once: true });
      viewer.addEventListener("error", () => {
        console.error(`Não foi possível renderizar o modelo 3D ${viewer.dataset.glbKey}.`);
        viewer.hidden = true;
        if (placeholder) placeholder.classList.remove("hidden");
      }, { once: true });
      viewer.src = url;
    }));
  }

  function renderDashboard() {
    const models = state.data.models;
    const inspections = state.data.inspections;
    const totalChecks = inspections.reduce((sum, item) => sum + item.checklist.filter((check) => check.status !== "na").length, 0);
    const passedChecks = inspections.reduce((sum, item) => sum + item.checklist.filter((check) => check.status === "conforme").length, 0);
    const ncCount = inspections.reduce((sum, item) => sum + item.checklist.filter((check) => check.status === "nao-conforme").length, 0);
    byId("stat-models").textContent = models.length;
    byId("stat-inspections").textContent = inspections.length;
    byId("stat-conformity").innerHTML = `${totalChecks ? Math.round((passedChecks / totalChecks) * 100) : "—"}<small>${totalChecks ? "%" : "%"}</small>`;
    byId("stat-nc").textContent = ncCount;
    byId("model-nav-count").textContent = models.length;
    byId("onboarding-panel").classList.toggle("hidden", models.length > 0);
    const recent = [...inspections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const recentNode = byId("recent-inspections");
    if (!recent.length) {
      recentNode.innerHTML = '<div class="empty-list">As inspeções concluídas aparecerão aqui.</div>';
    } else {
      recentNode.innerHTML = recent.map((inspection) => {
        const model = findModel(inspection.modelId, inspection.modelSnapshot);
        const passed = inspection.result === "conforme";
        return `<div class="recent-item"><div class="product-cell">${productThumb(model)}<span><strong>${escapeHtml(model.name || "Produto removido")}</strong><small>${escapeHtml(model.code || "—")}</small></span></div><span class="recent-meta">${escapeHtml(inspection.inspector || "—")}</span><span class="recent-date">${formatDate(inspection.createdAt)}</span><span class="result-badge ${passed ? "conforme" : "nao-conforme"}">${passed ? "Conforme" : "Não conforme"}</span></div>`;
      }).join("");
      hydrateImages(recentNode);
    }
    byId("setting-model-count").textContent = models.length;
    byId("setting-inspection-count").textContent = inspections.length;
    byId("plant-name").textContent = state.data.settings.plant;
    byId("session-time").textContent = formatDate(new Date(), true);
  }

  function renderModels() {
    const query = byId("model-search").value.trim().toLocaleLowerCase("pt-BR");
    const family = byId("model-family-filter").value;
    const families = [...new Set(state.data.models.map((item) => item.family).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filter = byId("model-family-filter");
    const selected = filter.value;
    filter.innerHTML = '<option value="">Todas as famílias</option>' + families.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
    filter.value = families.includes(selected) ? selected : "";
    const filtered = state.data.models.filter((model) => {
      const matchesQuery = [model.code, model.name, model.project, model.drawing].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
      return matchesQuery && (!family || model.family === family);
    });
    byId("model-result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "modelo" : "modelos"}`;
    byId("model-grid").innerHTML = filtered.map((model) => `<article class="model-card" data-model-card="${escapeHtml(model.id)}"><div class="model-card-visual">${model.glbKey ? `<span class="model-art hidden" data-model-placeholder>◇</span><model-viewer class="model-card-viewer" data-glb-key="${escapeHtml(model.glbKey)}" alt="Modelo 3D de ${escapeHtml(model.name)}" auto-rotate rotation-per-second="18deg" shadow-intensity="1" exposure="1" environment-image="neutral" interaction-prompt="none"></model-viewer>` : model.imageKey ? `<span class="model-art" data-image-key="${escapeHtml(model.imageKey)}">◇</span>` : '<span class="model-art">⌑</span>'}<span class="glb-tag">${model.glbKey ? "3D · GLB" : "SEM MODELO 3D"}</span></div><div class="model-card-body"><span class="model-code">${escapeHtml(model.code)}</span><h3 title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</h3><p>${escapeHtml(model.description || model.project || "Sem descrição")}</p><div class="model-card-tags"><span>${escapeHtml(model.family || "Sem família")}</span><span>${escapeHtml(model.revision || "Sem revisão")}</span></div><div class="model-card-actions"><button class="small-action" data-action="view-model" data-id="${escapeHtml(model.id)}">◉ Visualizar</button><button class="small-action" data-action="edit-model" data-id="${escapeHtml(model.id)}">✎ Editar</button><button class="small-action" data-action="duplicate-model" data-id="${escapeHtml(model.id)}">⧉ Duplicar</button><button class="small-action danger" data-action="delete-model" data-id="${escapeHtml(model.id)}">Excluir</button></div></div></article>`).join("");
    byId("models-empty").classList.toggle("hidden", state.data.models.length > 0);
    if (state.data.models.length && !filtered.length) byId("model-grid").innerHTML = '<div class="empty-list">Nenhum produto encontrado com esses filtros.</div>';
    hydrateImages(byId("model-grid"));
    hydrateModelViewers(byId("model-grid"));
  }

  function findModel(id, snapshot = {}) {
    return state.data.models.find((item) => item.id === id) || snapshot || {};
  }

  function clearModelFormPreview() {
    state.formPreviewToken += 1;
    if (state.formPreviewUrl) URL.revokeObjectURL(state.formPreviewUrl);
    state.formPreviewUrl = "";
    byId("model-upload-preview").removeAttribute("src");
    byId("model-upload-preview-wrap").classList.add("hidden");
  }

  function setModelFormPreview(url, isTemporary = false) {
    clearModelFormPreview();
    if (!url) return;
    state.formPreviewUrl = isTemporary ? url : "";
    byId("model-upload-preview").src = url;
    byId("model-upload-preview-wrap").classList.remove("hidden");
  }

  function openModelForm(model = null, duplicate = false) {
    byId("model-form").reset();
    clearModelFormPreview();
    state.duplicateSource = duplicate ? model : null;
    byId("model-id").value = duplicate ? "" : (model ? model.id : "");
    byId("model-dialog-title").textContent = duplicate ? "Duplicar modelo" : model ? "Editar modelo" : "Cadastrar modelo";
    const fields = ["code", "name", "description", "drawing", "revision", "project", "family", "plant", "process", "owner"];
    fields.forEach((field) => {
      const value = model?.[field] || (field === "plant" ? state.data.settings.plant : "");
      byId(`model-${field}`).value = duplicate && field === "code" ? `${value}-CÓPIA` : value;
    });
    const plan = model?.inspectionSteps?.length ? model.inspectionSteps : defaultChecklist;
    byId("model-plan").value = plan.map((step) => `${step.title}${step.description ? ` | ${step.description}` : ""}`).join("\n");
    byId("model-file-name").textContent = model?.glbName ? `Arquivo atual: ${model.glbName}` : "";
    modelDialog.showModal();
    if (model?.glbKey) {
      const token = state.formPreviewToken;
      getFileUrl(model.glbKey).then((url) => {
        if (url && token === state.formPreviewToken && modelDialog.open) setModelFormPreview(url);
      });
    }
  }

  async function storeSelectedFile(input, prefix, existingKey, fallbackName, sourceKey = "") {
    const file = input?.files?.[0];
    if (!file && !sourceKey) return { key: existingKey || "", name: fallbackName || "" };
    const key = `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const data = file || await fileOperation("readonly", sourceKey);
    if (!data) throw new Error("O arquivo original do modelo duplicado não está disponível.");
    await fileOperation("readwrite", key, data);
    return { key, name: file ? file.name : fallbackName };
  }

  async function saveModel(event) {
    event.preventDefault();
    const id = byId("model-id").value;
    const existing = state.data.models.find((item) => item.id === id);
    const data = Object.fromEntries(["code", "name", "description", "drawing", "revision", "project", "family", "plant", "process", "owner"].map((field) => [field, byId(`model-${field}`).value.trim()]));
    if (state.data.models.some((item) => item.code.toLocaleLowerCase("pt-BR") === data.code.toLocaleLowerCase("pt-BR") && item.id !== id)) {
      byId("model-code").setCustomValidity("Já existe um modelo cadastrado com este código.");
      byId("model-code").reportValidity();
      byId("model-code").setCustomValidity("");
      return;
    }
    const inspectionSteps = byId("model-plan").value.split(/\r?\n/).map((line) => {
      const [title, ...description] = line.split("|");
      return { title: title.trim(), description: description.join("|").trim() };
    }).filter((step) => step.title);
    const savedModel = { ...existing, ...data, inspectionSteps, id: existing?.id || newId(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      const source = state.duplicateSource;
      const glb = await storeSelectedFile(byId("model-file"), "model", existing?.glbKey, existing?.glbName, source?.glbKey);
      const image = await storeSelectedFile(null, "image", existing?.imageKey, existing?.imageName, source?.imageKey);
      Object.assign(savedModel, { glbKey: glb.key, glbName: glb.name, imageKey: image.key, imageName: image.name });
    } catch (error) {
      console.error("Falha ao salvar arquivo do modelo.", error);
      toast("Não foi possível armazenar o arquivo. Verifique o espaço disponível.", true);
      return;
    }
    const old = state.data.models;
    state.data.models = existing ? old.map((item) => item.id === id ? savedModel : item) : [savedModel, ...old];
    if (!persist()) {
      state.data.models = old;
      return;
    }
    modelDialog.close();
    refresh();
    toast(existing ? "Modelo atualizado." : "Modelo cadastrado com sucesso.");
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function viewModel(id) {
    const model = state.data.models.find((item) => item.id === id);
    if (!model) return;
    byId("viewer-title").textContent = `${model.code} · ${model.name}`;
    const viewer = byId("model-viewer");
    const glbUrl = await getFileUrl(model.glbKey);
    if (glbUrl) viewer.src = glbUrl;
    else viewer.removeAttribute("src");
    viewer.alt = `Modelo de referência ${model.name}`;
    const imageUrl = await getFileUrl(model.imageKey);
    if (imageUrl) byId("viewer-reference-image").src = imageUrl;
    else byId("viewer-reference-image").removeAttribute("src");
    byId("viewer-reference-image").classList.toggle("hidden", !imageUrl);
    byId("viewer-dialog").querySelector(".viewer-stage").classList.toggle("image-only", !glbUrl && Boolean(imageUrl));
    byId("viewer-ar-button").disabled = !glbUrl;
    viewerDialog.showModal();
  }

  function deleteModel(id) {
    const model = state.data.models.find((item) => item.id === id);
    if (!model || !window.confirm(`Excluir o modelo ${model.code} — ${model.name}? As inspeções existentes serão mantidas.`)) return;
    const old = state.data.models;
    state.data.models = old.filter((item) => item.id !== id);
    if (!persist()) {
      state.data.models = old;
      return;
    }
    if (model.glbKey) fileOperation("readwrite", model.glbKey).catch((error) => console.error("Falha ao remover GLB.", error));
    const imageRetainedByHistory = state.data.inspections.some((inspection) => inspection.modelId === model.id && inspection.modelSnapshot?.imageKey === model.imageKey);
    if (model.imageKey && !imageRetainedByHistory) fileOperation("readwrite", model.imageKey).catch((error) => console.error("Falha ao remover imagem.", error));
    refresh();
    toast("Modelo excluído. O histórico de inspeções foi preservado.");
  }

  function renderProductPicker() {
    const query = byId("inspection-search").value.trim().toLocaleLowerCase("pt-BR");
    const products = state.data.models.filter((item) => [item.code, item.name, item.project].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)));
    byId("inspection-product-list").innerHTML = products.length ? products.map((model) => `<button class="picker-product${state.selectedProductId === model.id ? " selected" : ""}" data-select-product="${escapeHtml(model.id)}">${productThumb(model)}<span class="picker-product-info"><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.code)}${model.revision ? ` · ${escapeHtml(model.revision)}` : ""}${model.glbKey ? " · Modelo 3D" : ""}</small></span><span class="picker-radio">${state.selectedProductId === model.id ? "✓" : ""}</span></button>`).join("") : '<div class="picker-empty">Nenhum produto encontrado. Cadastre um modelo para iniciar.</div>';
    hydrateImages(byId("inspection-product-list"));
    const selected = state.data.models.find((item) => item.id === state.selectedProductId);
    byId("session-summary").innerHTML = selected ? `<div class="session-product">${productThumb(selected)}<span><strong>${escapeHtml(selected.name)}</strong><small>${escapeHtml(selected.code)}${selected.revision ? ` · ${escapeHtml(selected.revision)}` : ""}</small></span></div>` : '<div class="session-placeholder">Selecione um produto para começar.</div>';
    byId("session-inspector").value = state.operatorDraft;
    hydrateImages(byId("session-summary"));
    byId("inspection-work-step").classList.toggle("hidden", !selected);
    byId("finish-inspection").disabled = !selected;
    if (selected) renderInspectionWorkspace(selected);
  }

  const defaultChecklist = [
    { title: "Suporte dianteiro", description: "Verifique presença, orientação e posição em relação ao desenho." },
    { title: "Parafusos e fixadores", description: "Confirme quantidade, tipo e aperto dos elementos de fixação." },
    { title: "Mangueiras e tubulações", description: "Verifique roteamento, conexões e ausência de interferências." },
    { title: "Conectores e componentes", description: "Confirme presença e identificação correta dos componentes." }
  ];

  function renderInspectionWorkspace(model) {
    const viewerUrl = model.glbKey ? getFileUrl(model.glbKey) : Promise.resolve("");
    const shell = byId("inspection-work-content");
    shell.innerHTML = `<div class="align-controls"><div class="align-group"><button class="align-button active" data-align-mode="camera">Câmera + modelo</button><button class="align-button" data-align-mode="model">Modelo 3D</button></div><button class="align-button ar-launch-button" data-start-ar disabled>◎ Entrar em AR</button><button class="align-button" data-camera-toggle>◉ Abrir câmera</button><button class="align-button" data-lock>⌖ Travar posição</button></div><p class="ar-runtime-hint">AR espacial exige um arquivo GLB e navegador/dispositivo compatível. Sem suporte, use câmera + sobreposição manual.</p><div class="align-stage camera-off" id="align-stage"><video id="inspection-video" autoplay playsinline muted></video><div class="camera-message"><strong>Alinhamento manual</strong>Abra a câmera para sobrepor o modelo à peça. Para posicionamento espacial, toque em “Entrar em AR”.</div><model-viewer id="inspection-viewer" camera-controls touch-action="pan-y" interaction-prompt="none" shadow-intensity="1" ar ar-modes="webxr scene-viewer quick-look" ar-scale="auto" alt="Referência 3D para inspeção"><span class="viewer-placeholder" slot="poster">${model.glbKey ? "Carregando modelo 3D…" : "Este produto ainda não possui arquivo GLB."}</span></model-viewer><div class="alignment-cross"></div><span class="axis-label">X <span style="color:#67cf8f">Y</span> <span style="color:#76aef2">Z</span></span></div><div class="align-tools"><label class="range-control">Transparência<input type="range" min="15" max="90" value="65" data-overlay-opacity><output>65%</output></label><label class="range-control">Escala<input type="range" min="50" max="160" value="100" data-overlay-scale><output>100%</output></label><label class="range-control">Rotação<input type="range" min="-180" max="180" value="0" data-overlay-rotation><output>0°</output></label></div><div class="align-helper"><button class="align-button" data-camera-view="front">Frontal</button><button class="align-button" data-camera-view="side">Lateral</button><button class="align-button" data-camera-view="top">Superior</button><button class="align-button" data-camera-view="reset">Resetar vista</button><button class="align-button" data-capture>▣ Capturar foto</button><button class="align-button" data-record-video>◉ Gravar vídeo</button></div><div class="checklist-title"><strong>Checklist de montagem</strong><span>Observação obrigatória para itens avaliados</span></div><div id="checklist-items"></div><div class="evidence-row"><label class="evidence-button">＋ Anexar evidência<input type="file" accept="image/*,video/*" multiple data-general-evidence hidden></label><button class="evidence-button" data-screen-capture>▣ Capturar referência</button><span class="evidence-count" id="general-evidence-count"></span></div><div id="general-evidence-list" class="general-evidence-list"></div>`;
    model.inspectionSteps = Array.isArray(model.inspectionSteps) && model.inspectionSteps.length ? model.inspectionSteps : defaultChecklist;
    state.checklist = model.inspectionSteps.map((step) => ({ title: step.title, description: step.description, status: "", notes: "", evidence: [] }));
    byId("checklist-items").innerHTML = state.checklist.map((check, index) => checklistMarkup(check, index)).join("");
    viewerUrl.then((url) => {
      const viewer = byId("inspection-viewer");
      const arButton = document.querySelector("[data-start-ar]");
      if (viewer && url) viewer.src = url;
      if (arButton) arButton.disabled = !url;
    });
    byId("session-time").textContent = formatDate(new Date(), true);
  }

  function checklistMarkup(check, index) {
    return `<article class="check-item" data-check-index="${index}"><div class="check-item-head"><span class="check-index">${String(index + 1).padStart(2, "0")}</span><div class="check-main"><strong>${escapeHtml(check.title)}</strong><small>${escapeHtml(check.description)}</small></div></div><div class="status-options"><button class="status-choice status-conforme${check.status === "conforme" ? " selected" : ""}" data-status="conforme">✓ Conforme</button><button class="status-choice status-nao-conforme${check.status === "nao-conforme" ? " selected" : ""}" data-status="nao-conforme">× Não conforme</button><button class="status-choice status-na${check.status === "na" ? " selected" : ""}" data-status="na">— N/A</button></div><textarea class="check-notes" rows="1" placeholder="Observações (obrigatório para Conforme / Não conforme)">${escapeHtml(check.notes)}</textarea><div class="evidence-row"><label class="evidence-button">＋ Foto ou vídeo<input class="item-evidence-input" type="file" accept="image/*,video/*" multiple></label><span class="evidence-count">${check.evidence.length ? `${check.evidence.length} anexo(s)` : "Sem evidências"}</span></div></article>`;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Câmera indisponível. Acesse por HTTPS ou localhost e verifique as permissões do navegador.", true);
      return;
    }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      byId("inspection-video").srcObject = state.cameraStream;
      byId("align-stage").classList.remove("camera-off");
      byId("align-stage").classList.add("camera-on");
      byId("align-stage").classList.remove("model-only");
      document.querySelector("[data-camera-toggle]").textContent = "◉ Fechar câmera";
    } catch (error) {
      console.error("Falha ao abrir a câmera.", error);
      toast("Não foi possível abrir a câmera. Verifique a permissão do navegador.", true);
    }
  }

  function stopCamera() {
    if (state.cameraRecorder?.state === "recording") state.cameraRecorder.stop();
    if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    const video = byId("inspection-video");
    if (video) video.srcObject = null;
    const stage = byId("align-stage");
    if (stage) stage.classList.remove("camera-on");
    if (document.querySelector("[data-camera-toggle]")) document.querySelector("[data-camera-toggle]").textContent = "◎ Abrir câmera";
  }

  async function activateAR(viewer) {
    if (!viewer || !viewer.hasAttribute("src")) {
      toast("Adicione um modelo 3D GLB ao produto para iniciar a realidade aumentada.", true);
      return;
    }
    if (!window.isSecureContext) {
      toast("A realidade aumentada exige HTTPS ou acesso por localhost.", true);
      return;
    }
    if (!viewer.canActivateAR || typeof viewer.activateAR !== "function") {
      toast("AR espacial indisponível neste dispositivo. Use Chrome Android com Scene Viewer ou um dispositivo iOS compatível; a sobreposição manual continua disponível.", true);
      return;
    }
    try {
      await viewer.activateAR();
    } catch (error) {
      console.error("Não foi possível iniciar a sessão de realidade aumentada.", error);
      toast("Falha ao iniciar AR. Verifique a permissão de câmera e a compatibilidade do dispositivo.", true);
    }
  }

  async function startInspectionAR() {
    await activateAR(byId("inspection-viewer"));
  }

  async function saveEvidenceFiles(files, bucket, index = -1) {
    const added = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      const key = `evidence-${newId()}`;
      await fileOperation("readwrite", key, file);
      added.push({ key, name: file.name, type: file.type, addedAt: new Date().toISOString() });
    }
    if (bucket === "check") state.checklist[index].evidence.push(...added);
    else state.generalEvidence = [...(state.generalEvidence || []), ...added];
    updateEvidenceDisplay();
  }

  function updateEvidenceDisplay() {
    const general = state.generalEvidence || [];
    const count = byId("general-evidence-count");
    const list = byId("general-evidence-list");
    if (count) count.textContent = general.length ? `${general.length} anexo(s)` : "Sem evidências anexadas";
    if (list) list.innerHTML = general.map((item) => `<span class="evidence-file">▧ ${escapeHtml(item.name)}</span>`).join("");
    document.querySelectorAll("[data-check-index]").forEach((element) => {
      const index = Number(element.dataset.checkIndex);
      const countNode = element.querySelector(".evidence-count");
      if (countNode) countNode.textContent = state.checklist[index].evidence.length ? `${state.checklist[index].evidence.length} anexo(s)` : "Sem evidências";
    });
  }

  async function capturePhoto() {
    const video = byId("inspection-video");
    if (!video?.srcObject || !video.videoWidth) {
      toast("Abra a câmera antes de capturar uma foto.", true);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
    if (!blob) {
      toast("Não foi possível capturar a foto.", true);
      return;
    }
    try {
      await saveEvidenceFiles([new File([blob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" })], "general");
      toast("Foto adicionada às evidências.");
    } catch (error) {
      console.error("Falha ao salvar foto capturada.", error);
      toast("Não foi possível armazenar a foto.", true);
    }
  }

  async function toggleVideoRecording() {
    if (!state.cameraStream) {
      toast("Abra a câmera antes de iniciar uma gravação.", true);
      return;
    }
    if (state.cameraRecorder?.state === "recording") {
      state.cameraRecorder.stop();
      return;
    }
    if (!window.MediaRecorder) {
      toast("Gravação de vídeo não é compatível com este navegador.", true);
      return;
    }
    try {
      const recorder = new MediaRecorder(state.cameraStream);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error("Falha na gravação de vídeo.", event.error);
        toast("A gravação de vídeo falhou.", true);
      };
      state.recordingDone = new Promise((resolve) => {
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
          try {
            if (blob.size) {
              await saveEvidenceFiles([new File([blob], `gravacao-${Date.now()}.webm`, { type: blob.type })], "general");
              toast("Vídeo adicionado às evidências.");
            }
          } catch (error) {
            console.error("Falha ao armazenar vídeo.", error);
            toast("Não foi possível armazenar o vídeo.", true);
          } finally {
            state.cameraRecorder = null;
            const button = document.querySelector("[data-record-video]");
            if (button) button.textContent = "◉ Gravar vídeo";
            resolve();
          }
        };
      });
      state.cameraRecorder = recorder;
      recorder.start();
      document.querySelector("[data-record-video]").textContent = "■ Parar gravação";
    } catch (error) {
      console.error("Não foi possível iniciar a gravação.", error);
      toast("Não foi possível iniciar a gravação de vídeo.", true);
    }
  }

  async function captureReference() {
    const viewer = byId("inspection-viewer");
    if (!viewer?.src) {
      toast("Adicione um modelo GLB para capturar uma referência.", true);
      return;
    }
    try {
      const blob = await viewer.toBlob({ mimeType: "image/png", quality: 1 });
      await saveEvidenceFiles([new File([blob], `referencia-${Date.now()}.png`, { type: "image/png" })], "general");
      toast("Captura de referência adicionada às evidências.");
    } catch (error) {
      console.error("Falha ao capturar referência 3D.", error);
      toast("Não foi possível capturar o modelo. Use uma foto da câmera ou anexe uma imagem.", true);
    }
  }

  function validateChecklist() {
    const missingStatus = state.checklist.findIndex((check) => !check.status);
    if (missingStatus >= 0) {
      toast(`Selecione um resultado para o item ${missingStatus + 1}.`, true);
      byId("checklist-items").querySelector(`[data-check-index="${missingStatus}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    const missingNotes = state.checklist.findIndex((check) => check.status !== "na" && !check.notes.trim());
    if (missingNotes >= 0) {
      toast(`Preencha a observação do item ${missingNotes + 1}.`, true);
      const note = byId("checklist-items").querySelector(`[data-check-index="${missingNotes}"] .check-notes`);
      note?.focus();
      note?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  async function finishInspection() {
    if (state.cameraRecorder) {
      if (state.cameraRecorder.state === "recording") state.cameraRecorder.stop();
      await state.recordingDone;
    }
    if (!state.selectedProductId || !validateChecklist()) return;
    const model = state.data.models.find((item) => item.id === state.selectedProductId);
    if (!model) {
      toast("O produto selecionado não está mais disponível.", true);
      return;
    }
    const result = state.checklist.some((item) => item.status === "nao-conforme") ? "nao-conforme" : "conforme";
    const inspection = {
      id: newId(), modelId: model.id, modelSnapshot: { id: model.id, code: model.code, name: model.name, revision: model.revision, imageKey: model.imageKey },
      inspector: byId("session-inspector").value.trim(), plant: state.data.settings.plant, createdAt: new Date().toISOString(),
      result, checklist: state.checklist.map((item) => ({ ...item, evidence: [...item.evidence] })),
      evidence: [...(state.generalEvidence || [])], alignment: { locked: byId("align-stage").classList.contains("locked") }
    };
    state.data.inspections.unshift(inspection);
    if (!persist()) {
      state.data.inspections.shift();
      return;
    }
    stopCamera();
    state.selectedProductId = null;
    state.checklist = [];
    state.generalEvidence = [];
    state.operatorDraft = "";
    byId("inspection-search").value = "";
    renderProductPicker();
    renderDashboard();
    renderHistory();
    toast(result === "conforme" ? "Inspeção concluída: conforme." : "Inspeção concluída com não conformidade.");
    navigate("history");
    openInspectionDetail(inspection.id);
  }

  function renderHistory() {
    const query = byId("history-search").value.trim().toLocaleLowerCase("pt-BR");
    const status = byId("history-status-filter").value;
    const inspections = state.data.inspections.filter((inspection) => {
      const model = findModel(inspection.modelId, inspection.modelSnapshot);
      return [model.code, model.name, inspection.inspector].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)) && (!status || inspection.result === status);
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    byId("history-result-count").textContent = `${inspections.length} ${inspections.length === 1 ? "inspeção" : "inspeções"}`;
    byId("history-table").innerHTML = inspections.map((inspection) => {
      const model = findModel(inspection.modelId, inspection.modelSnapshot);
      const passed = inspection.result === "conforme";
      const nc = inspection.checklist.filter((item) => item.status === "nao-conforme").length;
      return `<tr><td><div class="product-cell">${productThumb(model)}<span><strong>${escapeHtml(model.name || "Produto removido")}</strong><small>${escapeHtml(model.code || "—")}${model.revision ? ` · ${escapeHtml(model.revision)}` : ""}</small></span></div></td><td>${escapeHtml(inspection.inspector || "—")}</td><td>${formatDate(inspection.createdAt, true)}</td><td>${inspection.checklist.length} itens${nc ? ` · ${nc} NC` : ""}</td><td><span class="result-badge ${passed ? "conforme" : "nao-conforme"}">${passed ? "Conforme" : "Não conforme"}</span></td><td><button class="row-action" data-action="view-inspection" data-id="${escapeHtml(inspection.id)}">Detalhes →</button></td></tr>`;
    }).join("");
    byId("history-empty").classList.toggle("hidden", state.data.inspections.length > 0);
    if (!inspections.length && state.data.inspections.length) byId("history-table").innerHTML = '<tr><td colspan="6" class="empty-list">Nenhuma inspeção corresponde a essa busca.</td></tr>';
    hydrateImages(byId("history-table"));
  }

  function openInspectionDetail(id) {
    const inspection = state.data.inspections.find((item) => item.id === id);
    if (!inspection) return;
    state.currentDetailId = id;
    const model = findModel(inspection.modelId, inspection.modelSnapshot);
    const evidence = [...inspection.evidence, ...inspection.checklist.flatMap((item) => item.evidence)];
    byId("inspection-detail-content").innerHTML = `<div class="detail-summary">${productThumb(model)}<span><strong>${escapeHtml(model.name || "Produto removido")}</strong><small>${escapeHtml(model.code || "—")}${model.revision ? ` · ${escapeHtml(model.revision)}` : ""}</small></span></div><div class="detail-result"><span class="result-badge ${inspection.result === "conforme" ? "conforme" : "nao-conforme"}">${inspection.result === "conforme" ? "Conforme" : "Não conforme"}</span></div><div class="session-meta"><span>Responsável</span><strong>${escapeHtml(inspection.inspector || "—")}</strong></div><div class="session-meta"><span>Planta · Data</span><strong>${escapeHtml(inspection.plant || "—")} · ${formatDate(inspection.createdAt, true)}</strong></div><div class="detail-section-title">Checklist</div>${inspection.checklist.map((item) => `<div class="detail-check"><span>${escapeHtml(item.title)}<br><small>${escapeHtml(item.notes || "Sem observações")}</small></span><span class="result-badge ${item.status === "conforme" ? "conforme" : item.status === "nao-conforme" ? "nao-conforme" : "conforme"}">${item.status === "nao-conforme" ? "Não conforme" : item.status === "na" ? "N/A" : "Conforme"}</span></div>`).join("")}<div class="detail-section-title">Evidências · ${evidence.length}</div><div class="detail-evidence-list" id="detail-evidence-list">${evidence.map((item) => item.type?.startsWith("video/") ? `<span class="video-evidence" data-video-key="${escapeHtml(item.key)}">▶ vídeo</span>` : `<img data-evidence-key="${escapeHtml(item.key)}" alt="${escapeHtml(item.name)}">`).join("") || '<small class="evidence-count">Nenhuma evidência anexada.</small>'}</div>`;
    hydrateImages(byId("inspection-detail-content"));
    byId("inspection-detail-content").querySelectorAll("[data-evidence-key]").forEach(async (image) => {
      const url = await getFileUrl(image.dataset.evidenceKey);
      if (url) image.src = url;
    });
    byId("inspection-detail-content").querySelectorAll("[data-video-key]").forEach(async (item) => {
      const url = await getFileUrl(item.dataset.videoKey);
      if (url) {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.className = "video-evidence";
        item.replaceWith(video);
      }
    });
    detailDialog.showModal();
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function downloadInspectionCsv(inspection) {
    if (!inspection) return;
    const model = findModel(inspection.modelId, inspection.modelSnapshot);
    const lines = [["Inspeção", inspection.id], ["Produto", model.name], ["Código", model.code], ["Revisão", model.revision], ["Responsável", inspection.inspector], ["Planta", inspection.plant], ["Data", inspection.createdAt], ["Resultado", inspection.result], [], ["Item", "Status", "Observações", "Evidências"]];
    inspection.checklist.forEach((item) => lines.push([item.title, item.status, item.notes, item.evidence.map((file) => file.name).join("; ")]));
    lines.push([], ["Evidências gerais", inspection.evidence.map((file) => file.name).join("; ")]);
    downloadText(`inspect-ar-${inspection.id}.csv`, "\uFEFF" + lines.map((row) => row.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  async function printInspectionReport(inspection) {
    if (!inspection) return;
    const model = findModel(inspection.modelId, inspection.modelSnapshot);
    const evidence = [...inspection.evidence, ...inspection.checklist.flatMap((item) => item.evidence)];
    const evidenceHtml = await Promise.all(evidence.map(async (file) => {
      if (file.type?.startsWith("image/")) {
        const url = await getFileUrl(file.key);
        return url ? `<figure><img src="${url}" alt="${escapeHtml(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure>` : `<p>${escapeHtml(file.name)} · imagem indisponível</p>`;
      }
      return `<p class="print-video">Vídeo anexado: ${escapeHtml(file.name)}</p>`;
    }));
    const report = document.createElement("section");
    report.className = "print-report";
    report.innerHTML = `<header><div class="print-brand">INSPECT-AR <span>QUALITY INTELLIGENCE</span></div><div class="print-report-id">Relatório · ${escapeHtml(inspection.id)}</div></header><h1>Relatório de inspeção</h1><p class="print-subtitle">Emitido em ${formatDate(new Date(), true)}</p><section class="print-meta"><div><small>Produto</small><strong>${escapeHtml(model.name || "Produto removido")}</strong></div><div><small>Código da peça</small><strong>${escapeHtml(model.code || "—")}</strong></div><div><small>Desenho / revisão</small><strong>${escapeHtml(model.drawing || "—")} / ${escapeHtml(model.revision || "—")}</strong></div><div><small>Responsável</small><strong>${escapeHtml(inspection.inspector || "—")}</strong></div><div><small>Planta</small><strong>${escapeHtml(inspection.plant || "—")}</strong></div><div><small>Data da inspeção</small><strong>${formatDate(inspection.createdAt, true)}</strong></div><div><small>Resultado</small><strong class="${inspection.result === "conforme" ? "print-pass" : "print-fail"}">${inspection.result === "conforme" ? "CONFORME" : "NÃO CONFORME"}</strong></div></section><h2>Checklist e observações</h2><table><thead><tr><th>Etapa</th><th>Status</th><th>Observação</th><th>Evidências</th></tr></thead><tbody>${inspection.checklist.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${item.status === "nao-conforme" ? "Não conforme" : item.status === "na" ? "Não aplicável" : "Conforme"}</td><td>${escapeHtml(item.notes || "—")}</td><td>${item.evidence.length ? item.evidence.map((file) => escapeHtml(file.name)).join("<br>") : "—"}</td></tr>`).join("")}</tbody></table><h2>Evidências</h2><div class="print-evidence">${evidenceHtml.join("") || "<p>Nenhuma evidência anexada.</p>"}</div><footer>Inspect-AR · Registro local · ${escapeHtml(inspection.id)}</footer>`;
    document.body.appendChild(report);
    try {
      const images = [...report.querySelectorAll("img")];
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      window.addEventListener("afterprint", () => report.remove(), { once: true });
      window.print();
    } finally {
      window.setTimeout(() => report.remove(), 60000);
    }
  }

  function downloadText(filename, content, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportHistory() {
    const rows = [["ID", "Código da peça", "Produto", "Revisão", "Responsável", "Planta", "Data e hora", "Resultado", "Itens", "Não conformidades", "Evidências"]];
    state.data.inspections.forEach((inspection) => {
      const model = findModel(inspection.modelId, inspection.modelSnapshot);
      rows.push([inspection.id, model.code, model.name, model.revision, inspection.inspector, inspection.plant, inspection.createdAt, inspection.result, inspection.checklist.length, inspection.checklist.filter((item) => item.status === "nao-conforme").length, [...inspection.evidence, ...inspection.checklist.flatMap((item) => item.evidence)].map((item) => item.name).join("; ")]);
    });
    downloadText("inspect-ar-historico.csv", "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  function refresh() {
    renderDashboard();
    renderModels();
    renderProductPicker();
    renderHistory();
    byId("model-nav-count").textContent = state.data.models.length;
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (pageButton) {
        event.preventDefault();
        navigate(pageButton.dataset.page);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) {
        const { action: actionName, id } = action.dataset;
        if (actionName === "new-model") openModelForm();
        if (actionName === "edit-model") openModelForm(state.data.models.find((item) => item.id === id));
        if (actionName === "duplicate-model") openModelForm(state.data.models.find((item) => item.id === id), true);
        if (actionName === "delete-model") deleteModel(id);
        if (actionName === "view-model") viewModel(id);
        if (actionName === "view-inspection") openInspectionDetail(id);
        return;
      }
      const close = event.target.closest("[data-close-dialog]");
      if (close) close.closest("dialog").close();
      const product = event.target.closest("[data-select-product]");
      if (product) {
        state.selectedProductId = product.dataset.selectProduct;
        state.generalEvidence = [];
        state.checklist = [];
        renderProductPicker();
      }
      const status = event.target.closest("[data-status]");
      if (status) {
        const item = status.closest("[data-check-index]");
        const index = Number(item.dataset.checkIndex);
        state.checklist[index].status = status.dataset.status;
        item.querySelectorAll("[data-status]").forEach((button) => button.classList.toggle("selected", button === status));
      }
      const mode = event.target.closest("[data-align-mode]");
      if (mode) {
        document.querySelectorAll("[data-align-mode]").forEach((button) => button.classList.toggle("active", button === mode));
        byId("align-stage").classList.toggle("model-only", mode.dataset.alignMode === "model");
        const message = document.querySelector(".camera-message");
        if (message) message.innerHTML = mode.dataset.alignMode === "model" ? "<strong>Visualização do modelo</strong>Rotacione, aproxime ou mova a referência 3D para conferir os detalhes." : "<strong>Visualização de alinhamento</strong>Abra a câmera para posicionar o modelo sobre a peça real. Ajuste o modelo com toque ou arraste.";
      }
      if (event.target.closest("[data-start-ar]")) await startInspectionAR();
      if (event.target.closest("[data-camera-toggle]")) {
        if (state.cameraStream) stopCamera();
        else await startCamera();
      }
      if (event.target.closest("[data-lock]")) {
        const stage = byId("align-stage");
        const locked = stage.classList.toggle("locked");
        event.target.closest("[data-lock]").textContent = locked ? "✓ Posição travada" : "⌖ Travar posição";
        byId("inspection-viewer").style.pointerEvents = locked ? "none" : "auto";
      }
      const cameraView = event.target.closest("[data-camera-view], [data-camera]");
      if (cameraView) setCameraView(byId("inspection-viewer"), cameraView.dataset.cameraView || cameraView.dataset.camera);
      if (event.target.closest("[data-capture]")) await capturePhoto();
      if (event.target.closest("[data-screen-capture]")) await captureReference();
      if (event.target.closest("[data-record-video]")) await toggleVideoRecording();
    });

    document.addEventListener("input", (event) => {
      if (event.target.id === "model-search" || event.target.id === "model-family-filter") renderModels();
      if (event.target.id === "inspection-search") renderProductPicker();
      if (event.target.id === "history-search" || event.target.id === "history-status-filter") renderHistory();
      if (event.target.id === "session-inspector") state.operatorDraft = event.target.value;
      const check = event.target.closest("[data-check-index]");
      if (check && event.target.classList.contains("check-notes")) state.checklist[Number(check.dataset.checkIndex)].notes = event.target.value;
      const range = event.target.closest("[data-overlay-opacity], [data-overlay-scale], [data-overlay-rotation]");
      if (range) {
        const viewer = byId("inspection-viewer");
        const output = range.parentElement.querySelector("output");
        if (range.hasAttribute("data-overlay-opacity")) {
          viewer.style.opacity = Number(range.value) / 100;
          output.value = `${range.value}%`;
          output.textContent = `${range.value}%`;
        } else if (range.hasAttribute("data-overlay-scale")) {
          const factor = Number(range.value) / 100;
          viewer.scale = `${factor} ${factor} ${factor}`;
          output.value = `${range.value}%`;
          output.textContent = `${range.value}%`;
        } else {
          viewer.orientation = `0deg ${range.value}deg 0deg`;
          output.value = `${range.value}°`;
          output.textContent = `${range.value}°`;
        }
      }
    });

    document.addEventListener("change", async (event) => {
      if (event.target.id === "model-file" && event.target.files[0]) {
        byId("model-file-name").textContent = event.target.files[0].name;
        setModelFormPreview(URL.createObjectURL(event.target.files[0]), true);
      }
      if (event.target.matches(".item-evidence-input")) {
        const item = event.target.closest("[data-check-index]");
        try {
          await saveEvidenceFiles([...event.target.files], "check", Number(item.dataset.checkIndex));
          toast("Evidência adicionada ao item.");
        } catch (error) {
          console.error("Falha ao armazenar evidência.", error);
          toast("Não foi possível armazenar a evidência.", true);
        }
      }
      if (event.target.matches("[data-general-evidence]")) {
        try {
          await saveEvidenceFiles([...event.target.files], "general");
          toast("Evidência adicionada à inspeção.");
        } catch (error) {
          console.error("Falha ao armazenar evidência.", error);
          toast("Não foi possível armazenar a evidência.", true);
        }
      }
    });

    byId("model-form").addEventListener("submit", saveModel);
    byId("finish-inspection").addEventListener("click", finishInspection);
    byId("mobile-menu").addEventListener("click", () => byId("sidebar").classList.toggle("open"));
    byId("export-history").addEventListener("click", exportHistory);
    byId("detail-export").addEventListener("click", () => downloadInspectionCsv(state.data.inspections.find((item) => item.id === state.currentDetailId)));
    byId("detail-print").addEventListener("click", () => printInspectionReport(state.data.inspections.find((item) => item.id === state.currentDetailId)));
    byId("save-settings").addEventListener("click", () => {
      const old = { ...state.data.settings };
      state.data.settings = { plant: byId("setting-plant").value.trim() || old.plant };
      if (!persist()) {
        state.data.settings = old;
        return;
      }
      refresh();
      toast("Preferências salvas.");
    });
    byId("setting-plant").value = state.data.settings.plant;
    byId("clear-data").addEventListener("click", async () => {
      if (!window.confirm("Isso apagará todos os modelos, inspeções e preferências salvos neste navegador. Esta ação não pode ser desfeita. Deseja continuar?")) return;
      localStorage.removeItem(STORAGE_KEY);
      state.data = structuredDefault();
      state.selectedProductId = null;
      state.operatorDraft = "";
      try {
        const database = await openDatabase();
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(DB_STORE, "readwrite");
          transaction.objectStore(DB_STORE).clear();
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Falha ao limpar arquivos."));
        });
        database.close();
      } catch (error) {
        console.error("Falha ao limpar arquivos locais.", error);
        toast("Os registros foram removidos, mas não foi possível limpar todos os arquivos.", true);
      }
      state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
      state.objectUrls.clear();
      refresh();
      toast("Dados locais removidos.");
    });
    document.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => setCameraView(byId("model-viewer"), button.dataset.camera)));
    byId("viewer-ar-button").addEventListener("click", () => activateAR(byId("model-viewer")));
    byId("model-dialog").addEventListener("close", () => {
      clearModelFormPreview();
      byId("model-file").value = "";
    });
    byId("inspection-detail-dialog").addEventListener("close", () => { state.currentDetailId = null; });
  }

  function setCameraView(viewer, view) {
    if (!viewer) return;
    const cameras = {
      iso: "45deg 65deg 2.8m",
      front: "0deg 75deg 2.8m",
      side: "90deg 75deg 2.8m",
      top: "0deg 0deg 2.8m",
      reset: "auto auto auto"
    };
    if (cameras[view]) viewer.cameraOrbit = cameras[view];
    if (view === "reset") viewer.cameraTarget = "auto auto auto";
  }

  function initialize() {
    byId("today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
    document.querySelectorAll("[data-page]").forEach((node) => {
      if (node.dataset.page === "dashboard" && node.classList.contains("brand")) {
        node.addEventListener("click", (event) => { event.preventDefault(); navigate("dashboard"); });
      }
    });
    bindEvents();
    refresh();
    window.addEventListener("beforeunload", stopCamera);
  }

  initialize();
})();
