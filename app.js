/* ============================================================
   YENOM INVEST · Controle financeiro pessoal
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Constants ---------------- */
  const STORAGE_KEY = "yenom_finance_entries_v1";
  const THEME_KEY = "yenom_finance_theme_v1";
  const CUSTOM_CATS_KEY = "yenom_finance_customcats_v1";
  const CATEGORY_COLORS_KEY = "yenom_category_colors_v1";
  const PRIVACY_KEY = "yenom_privacy_visibility_v1";
  const CATEGORY_PALETTE = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#10B981", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899", "#64748B"];

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const DEFAULT_CATEGORIES = {
    ganho: ["Salário", "Freelance", "Vendas", "Comissão", "Outros"],
    gasto: ["Alimentação", "Moradia", "Transporte", "Lazer", "Compras", "Assinaturas", "Educação", "Saúde", "Outros"],
    investimento: ["Ações", "FIIs", "Criptomoedas", "Renda fixa", "ETFs", "Outros"]
  };

  const TYPE_LABEL = { ganho: "Ganho", gasto: "Gasto", investimento: "Investimento" };

  const COLORS = {
    ganho: getComputedCssVar("--ganho") || "#10a35f",
    gasto: getComputedCssVar("--gasto") || "#e04b6b",
    investimento: getComputedCssVar("--invest") || "#7038db",
    purple500: "#8455e8",
    purple300: "#c4b1f7"
  };

  function getComputedCssVar(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    catch (e) { return null; }
  }

  /* ---------------- State ---------------- */
  let entries = [];
  let today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed

  let currentView = "overview";
  let typeFilter = "todos";
  let searchTerm = "";
  let categoryFilter = "todas";

  let editingEntryId = null;
  let deleteTargetId = null;
  let currentModalType = "ganho";

  let charts = {}; // chart.js instances
  let privacyState = loadPrivacyState();

  /* ---------------- Utilities ---------------- */
  function uid() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatBRL(value) {
    const n = Number(value) || 0;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatBRLShort(value) {
    const n = Number(value) || 0;
    return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  function formatDateBR(isoDate) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function monthKeyOf(isoDate) {
    return isoDate.slice(0, 7); // YYYY-MM
  }

  function clampCategoryDefault(type) {
    return DEFAULT_CATEGORIES[type][0];
  }

  /* ---------------- Persistence ---------------- */
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      entries = raw ? JSON.parse(raw) : [];
    } catch (e) {
      entries = [];
    }
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function loadCustomCategories() {
    try {
      const raw = localStorage.getItem(CUSTOM_CATS_KEY);
      return raw ? JSON.parse(raw) : { ganho: [], gasto: [], investimento: [] };
    } catch (e) {
      return { ganho: [], gasto: [], investimento: [] };
    }
  }

  function saveCustomCategories(obj) {
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(obj));
  }

  function addCustomCategory(type, name) {
    const cats = loadCustomCategories();
    if (!cats[type].includes(name)) {
      cats[type].push(name);
      saveCustomCategories(cats);
    }
  }

  function categoriesForType(type) {
    const custom = loadCustomCategories()[type] || [];
    const base = DEFAULT_CATEGORIES[type].filter((c) => c !== "Outros");
    return [...base, ...custom, "Outros"];
  }

  function loadCategoryColors() {
    try {
      const raw = localStorage.getItem(CATEGORY_COLORS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ganho: parsed.ganho || {}, gasto: parsed.gasto || {}, investimento: parsed.investimento || {} };
    } catch (e) {
      return { ganho: {}, gasto: {}, investimento: {} };
    }
  }

  function saveCategoryColors(colors) {
    localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(colors));
  }

  function categoryColorKeyIndex(type, category) {
    const text = `${type}:${category}`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash) % CATEGORY_PALETTE.length;
  }

  function getCategoryColor(type, category) {
    const colors = loadCategoryColors();
    if (!colors[type]) colors[type] = {};
    if (!colors[type][category]) {
      colors[type][category] = CATEGORY_PALETTE[categoryColorKeyIndex(type, category)];
      saveCategoryColors(colors);
    }
    return colors[type][category];
  }

  function setCategoryColor(type, category, color) {
    if (!type || !category || !/^#[0-9a-f]{6}$/i.test(color || "")) return;
    const colors = loadCategoryColors();
    if (!colors[type]) colors[type] = {};
    colors[type][category] = color.toUpperCase();
    saveCategoryColors(colors);
  }

  function ensureAllCategoryColors() {
    ["ganho", "gasto", "investimento"].forEach((type) => {
      categoriesForType(type).forEach((category) => getCategoryColor(type, category));
    });
    entries.forEach((e) => getCategoryColor(e.type, e.category || "Outros"));
  }

  function renderColorPicker(category) {
    const wrap = document.getElementById("categoryColorPicker");
    const custom = document.getElementById("categoryColorCustom");
    if (!wrap || !custom) return;
    const safeCategory = category && category !== "__custom__" ? category : (document.getElementById("customCategoryInput").value.trim() || "Nova categoria");
    const selected = getCategoryColor(currentModalType, safeCategory);
    wrap.innerHTML = CATEGORY_PALETTE.map((color) => `<button type="button" class="color-swatch ${color.toUpperCase() === selected.toUpperCase() ? "is-selected" : ""}" data-color="${color}" style="--swatch:${color}" aria-label="Usar cor ${color}"></button>`).join("");
    custom.value = selected;
    wrap.querySelectorAll(".color-swatch").forEach((btn) => btn.addEventListener("click", () => {
      custom.value = btn.dataset.color;
      wrap.querySelectorAll(".color-swatch").forEach((b) => b.classList.toggle("is-selected", b === btn));
    }));
  }


  /* ---------------- Privacy / visibility ---------------- */
  function loadPrivacyState() {
    try {
      const raw = localStorage.getItem(PRIVACY_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        ganho: Boolean(parsed.ganho),
        gasto: Boolean(parsed.gasto),
        investimento: Boolean(parsed.investimento)
      };
    } catch (e) {
      return { ganho: false, gasto: false, investimento: false };
    }
  }

  function savePrivacyState() {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacyState));
  }

  function isValueHidden(type) {
    // O saldo permanece independente dos controles de privacidade de ganhos e gastos.
    if (type === "saldo") return false;
    return Boolean(privacyState[type]);
  }

  function privateBRL(type, value, short = false) {
    if (isValueHidden(type)) return short ? "R$ •••" : "R$ ••••••";
    return short ? formatBRLShort(value) : formatBRL(value);
  }

  function privatePercent(type, value) {
    if (isValueHidden(type)) return "••••";
    return `${Number(value).toFixed(1)}%`;
  }

  function togglePrivacy(type) {
    if (!Object.prototype.hasOwnProperty.call(privacyState, type)) return;
    privacyState[type] = !privacyState[type];
    savePrivacyState();
    renderAll();
  }

  function renderPrivacyControls() {
    document.querySelectorAll("[data-privacy-toggle]").forEach((btn) => {
      const type = btn.dataset.privacyToggle;
      const hidden = isValueHidden(type);
      btn.innerHTML = `<i data-lucide="${hidden ? "eye-off" : "eye"}"></i>`;
      btn.classList.toggle("is-hidden", hidden);
      btn.setAttribute("aria-pressed", hidden ? "true" : "false");
      btn.setAttribute("aria-label", `${hidden ? "Mostrar" : "Ocultar"} valores de ${TYPE_LABEL[type].toLowerCase()}s`);
      btn.title = `${hidden ? "Mostrar" : "Ocultar"} valores`;
    });
  }

  /* ---------------- Filtering / computing ---------------- */
  function entriesForMonth(year, month) {
    const key = `${year}-${pad2(month + 1)}`;
    return entries.filter((e) => monthKeyOf(e.date) === key);
  }

  function entriesForYear(year) {
    return entries.filter((e) => e.date.slice(0, 4) === String(year));
  }

  function sumByType(list, type) {
    return list.filter((e) => e.type === type).reduce((s, e) => s + Number(e.amount), 0);
  }

  function computeTotals(list) {
    const ganhos = sumByType(list, "ganho");
    const gastos = sumByType(list, "gasto");
    const investimentos = sumByType(list, "investimento");
    // Saldo = Ganhos - Gastos. Investimentos são contabilizados à parte e não entram no saldo.
    return { ganhos, gastos, investimentos, saldo: ganhos - gastos };
  }

  function prevMonthOf(year, month) {
    return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  }

  function pctChange(curr, prev) {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
  }

  /* ---------------- Counter animation ---------------- */
  function animateCounter(el, targetValue, type) {
    if (isValueHidden(type)) {
      el.textContent = privateBRL(type, targetValue);
      el.dataset.currentValue = String(targetValue);
      return;
    }
    const duration = 700;
    const startValue = parseFloat(el.dataset.currentValue || "0");
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = startValue + (targetValue - startValue) * eased;
      el.textContent = formatBRL(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatBRL(targetValue);
        el.dataset.currentValue = String(targetValue);
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    document.getElementById("toastMessage").textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  /* ---------------- Rendering: header / month ---------------- */
  function renderMonthLabel() {
    const label = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    document.getElementById("monthLabel").textContent = label;
    document.getElementById("resumoMesLabel").textContent = MONTH_NAMES[viewMonth];
    document.getElementById("lancMesLabel").textContent = MONTH_NAMES[viewMonth].toLowerCase();
    document.getElementById("ganhosMesLabel").textContent = MONTH_NAMES[viewMonth].toLowerCase();
    document.getElementById("gastosMesLabel").textContent = MONTH_NAMES[viewMonth].toLowerCase();

    const hour = today.getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const isCurrentRealMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    document.querySelector("#topbarText h1").innerHTML = `${isCurrentRealMonth ? greeting : "Olá"}! <span class="wave">👋</span>`;
  }

  /* ---------------- Rendering: stat cards ---------------- */
  function renderStatCards(totals, prevTotals) {
    animateCounter(document.getElementById("cardGanhos"), totals.ganhos, "ganho");
    animateCounter(document.getElementById("cardGastos"), totals.gastos, "gasto");
    animateCounter(document.getElementById("cardSaldo"), totals.saldo, "saldo");
    animateCounter(document.getElementById("cardInvest"), totals.investimentos, "investimento");

    const ganhosVar = pctChange(totals.ganhos, prevTotals.ganhos);
    const gastosVar = pctChange(totals.gastos, prevTotals.gastos);
    const investVar = pctChange(totals.investimentos, prevTotals.investimentos);

    document.getElementById("ganhosSub").textContent = privacyState.ganho ? "Valores ocultos" : trendText(ganhosVar);
    document.getElementById("gastosSub").textContent = privacyState.gasto ? "Valores ocultos" : trendText(gastosVar, true);
    document.getElementById("investSub").textContent = privacyState.investimento ? "Valores ocultos" : "Total investido este mês · " + trendText(investVar);
    document.getElementById("saldoSub").textContent = isValueHidden("saldo") ? "Saldo protegido" : (totals.saldo >= 0 ? "Saldo positivo este mês" : "Saldo negativo este mês");
  }

  function trendText(pct, inverse) {
    const arrow = pct >= 0 ? "↑" : "↓";
    const good = inverse ? pct <= 0 : pct >= 0;
    const cls = good ? "up-arrow" : "down-arrow";
    return `${arrow} ${Math.abs(pct).toFixed(1)}% vs mês anterior`;
  }

  /* ---------------- Rendering: evolution chart (Ganhos x Gastos) ---------------- */
  function renderEvolutionChart() {
    const labels = [];
    const ganhosData = [];
    const gastosData = [];

    for (let m = 0; m <= 11; m++) {
      const list = entriesForMonth(viewYear, m);
      labels.push(MONTH_SHORT[m]);
      ganhosData.push(sumByType(list, "ganho"));
      gastosData.push(sumByType(list, "gasto"));
    }

    const ctx = document.getElementById("evolutionChart").getContext("2d");
    if (charts.evolution) charts.evolution.destroy();

    charts.evolution = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("Ganhos", ganhosData, COLORS.ganho),
          lineDataset("Gastos", gastosData, COLORS.gasto)
        ]
      },
      options: baseChartOptions()
    });
  }

  function lineDataset(label, data, color) {
    return {
      label, data, borderColor: color,
      backgroundColor: hexToRgba(color, 0.12),
      pointBackgroundColor: color,
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointRadius: 3.5,
      pointHoverRadius: 6,
      borderWidth: 2.5,
      tension: 0.4,
      fill: true
    };
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  function baseChartOptions() {
    const gridColor = isDark() ? "rgba(255,255,255,0.06)" : "rgba(76,31,158,0.06)";
    const textColor = isDark() ? "#baacdc" : "#635b7a";
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top", align: "end",
          labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, color: textColor, font: { family: "Inter", size: 12, weight: "600" }, padding: 16 }
        },
        tooltip: {
          backgroundColor: isDark() ? "#251a4d" : "#1d0e42",
          titleFont: { family: "Sora", weight: "700" },
          bodyFont: { family: "Inter" },
          padding: 12, cornerRadius: 10, displayColors: true, boxPadding: 4,
          callbacks: { label: (ctx) => { const type = ctx.dataset.label === "Ganhos" ? "ganho" : "gasto"; return ` ${ctx.dataset.label}: ${privateBRL(type, ctx.parsed.y)}`; } }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { family: "Inter", size: 11.5 } } },
        y: {
          grid: { color: gridColor }, border: { display: false },
          ticks: { color: textColor, font: { family: "Inter", size: 11 }, callback: (v) => (privacyState.ganho || privacyState.gasto) ? "••••" : formatBRLShort(v) }
        }
      }
    };
  }

  /* ---------------- Rendering: donut chart (distribuição dos GANHOS por categoria) ---------------- */
  function renderGanhosDonutChart(totals, monthList) {
    const ctx = document.getElementById("ganhosDonutChart").getContext("2d");
    if (charts.ganhosDonut) charts.ganhosDonut.destroy();

    const centerValue = document.getElementById("ganhosDonutCenterValue");

    const ganhoEntries = monthList.filter((e) => e.type === "ganho");
    const byCat = {};
    ganhoEntries.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    let labels = sorted.map((s) => s[0]);
    let data = sorted.map((s) => s[1]);
    let colors = labels.map((category) => getCategoryColor("ganho", category));
    centerValue.textContent = privateBRL("ganho", totals.ganhos, true);
    if (labels.length === 0) { labels = ["Sem ganhos"]; data = [1]; colors = ["#e8e1fa"]; }

    charts.ganhosDonut = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: isDark() ? "#1e1440" : "#ffffff", hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "72%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, padding: 12, color: isDark() ? "#baacdc" : "#635b7a", font: { family: "Inter", size: 11.5 } }
          },
          tooltip: {
            backgroundColor: isDark() ? "#251a4d" : "#1d0e42", padding: 10, cornerRadius: 10,
            callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((s, v) => s + Number(v), 0); const pct = total ? (Number(ctx.parsed) / total) * 100 : 0; return ` ${ctx.label}: ${privateBRL("ganho", ctx.parsed)}${privacyState.ganho ? "" : ` (${pct.toFixed(1)}%)`}`; } }
          }
        }
      }
    });
  }

  /* ---------------- Rendering: donut chart (distribuição dos GASTOS por categoria) ---------------- */
  function renderDonutChart(totals, monthList) {
    const ctx = document.getElementById("donutChart").getContext("2d");
    if (charts.donut) charts.donut.destroy();

    const centerValue = document.getElementById("donutCenterValue");

    const gastoEntries = monthList.filter((e) => e.type === "gasto");
    const byCat = {};
    gastoEntries.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    let labels = sorted.map((s) => s[0]);
    let data = sorted.map((s) => s[1]);
    let colors = labels.map((category) => getCategoryColor("gasto", category));
    centerValue.textContent = privateBRL("gasto", totals.gastos, true);
    if (labels.length === 0) { labels = ["Sem gastos"]; data = [1]; colors = ["#e8e1fa"]; }

    charts.donut = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: isDark() ? "#1e1440" : "#ffffff", hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "72%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, padding: 12, color: isDark() ? "#baacdc" : "#635b7a", font: { family: "Inter", size: 11.5 } }
          },
          tooltip: {
            backgroundColor: isDark() ? "#251a4d" : "#1d0e42", padding: 10, cornerRadius: 10,
            callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((s, v) => s + Number(v), 0); const pct = total ? (Number(ctx.parsed) / total) * 100 : 0; return ` ${ctx.label}: ${privateBRL("gasto", ctx.parsed)}${privacyState.gasto ? "" : ` (${pct.toFixed(1)}%)`}`; } }
          }
        }
      }
    });
  }

  function shadeOfPurpleAndPink(i) {
    const palette = ["#7038db", "#a180f0", "#e04b6b", "#f0a8bd", "#4c1f9e", "#c4b1f7", "#f7c6d3", "#33176b"];
    return palette[i % palette.length];
  }

  /* ---------------- Rendering: resumo do mês ---------------- */
  function renderResumo(totals) {
    const rows = [
      { label: "Ganhos", value: totals.ganhos, color: COLORS.ganho },
      { label: "Gastos", value: totals.gastos, color: COLORS.gasto },
      { label: "Investimentos", value: totals.investimentos, color: COLORS.investimento },
      { label: "Saldo", value: totals.saldo, color: totals.saldo >= 0 ? COLORS.ganho : COLORS.gasto }
    ];
    document.getElementById("resumoRows").innerHTML = rows.map((r) => `
      <div class="resumo-row">
        <span class="r-label"><span class="r-dot" style="background:${r.color}"></span>${r.label}</span>
        <span class="r-value" style="color:${r.color}">${privateBRL(r.label === "Ganhos" ? "ganho" : r.label === "Gastos" ? "gasto" : r.label === "Investimentos" ? "investimento" : "saldo", r.value)}</span>
      </div>
    `).join("");

    document.getElementById("resumoPhrase").innerHTML = buildResumoPhrase(totals);
  }

  function buildResumoPhrase(totals) {
    if (privacyState.ganho || privacyState.gasto || privacyState.investimento) return "Alguns valores estão ocultos pelo modo de privacidade.";
    const phrases = [];
    if (totals.ganhos > 0) {
      const investPct = (totals.investimentos / totals.ganhos) * 100;
      const gastoPct = (totals.gastos / totals.ganhos) * 100;
      phrases.push(`Você investiu <strong>${investPct.toFixed(0)}%</strong> do que ganhou este mês.`);
      phrases.push(`Seus gastos representam <strong>${gastoPct.toFixed(0)}%</strong> dos seus ganhos.`);
    } else {
      phrases.push("Nenhum ganho registrado neste mês ainda.");
    }
    phrases.push(totals.saldo >= 0
      ? "Você terminou o mês com saldo positivo. 🎉"
      : "Você terminou o mês com saldo negativo — vale revisar os gastos.");
    return phrases.join(" ");
  }

  /* ---------------- Rendering: comparisons (ganhos/gastos) ---------------- */
  function renderCompareBlock(containerId, currType, currValue, prevValue, color) {
    const el = document.getElementById(containerId);
    const delta = pctChange(currValue, prevValue);
    const positiveIsGood = currType === "ganho" ? delta >= 0 : delta <= 0;
    const maxVal = Math.max(currValue, prevValue, 1);
    const currH = Math.max((currValue / maxVal) * 100, 4);
    const prevH = Math.max((prevValue / maxVal) * 100, 4);
    const prevMonthIdx = prevMonthOf(viewYear, viewMonth).month;

    const hidden = isValueHidden(currType);
    el.innerHTML = `
      <div class="compare-delta ${positiveIsGood ? "positive" : "negative"}">
        <i data-lucide="${delta >= 0 ? "trending-up" : "trending-down"}"></i>
        ${hidden ? "••••" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
      </div>
      <div class="compare-bars">
        <div class="compare-bar-col">
          <div class="compare-bar" style="height:${prevH}%; background:${hexToRgba(color, 0.35)}"></div>
          <span class="compare-bar-label">${MONTH_SHORT[prevMonthIdx]}</span>
        </div>
        <div class="compare-bar-col">
          <div class="compare-bar" style="height:${currH}%; background:${color}"></div>
          <span class="compare-bar-label">${MONTH_SHORT[viewMonth]}</span>
        </div>
      </div>
      <div class="compare-row">
        <span class="c-label">${MONTH_NAMES[viewMonth]}</span>
        <span class="c-value" style="color:${color}">${privateBRL(currType, currValue)}</span>
      </div>
      <div class="compare-row">
        <span class="c-label">${MONTH_NAMES[prevMonthIdx]}</span>
        <span class="c-value" style="color:${hexToRgba(color,0.75)}">${privateBRL(currType, prevValue)}</span>
      </div>
    `;
    refreshIcons();
  }

  /* ---------------- Rendering: entries table (overview) ---------------- */
  function getFilteredMonthEntries() {
    let list = entriesForMonth(viewYear, viewMonth);
    if (typeFilter !== "todos") list = list.filter((e) => e.type === typeFilter);
    if (categoryFilter !== "todas") list = list.filter((e) => e.category === categoryFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((e) => e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => b.date.localeCompare(a.date));
  }

  function renderCategoryFilterOptions() {
    const select = document.getElementById("categoryFilter");
    const monthList = entriesForMonth(viewYear, viewMonth);
    const relevant = typeFilter === "todos" ? monthList : monthList.filter((e) => e.type === typeFilter);
    const cats = Array.from(new Set(relevant.map((e) => e.category))).sort();
    const prevValue = categoryFilter;
    select.innerHTML = `<option value="todas">Todas categorias</option>` +
      cats.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
    if (cats.includes(prevValue)) select.value = prevValue; else { categoryFilter = "todas"; select.value = "todas"; }
  }

  function renderEntriesTable() {
    const list = getFilteredMonthEntries();
    const body = document.getElementById("entriesBody");
    const empty = document.getElementById("emptyState");

    if (list.length === 0) {
      body.innerHTML = "";
      empty.hidden = false;
      refreshIcons();
      return;
    }
    empty.hidden = true;

    body.innerHTML = list.map((e) => rowTemplate(e, true)).join("");
    attachRowHandlers(body);
    refreshIcons();
  }

  function rowTemplate(e, withCategoryTag) {
    const sign = e.type === "gasto" ? "− " : e.type === "investimento" ? "" : "+ ";
    return `
      <tr data-id="${e.id}">
        <td class="cell-date">${formatDateBR(e.date)}</td>
        <td class="cell-desc">${escapeHtml(e.description)}</td>
        <td><span class="category-chip"><span class="category-dot" style="background:${getCategoryColor(e.type, e.category)}"></span>${escapeHtml(e.category)}</span></td>
        ${withCategoryTag ? `<td><span class="badge ${e.type}">${TYPE_LABEL[e.type]}</span></td>` : ""}
        <td class="cell-value ${e.type}">${isValueHidden(e.type) ? privateBRL(e.type, e.amount) : sign + privateBRL(e.type, e.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn edit-btn" data-id="${e.id}" title="Editar"><i data-lucide="pencil"></i></button>
            <button class="icon-btn danger delete-btn" data-id="${e.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>
    `;
  }

  function attachRowHandlers(scopeEl) {
    scopeEl.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.id));
    });
    scopeEl.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => openDeleteConfirm(btn.dataset.id));
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  /* ---------------- Rendering: type-specific pages ---------------- */
  function renderGanhosPage(monthList, totals) {
    document.getElementById("ganhosPageTotal").textContent = privateBRL("ganho", totals.ganhos);
    document.getElementById("ganhosPageYear").textContent = privateBRL("ganho", sumByType(entriesForYear(viewYear), "ganho"));
    const prev = computeTotals(entriesForMonth(...Object.values(prevMonthOf(viewYear, viewMonth))));
    document.getElementById("ganhosPageVar").textContent = privacyState.ganho ? "••••" : `${pctChange(totals.ganhos, prev.ganhos) >= 0 ? "+" : ""}${pctChange(totals.ganhos, prev.ganhos).toFixed(1)}%`;

    const ganhoList = monthList.filter((e) => e.type === "ganho").sort((a, b) => b.date.localeCompare(a.date));
    const body = document.getElementById("ganhosBody");
    const empty = document.getElementById("ganhosEmpty");
    if (ganhoList.length === 0) { body.innerHTML = ""; empty.hidden = false; }
    else { empty.hidden = true; body.innerHTML = ganhoList.map((e) => rowTemplate(e, false)).join(""); attachRowHandlers(body); }

    renderCategoryBarChart("ganhosCategoryChart", ganhoList, "ganho");
    refreshIcons();
  }

  function renderGastosPage(monthList, totals) {
    document.getElementById("gastosPageTotal").textContent = privateBRL("gasto", totals.gastos);
    document.getElementById("gastosPageYear").textContent = privateBRL("gasto", sumByType(entriesForYear(viewYear), "gasto"));
    const prev = computeTotals(entriesForMonth(...Object.values(prevMonthOf(viewYear, viewMonth))));
    document.getElementById("gastosPageVar").textContent = privacyState.gasto ? "••••" : `${pctChange(totals.gastos, prev.gastos) >= 0 ? "+" : ""}${pctChange(totals.gastos, prev.gastos).toFixed(1)}%`;

    const gastoList = monthList.filter((e) => e.type === "gasto").sort((a, b) => b.date.localeCompare(a.date));
    const body = document.getElementById("gastosBody");
    const empty = document.getElementById("gastosEmpty");
    if (gastoList.length === 0) { body.innerHTML = ""; empty.hidden = false; }
    else { empty.hidden = true; body.innerHTML = gastoList.map((e) => rowTemplate(e, false)).join(""); attachRowHandlers(body); }

    renderCategoryBarChart("gastosCategoryChart", gastoList, "gasto");
    refreshIcons();
  }

  function renderCategoryBarChart(canvasId, list, type) {
    const byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map((s) => s[0]);
    const data = sorted.map((s) => s[1]);

    const ctx = document.getElementById(canvasId).getContext("2d");
    if (charts[canvasId]) charts[canvasId].destroy();

    charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels: labels.length ? labels : ["Sem dados"], datasets: [{ data: data.length ? data : [0], backgroundColor: labels.length ? labels.map((category) => getCategoryColor(type, category)) : ["#D8D1E8"], borderRadius: 8, maxBarThickness: 40 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: isDark() ? "#251a4d" : "#1d0e42", padding: 10, cornerRadius: 10,
          callbacks: { label: (ctx) => { const total = data.reduce((s, v) => s + Number(v), 0); const pct = total ? (Number(ctx.parsed.y) / total) * 100 : 0; return ` ${ctx.label}: ${privateBRL(type, ctx.parsed.y)}${isValueHidden(type) ? "" : ` (${pct.toFixed(1)}%)`}`; } }
        } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark() ? "#baacdc" : "#635b7a", font: { size: 11 } } },
          y: { grid: { color: isDark() ? "rgba(255,255,255,0.06)" : "rgba(76,31,158,0.06)" }, border: { display: false }, ticks: { color: isDark() ? "#baacdc" : "#635b7a", callback: (v) => isValueHidden(type) ? "••••" : formatBRLShort(v) } }
        }
      }
    });
  }

  function renderInvestimentosPage(monthList, totals) {
    document.getElementById("investPatrimonioTotal").textContent = privateBRL("investimento", sumByType(entries, "investimento"));
    document.getElementById("investMesTotal").textContent = privateBRL("investimento", totals.investimentos);
    const yearTotal = sumByType(entriesForYear(viewYear), "investimento");
    document.getElementById("investAnoTotal").textContent = privateBRL("investimento", yearTotal);
    const pct = totals.ganhos > 0 ? (totals.investimentos / totals.ganhos) * 100 : 0;
    const hideInvestPct = privacyState.investimento || privacyState.ganho;
    document.getElementById("investPercent").textContent = hideInvestPct ? "••••" : `${pct.toFixed(1)}%`;
    document.getElementById("investProgressFill").style.width = hideInvestPct ? "0%" : `${Math.min(pct, 100)}%`;

    const investList = monthList.filter((e) => e.type === "investimento").sort((a, b) => b.date.localeCompare(a.date));
    const body = document.getElementById("investBody");
    const empty = document.getElementById("investEmpty");
    if (investList.length === 0) { body.innerHTML = ""; empty.hidden = false; }
    else { empty.hidden = true; body.innerHTML = investList.map((e) => rowTemplate(e, false)).join(""); attachRowHandlers(body); }

    const labels = [];
    const data = [];
    for (let m = 0; m <= 11; m++) {
      labels.push(MONTH_SHORT[m]);
      data.push(sumByType(entriesForMonth(viewYear, m), "investimento"));
    }
    const ctx = document.getElementById("investEvolutionChart").getContext("2d");
    if (charts.investEvo) charts.investEvo.destroy();
    charts.investEvo = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Investido", data, backgroundColor: hexToRgba(COLORS.investimento, 0.8), borderRadius: 8, maxBarThickness: 34 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: isDark() ? "#251a4d" : "#1d0e42", padding: 10, cornerRadius: 10,
          callbacks: { label: (ctx) => ` ${privateBRL("investimento", ctx.parsed.y)}` }
        } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark() ? "#baacdc" : "#635b7a", font: { size: 11 } } },
          y: { grid: { color: isDark() ? "rgba(255,255,255,0.06)" : "rgba(76,31,158,0.06)" }, border: { display: false }, ticks: { color: isDark() ? "#baacdc" : "#635b7a", callback: (v) => privacyState.investimento ? "••••" : formatBRLShort(v) } }
        }
      }
    });

    renderCategoryBarChart("investCategoryChart", investList, "investimento");
    refreshIcons();
  }

  /* ---------------- Master render ---------------- */
  function renderAll() {
    renderMonthLabel();
    const monthList = entriesForMonth(viewYear, viewMonth);
    const totals = computeTotals(monthList);
    const prev = prevMonthOf(viewYear, viewMonth);
    const prevTotals = computeTotals(entriesForMonth(prev.year, prev.month));

    renderStatCards(totals, prevTotals);
    renderEvolutionChart();
    renderGanhosDonutChart(totals, monthList);
    renderDonutChart(totals, monthList);
    renderResumo(totals);
    renderCompareBlock("compareGanhos", "ganho", totals.ganhos, prevTotals.ganhos, COLORS.ganho);
    renderCompareBlock("compareGastos", "gasto", totals.gastos, prevTotals.gastos, COLORS.gasto);

    renderCategoryFilterOptions();
    renderEntriesTable();

    renderGanhosPage(monthList, totals);
    renderGastosPage(monthList, totals);
    renderInvestimentosPage(monthList, totals);
    renderPrivacyControls();
    refreshIcons();
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  /* ---------------- Navigation ---------------- */
  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
    document.getElementById(`view-${view}`).classList.add("is-active");

    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === view));
    document.querySelectorAll(".bnav-item[data-view]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === view));

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setupNavigation() {
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }

  /* ---------------- Month switching ---------------- */
  function changeMonth(delta) {
    viewMonth += delta;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderAll();
  }

  /* ---------------- Modal: add / edit entry ---------------- */
  const modalOverlay = () => document.getElementById("modalOverlay");

  function openAddModal(presetType) {
    editingEntryId = null;
    currentModalType = presetType || "ganho";
    document.getElementById("modalTitle").textContent = "Adicionar lançamento";
    document.getElementById("submitBtn").textContent = "Salvar lançamento";
    document.getElementById("entryForm").reset();
    document.getElementById("entryId").value = "";
    document.getElementById("dateInput").value = isoForCurrentView();
    document.getElementById("customCategoryWrap").hidden = true;
    setModalType(currentModalType);
    populateCategorySelect(currentModalType);
    renderColorPicker(document.getElementById("categoryInput").value);
    openModal(modalOverlay());
  }

  function isoForCurrentView() {
    const isRealCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    if (isRealCurrentMonth) return todayISO();
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    return `${viewYear}-${pad2(viewMonth + 1)}-${pad2(Math.min(15, lastDay))}`;
  }

  function openEditModal(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    editingEntryId = id;
    currentModalType = entry.type;
    document.getElementById("modalTitle").textContent = "Editar lançamento";
    document.getElementById("submitBtn").textContent = "Salvar alterações";
    document.getElementById("entryId").value = id;
    document.getElementById("descInput").value = entry.description;
    document.getElementById("amountInput").value = formatAmountForInput(entry.amount);
    document.getElementById("dateInput").value = entry.date;
    document.getElementById("customCategoryWrap").hidden = true;
    setModalType(currentModalType);
    populateCategorySelect(currentModalType, entry.category);
    renderColorPicker(entry.category);
    openModal(modalOverlay());
  }

  function formatAmountForInput(amount) {
    return Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setModalType(type) {
    currentModalType = type;
    document.querySelectorAll(".type-opt").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.type === type));
    populateCategorySelect(type);
    document.getElementById("customCategoryWrap").hidden = true;
    document.getElementById("customCategoryInput").value = "";
    renderColorPicker(document.getElementById("categoryInput").value);
  }

  function populateCategorySelect(type, selected) {
    const select = document.getElementById("categoryInput");
    const cats = categoriesForType(type);
    select.innerHTML = cats.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("") +
      `<option value="__custom__">+ Nova categoria personalizada</option>`;
    if (selected && cats.includes(selected)) {
      select.value = selected;
    } else if (selected) {
      // custom category not in list yet, add it
      const opt = document.createElement("option");
      opt.value = selected; opt.textContent = selected;
      select.insertBefore(opt, select.lastElementChild);
      select.value = selected;
    } else {
      select.value = cats[0];
    }
  }

  function openModal(el) {
    el.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeModal(el) {
    el.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function parseCurrency(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  function maskCurrencyInput(el) {
    el.addEventListener("input", () => {
      let digits = el.value.replace(/\D/g, "");
      if (!digits) { el.value = ""; return; }
      digits = digits.replace(/^0+(?=\d)/, "");
      while (digits.length < 3) digits = "0" + digits;
      const cents = digits.slice(-2);
      let intPart = digits.slice(0, -2);
      intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      el.value = `${intPart},${cents}`;
    });
  }

  function handleFormSubmit(evt) {
    evt.preventDefault();
    const desc = document.getElementById("descInput").value.trim();
    const amount = parseCurrency(document.getElementById("amountInput").value);
    const date = document.getElementById("dateInput").value;
    let category = document.getElementById("categoryInput").value;

    if (category === "__custom__") {
      const customName = document.getElementById("customCategoryInput").value.trim();
      if (!customName) {
        document.getElementById("customCategoryInput").focus();
        return;
      }
      category = customName;
      addCustomCategory(currentModalType, customName);
    }

    const categoryColor = document.getElementById("categoryColorCustom").value;

    if (!desc || !amount || amount <= 0 || !date) {
      showToast("Preencha todos os campos corretamente.");
      return;
    }

    if (editingEntryId) {
      const entry = entries.find((e) => e.id === editingEntryId);
      Object.assign(entry, { type: currentModalType, description: desc, amount, date, category, demo: false });
      showToast("✓ Lançamento atualizado!");
    } else {
      entries.push({ id: uid(), type: currentModalType, description: desc, amount, date, category, demo: false });
      showToast("✓ Lançamento adicionado!");
    }

    setCategoryColor(currentModalType, category, categoryColor);
    saveEntries();
    closeModal(modalOverlay());

    // Jump view to the month of the saved entry so the user sees it reflected
    const [y, m] = date.split("-").map(Number);
    viewYear = y; viewMonth = m - 1;
    renderAll();
  }

  /* ---------------- Delete confirm ---------------- */
  const confirmOverlayEl = () => document.getElementById("confirmOverlay");

  function openDeleteConfirm(id) {
    deleteTargetId = id;
    openModal(confirmOverlayEl());
  }

  function performDelete() {
    entries = entries.filter((e) => e.id !== deleteTargetId);
    saveEntries();
    closeModal(confirmOverlayEl());
    showToast("✓ Lançamento excluído!");
    deleteTargetId = null;
    renderAll();
  }

  /* ---------------- Theme ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const isDarkNow = theme === "dark";
    document.getElementById("themeIcon").setAttribute("data-lucide", isDarkNow ? "sun" : "moon");
    document.getElementById("themeLabel").textContent = isDarkNow ? "Modo claro" : "Modo escuro";
    document.getElementById("themeLabelSettings").textContent = isDarkNow ? "Ativar modo claro" : "Ativar modo escuro";
    refreshIcons();
    // Re-render charts so colors adapt
    renderAll();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ---------------- Export / Import ---------------- */
  function exportData() {
    const dataStr = JSON.stringify({ version: 2, entries, categoryColors: loadCategoryColors(), customCategories: loadCustomCategories() }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yenom-financas-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("✓ Dados exportados!");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const importedEntries = Array.isArray(parsed) ? parsed : parsed.entries;
        if (!Array.isArray(importedEntries)) throw new Error("Formato inválido");
        if (!Array.isArray(parsed) && parsed.categoryColors) saveCategoryColors(parsed.categoryColors);
        if (!Array.isArray(parsed) && parsed.customCategories) saveCustomCategories(parsed.customCategories);
        const valid = importedEntries.filter((e) => e && e.type && e.amount && e.date && e.description);
        const withNewIds = valid.map((e) => ({
          id: uid(),
          type: e.type, description: e.description, category: e.category || "Outros",
          amount: Number(e.amount), date: e.date, demo: false
        }));
        entries = entries.concat(withNewIds);
        saveEntries();
        ensureAllCategoryColors();
        showToast(`✓ ${withNewIds.length} lançamentos importados!`);
        renderAll();
      } catch (err) {
        showToast("Não foi possível importar esse arquivo.");
      }
    };
    reader.readAsText(file);
  }

  function clearDemoData() {
    const before = entries.length;
    entries = entries.filter((e) => !e.demo);
    saveEntries();
    const removed = before - entries.length;
    showToast(removed > 0 ? "✓ Dados demonstrativos removidos!" : "Nenhum dado demonstrativo encontrado.");
    renderAll();
  }

  /* ---------------- Wiring ---------------- */
  function setupEventListeners() {
    document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
    document.getElementById("nextMonth").addEventListener("click", () => changeMonth(1));

    document.getElementById("openAddModalBtn").addEventListener("click", () => openAddModal("ganho"));
    document.getElementById("bottomAddBtn").addEventListener("click", () => openAddModal("ganho"));

    document.getElementById("modalCloseBtn").addEventListener("click", () => closeModal(modalOverlay()));
    document.getElementById("cancelBtn").addEventListener("click", () => closeModal(modalOverlay()));
    modalOverlay().addEventListener("click", (e) => { if (e.target === modalOverlay()) closeModal(modalOverlay()); });

    document.querySelectorAll(".type-opt").forEach((btn) => {
      btn.addEventListener("click", () => setModalType(btn.dataset.type));
    });

    document.getElementById("categoryInput").addEventListener("change", (e) => {
      document.getElementById("customCategoryWrap").hidden = e.target.value !== "__custom__";
      if (e.target.value === "__custom__") document.getElementById("customCategoryInput").focus();
    });

    maskCurrencyInput(document.getElementById("amountInput"));
    document.getElementById("entryForm").addEventListener("submit", handleFormSubmit);

    document.getElementById("confirmCancelBtn").addEventListener("click", () => closeModal(confirmOverlayEl()));
    document.getElementById("confirmDeleteBtn").addEventListener("click", performDelete);
    confirmOverlayEl().addEventListener("click", (e) => { if (e.target === confirmOverlayEl()) closeModal(confirmOverlayEl()); });

    document.getElementById("searchInput").addEventListener("input", (e) => { searchTerm = e.target.value; renderEntriesTable(); });

    document.querySelectorAll(".pill[data-filter]").forEach((pill) => {
      pill.addEventListener("click", () => {
        typeFilter = pill.dataset.filter;
        document.querySelectorAll(".pill[data-filter]").forEach((p) => p.classList.toggle("is-active", p === pill));
        categoryFilter = "todas";
        renderCategoryFilterOptions();
        renderEntriesTable();
      });
    });

    document.getElementById("categoryFilter").addEventListener("change", (e) => {
      categoryFilter = e.target.value;
      renderEntriesTable();
    });

    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("themeToggleSettings").addEventListener("click", toggleTheme);

    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importInput").addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
    document.getElementById("clearDemoBtn").addEventListener("click", clearDemoData);

    document.querySelectorAll("[data-privacy-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePrivacy(btn.dataset.privacyToggle);
      });
    });

    const investBanner = document.getElementById("investBanner");
    if (investBanner) {
      investBanner.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          switchView("investimentos");
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modalOverlay().classList.contains("is-open")) closeModal(modalOverlay());
        if (confirmOverlayEl().classList.contains("is-open")) closeModal(confirmOverlayEl());
      }
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    loadEntries();

    setupNavigation();
    setupEventListeners();

    document.getElementById("themeIcon").setAttribute("data-lucide", savedTheme === "dark" ? "sun" : "moon");
    document.getElementById("themeLabel").textContent = savedTheme === "dark" ? "Modo claro" : "Modo escuro";
    document.getElementById("themeLabelSettings").textContent = savedTheme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";

    renderAll();
    refreshIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
