"use strict";
const $ = id => document.getElementById(id);
let catalog = null;
let activePage = null;
let favorites = new Set();
const storageKey = `tmu-page-favorites:${location.pathname}`;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved)) favorites = new Set(saved.filter(x => typeof x === "string"));
} catch { /* The library still works when browser storage is unavailable. */ }
const routeFor = path => `#/page/${encodeURIComponent(path)}`;
function fileUrl(path) {
  return new URL(path.split("/").map(encodeURIComponent).join("/"), new URL("./", location.href));
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function drawer(open) {
  $("sidebar").classList.toggle("open", open);
  $("backdrop").hidden = !open;
  $("menu-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("search").focus();
}
function matchingPages() {
  const query = $("search").value.trim().toLocaleLowerCase();
  return catalog.pages.filter(p => `${p.title} ${p.category} ${p.path}`.toLocaleLowerCase().includes(query));
}
function renderCatalog() {
  const groups = new Map();
  for (const page of matchingPages()) {
    if (!groups.has(page.category)) groups.set(page.category, []);
    groups.get(page.category).push(page);
  }
  $("catalog").replaceChildren();
  for (const [category, pages] of groups) {
    const group = node("details"); group.open = true;
    group.append(node("summary", "", `${category} · ${pages.length}`));
    const list = node("ul", "page-list");
    for (const page of pages) {
      const li = node("li");
      const link = node("a", "page-link", page.title);
      link.href = routeFor(page.path);
      if (page.path === activePage?.path) link.setAttribute("aria-current", "page");
      li.append(link); list.append(li);
    }
    group.append(list); $("catalog").append(group);
  }
  if (!groups.size) $("catalog").append(node("p", "sidebar-message", catalog.pages.length ? "没有找到匹配的页面。" : "暂时没有页面，上传 HTML 后会显示在这里。"));
  $("page-count").textContent = catalog.pages.length;
  $("favorite-count").textContent = catalog.pages.filter(p => favorites.has(p.path)).length;
}
function showError(title, message) {
  $("viewer").hidden = true; $("overview").hidden = true; $("error").hidden = false;
  $("error-title").textContent = title; $("error-message").textContent = message;
}
function updateFavorite() {
  const marked = Boolean(activePage && favorites.has(activePage.path));
  $("favorite-button").setAttribute("aria-pressed", String(marked));
  $("favorite-button").textContent = marked ? "★ 已收藏" : "☆ 收藏";
}
function renderOverview(onlyFavorites) {
  $("overview-title").textContent = onlyFavorites ? "收藏页面" : "全部页面";
  $("overview-description").textContent = onlyFavorites ? "收藏常用页面，下次从这里继续。收藏保存在当前浏览器。" : "选择一个页面开始学习。新上传的 HTML 会在发布后加入目录。";
  const pages = matchingPages().filter(p => !onlyFavorites || favorites.has(p.path));
  $("page-grid").replaceChildren();
  for (const page of pages) {
    const card = node("article", "page-card");
    const link = node("a", "button", "打开页面 →"); link.href = routeFor(page.path);
    card.append(node("p", "eyebrow", page.category), node("h2", "", page.title), node("p", "filename", page.path), link);
    $("page-grid").append(card);
  }
  if (!pages.length) $("page-grid").append(node("p", "empty-state", $("search").value ? "没有找到匹配的页面，试试其他关键词。" : onlyFavorites ? "还没有收藏。打开页面后，点击右上角的「收藏」。" : "还没有内容。通过左侧「上传 HTML」添加你的第一个页面。"));
}
function renderRoute() {
  if (!catalog) return;
  let hash = location.hash;
  if (!hash || hash === "#") {
    const initial = catalog.pages.find(p => p.path === catalog.defaultPage);
    hash = initial ? routeFor(initial.path) : "#/overview";
    history.replaceState(null, "", hash);
  }
  let page = null;
  const view = hash === "#/favorites" ? "favorites" : hash === "#/overview" ? "overview" : "page";
  if (view === "page") {
    try {
      const requested = decodeURIComponent(hash.slice(7));
      page = catalog.pages.find(p => p.path === requested);
    } catch { /* Invalid shared URL. */ }
    if (!hash.startsWith("#/page/") || !page) {
      activePage = null; renderCatalog();
      showError("这个页面不在目录中", "页面可能已被移动或删除。请从左侧重新选择，或返回全部页面。");
      return;
    }
  }
  activePage = page;
  $("error").hidden = true; $("viewer").hidden = view !== "page"; $("overview").hidden = view === "page";
  document.querySelectorAll("[data-view]").forEach(link => {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("breadcrumb").textContent = page ? `${page.category} / ${page.title}` : view === "favorites" ? "收藏页面" : "全部页面";
  document.title = `${page ? page.title : view === "favorites" ? "收藏页面" : "全部页面"} · ${catalog.title}`;
  if (page) {
    $("page-title").textContent = page.title; $("page-category").textContent = page.category;
    const url = fileUrl(page.path);
    $("original-link").href = url.href;
    url.searchParams.set("embedded", "1");
    $("content-frame").title = page.title;
    if ($("content-frame").getAttribute("src") !== url.href) {
      $("status").textContent = "正在打开页面…";
      $("content-frame").src = url.href;
    }
    updateFavorite();
  } else { renderOverview(view === "favorites"); }
  renderCatalog(); drawer(false);
}
$("menu-toggle").addEventListener("click", () => drawer(!$("sidebar").classList.contains("open")));
document.querySelector(".skip").addEventListener("click", event => { event.preventDefault(); $("main").focus(); });
$("backdrop").addEventListener("click", () => { drawer(false); $("menu-toggle").focus(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && $("sidebar").classList.contains("open")) { drawer(false); $("menu-toggle").focus(); } });
$("catalog").addEventListener("click", event => { if (event.target.closest("a")) drawer(false); });
$("search").addEventListener("input", () => { if (!catalog) return; renderCatalog(); if (!$("overview").hidden) renderOverview(location.hash === "#/favorites"); });
$("favorite-button").addEventListener("click", () => {
  if (!activePage) return;
  if (favorites.has(activePage.path)) favorites.delete(activePage.path); else favorites.add(activePage.path);
  try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); } catch { $("status").textContent = "浏览器无法保存收藏，本次打开期间仍可使用。"; }
  updateFavorite(); renderCatalog();
});
$("share-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("status").textContent = "链接已复制，可在其他设备打开同一个页面。"; }
  catch { $("status").textContent = "未能自动复制，请复制浏览器地址栏中的网址。"; }
});
$("content-frame").addEventListener("load", () => { if ($("status").textContent === "正在打开页面…") $("status").textContent = ""; });
$("retry").addEventListener("click", () => location.reload());
window.addEventListener("hashchange", renderRoute);
async function start() {
  try {
    const response = await fetch("./assets/pages.json", {cache: "no-cache"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = await response.json();
    if (!Array.isArray(catalog.pages)) throw new Error("Invalid catalog");
    $("site-name").textContent = catalog.title;
    renderRoute();
  } catch {
    $("catalog").replaceChildren(node("p", "sidebar-message", "目录暂时不可用。"));
    showError("暂时无法加载目录", "请检查网络后重试。如果刚上传文件，请等待网站发布完成。");
  }
}
start();
