// --- STATE MANAGEMENT ---
const DEFAULT_CATEGORIES = ["Food Outside", "Random Stuff", "Online Shopping", "Laundry", "Transport", "Utilities"];
const THEME_STORAGE_KEY = "hostelSpend_theme";
const APP_PIN_STORAGE_KEY = "hostelSpend_pin";
const APP_PIN_ITERATIONS = 310000;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
const initialTheme = savedTheme === "light" ? "light" : "dark";
document.documentElement.dataset.theme = initialTheme;
let expenses = JSON.parse(localStorage.getItem("hostelSpend_expenses")) || [];
let baseMonthlyBudget = parseFloat(localStorage.getItem("hostelSpend_budget")) || 0;
let rolloverAmount = parseFloat(localStorage.getItem("hostelSpend_rollover")) || 0;
let categoryLimits = JSON.parse(localStorage.getItem("hostelSpend_categoryLimits")) || {};
let budgetStartDateStr = localStorage.getItem("hostelSpend_budgetStartDate");
let plannedExpenses = JSON.parse(localStorage.getItem("hostelSpend_plannedExpenses")) || [];
let savingsGoals = JSON.parse(localStorage.getItem("hostelSpend_savingsGoals")) || [];
let sharedExpenses = JSON.parse(localStorage.getItem("hostelSpend_sharedExpenses")) || [];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BUDGET_CYCLE_DAYS = 30;
const BUDGET_CYCLE_IN_MS = BUDGET_CYCLE_DAYS * DAY_IN_MS;
const todayObj = new Date();
const todayStr = todayObj.toISOString().split('T')[0];

let budgetStartDate = budgetStartDateStr ? new Date(budgetStartDateStr) : todayObj;
if (!budgetStartDateStr || Number.isNaN(budgetStartDate.getTime())) {
  budgetStartDate = todayObj;
  budgetStartDateStr = budgetStartDate.toISOString();
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
}

// Advance only through completed 30-day cycles, preserving the original cycle boundary.
const elapsedMs = todayObj.getTime() - budgetStartDate.getTime();
const completedCycles = Math.floor(elapsedMs / BUDGET_CYCLE_IN_MS);
if (completedCycles > 0) {
  for (let cycle = 0; cycle < completedCycles; cycle++) {
    const cycleStart = new Date(budgetStartDate.getTime() + cycle * BUDGET_CYCLE_IN_MS);
    const cycleEnd = new Date(cycleStart.getTime() + BUDGET_CYCLE_IN_MS);
    const cycleStartDay = cycleStart.toISOString().split('T')[0];
    const cycleEndDay = cycleEnd.toISOString().split('T')[0];
    const previousCycleExpenses = expenses.filter(
      exp => exp.date >= cycleStartDay && exp.date < cycleEndDay
    );
    const previousCycleSpent = previousCycleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const unspent = baseMonthlyBudget + rolloverAmount - previousCycleSpent;

    rolloverAmount = unspent > 0 && baseMonthlyBudget > 0 ? unspent : 0;
  }

  budgetStartDate = new Date(budgetStartDate.getTime() + completedCycles * BUDGET_CYCLE_IN_MS);
  budgetStartDateStr = budgetStartDate.toISOString();
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
  localStorage.setItem("hostelSpend_rollover", rolloverAmount);
}

// The active 30-day budget includes any amount rolled over from the previous cycle.
let effectiveBudget = baseMonthlyBudget + rolloverAmount;

// --- DOM ELEMENTS ---
const views = document.querySelectorAll("section[data-view]");
const navBtns = document.querySelectorAll("nav[aria-label='Primary'] .nav-btn");
const appHeading = document.getElementById("app-heading");
const monthLabel = document.getElementById("month-label");
const themeToggleEl = document.getElementById("theme-toggle");
const toastEl = document.getElementById("toast");
const budgetAlertEl = document.getElementById("budget-alert");

const spentTotalEl = document.getElementById("spent-total");
const budgetTotalEl = document.getElementById("budget-total");
const budgetRemainingEl = document.getElementById("budget-remaining");
const budgetProgressEl = document.getElementById("budget-progress");
const dailyAllowableEl = document.getElementById("daily-allowable");
const dailyStatusEl = document.getElementById("daily-status");
const daysLeftEl = document.getElementById("days-left");
const expenseListEl = document.getElementById("expense-list");
const categoryListEl = document.getElementById("category-list");
const historyMonthEl = document.getElementById("history-month");
const historyTotalEl = document.getElementById("history-total");
const historyListEl = document.getElementById("history-list");
const weeklySpentEl = document.getElementById("weekly-spent");
const weeklyTargetEl = document.getElementById("weekly-target");
const weeklyProgressEl = document.getElementById("weekly-progress");
const upcomingTotalEl = document.getElementById("upcoming-total");
const spendableTotalEl = document.getElementById("spendable-total");
const cycleComparisonEl = document.getElementById("cycle-comparison");
const needsTotalEl = document.getElementById("needs-total");
const wantsTotalEl = document.getElementById("wants-total");
const reportCategoryListEl = document.getElementById("report-category-list");
const plannedForm = document.getElementById("planned-form");
const plannedListEl = document.getElementById("planned-list");
const plannedCategoryEl = document.getElementById("planned-category");
const goalForm = document.getElementById("goal-form");
const goalListEl = document.getElementById("goal-list");
const sharedForm = document.getElementById("shared-form");
const sharedListEl = document.getElementById("shared-list");
const sharedBalancesEl = document.getElementById("shared-balances");
const notificationStatusEl = document.getElementById("notification-status");
const notificationEnableEl = document.getElementById("notification-enable");
const backupImportEl = document.getElementById("backup-import");
const expenseForm = document.getElementById("expense-form");
const settingsForm = document.getElementById("settings-form");
const dateInput = document.getElementById("date");
const categoryLimitsContainer = document.getElementById("category-limits");
const pinDialog = document.getElementById("pin-dialog");
const pinForm = document.getElementById("pin-form");
const pinInput = document.getElementById("app-pin");
const pinConfirmWrap = document.getElementById("pin-confirm-wrap");
const pinConfirmInput = document.getElementById("app-pin-confirm");
const pinTitle = document.getElementById("pin-dialog-title");
const pinDescription = document.getElementById("pin-dialog-description");
const pinLabel = document.getElementById("pin-label");
const pinError = document.getElementById("pin-error");
const pinCancelButton = document.getElementById("pin-cancel");
const pinSubmitButton = document.getElementById("pin-submit");
const pinForgotButton = document.getElementById("pin-forgot");
const recoveryDialog = document.getElementById("recovery-dialog");
const recoveryCodeEl = document.getElementById("recovery-code");
const recoverySavedButton = document.getElementById("recovery-saved");
const copyRecoveryCodeButton = document.getElementById("copy-recovery-code");
const changePinButton = document.getElementById("change-pin-button");
const VALID_VIEWS = new Set(["dashboard", "add", "settings"]);
let currentView = "dashboard";
let pinRequestMode = null;
let pinRequestPromise = null;
let resolvePinRequest = null;
let pinVerificationPending = false;
let expenseMutationPending = false;
let recoveryCodePending = null;
let resolveRecoveryCode = null;

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDatePickerValue(dateString) {
  return parseLocalDate(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDatePickerValue(input, dateString) {
  input.value = dateString;
  const picker = input.closest("[data-date-picker]");
  const valueEl = picker.querySelector("[data-date-picker-value]");
  valueEl.textContent = dateString ? formatDatePickerValue(dateString) : "Choose a date";
  renderDatePicker(picker);
}

function renderDatePicker(picker) {
  const input = picker.querySelector('input[type="hidden"]');
  const popover = picker.querySelector("[data-date-picker-popover]");
  const monthDate = picker.dataset.viewMonth
    ? parseLocalDate(`${picker.dataset.viewMonth}-01`)
    : input.value ? parseLocalDate(input.value) : new Date();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - ((firstDay.getDay() + 6) % 7));
  const selectedDate = input.value;
  const todayDate = toLocalDateString(new Date());
  const focusedDate = picker.dataset.focusDate || selectedDate || todayDate;
  const monthLabel = firstDay.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateString = toLocalDateString(date);
    const outsideMonth = date.getMonth() !== month;
    const dayLabel = date.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    const tabIndex = dateString === focusedDate ? 0 : -1;
    return `<button type="button" class="calendar-day" role="gridcell" data-calendar-day="${dateString}" data-outside-month="${outsideMonth}" data-today="${dateString === todayDate}" aria-label="${dayLabel}" aria-pressed="${dateString === selectedDate}" tabindex="${tabIndex}">${date.getDate()}</button>`;
  }).join("");

  popover.innerHTML = `
    <div class="mb-3 flex items-center justify-between">
      <button type="button" class="calendar-nav-button" data-calendar-shift="-1" aria-label="Previous month">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <p class="text-sm font-semibold">${monthLabel}</p>
      <button type="button" class="calendar-nav-button" data-calendar-shift="1" aria-label="Next month">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
    <div class="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500" aria-hidden="true">
      ${dayLabels.map(label => `<span class="py-1">${label}</span>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-1" role="grid" aria-label="${monthLabel}">
      ${days}
    </div>
    <div class="mt-3 flex justify-end border-t border-white/10 pt-2">
      <button type="button" class="calendar-today" data-calendar-today>Today</button>
    </div>
  `;
}

function closeDatePickers(exceptPicker) {
  document.querySelectorAll("[data-date-picker]").forEach(picker => {
    if (picker === exceptPicker) return;
    picker.querySelector("[data-date-picker-popover]").hidden = true;
    picker.querySelector("[data-date-picker-trigger]").setAttribute("aria-expanded", "false");
    picker.closest("form")?.classList.remove("date-picker-open");
  });
}

function positionDatePickerPopover(picker) {
  const trigger = picker.querySelector("[data-date-picker-trigger]");
  const popover = picker.querySelector("[data-date-picker-popover]");
  const triggerRect = trigger.getBoundingClientRect();
  const popoverHeight = popover.getBoundingClientRect().height;
  const stickyNav = document.querySelector("#app-shell nav[aria-label='Primary']");
  const navRect = stickyNav.getBoundingClientRect();
  const availableAbove = triggerRect.top - (navRect.top <= 0 ? navRect.bottom : 0) - 16;
  const availableBelow = window.innerHeight - triggerRect.bottom - 16;
  popover.dataset.placement = popoverHeight > availableBelow && availableAbove > availableBelow ? "above" : "below";
}

function initializeDatePickers() {
  document.querySelectorAll("[data-date-picker]").forEach(picker => {
    const input = picker.querySelector('input[type="hidden"]');
    setDatePickerValue(input, input.value);
  });

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-date-picker-trigger]");
    if (trigger) {
      const picker = trigger.closest("[data-date-picker]");
      const popover = picker.querySelector("[data-date-picker-popover]");
      const shouldOpen = popover.hidden;
      closeDatePickers(picker);
      if (shouldOpen) {
        const selectedDate = picker.querySelector('input[type="hidden"]').value || toLocalDateString(new Date());
        picker.dataset.viewMonth = selectedDate.slice(0, 7);
        picker.dataset.focusDate = selectedDate;
        renderDatePicker(picker);
        popover.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        picker.closest("form")?.classList.add("date-picker-open");
        positionDatePickerPopover(picker);
        popover.querySelector(`[data-calendar-day="${selectedDate}"]`)?.focus();
      } else {
        popover.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        picker.closest("form")?.classList.remove("date-picker-open");
      }
      return;
    }

    const shiftButton = event.target.closest("[data-calendar-shift]");
    if (shiftButton) {
      const picker = shiftButton.closest("[data-date-picker]");
      const month = parseLocalDate(`${picker.dataset.viewMonth}-01`);
      month.setMonth(month.getMonth() + Number(shiftButton.dataset.calendarShift));
      picker.dataset.viewMonth = toLocalDateString(month).slice(0, 7);
      picker.dataset.focusDate = `${picker.dataset.viewMonth}-01`;
      renderDatePicker(picker);
      picker.querySelector(`[data-calendar-day="${picker.dataset.focusDate}"]`)?.focus();
      return;
    }

    const dayButton = event.target.closest("[data-calendar-day]");
    if (dayButton) {
      const picker = dayButton.closest("[data-date-picker]");
      const input = picker.querySelector('input[type="hidden"]');
      setDatePickerValue(input, dayButton.dataset.calendarDay);
      picker.querySelector("[data-date-picker-popover]").hidden = true;
      picker.querySelector("[data-date-picker-trigger]").setAttribute("aria-expanded", "false");
      picker.closest("form")?.classList.remove("date-picker-open");
      picker.querySelector("[data-date-picker-trigger]").focus();
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const todayButton = event.target.closest("[data-calendar-today]");
    if (todayButton) {
      const picker = todayButton.closest("[data-date-picker]");
      const input = picker.querySelector('input[type="hidden"]');
      setDatePickerValue(input, toLocalDateString(new Date()));
      picker.querySelector("[data-date-picker-popover]").hidden = true;
      picker.querySelector("[data-date-picker-trigger]").setAttribute("aria-expanded", "false");
      picker.closest("form")?.classList.remove("date-picker-open");
      picker.querySelector("[data-date-picker-trigger]").focus();
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (!event.target.closest("[data-date-picker]")) closeDatePickers();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const openPicker = [...document.querySelectorAll("[data-date-picker]")].find(picker =>
        !picker.querySelector("[data-date-picker-popover]").hidden
      );
      if (openPicker) {
        closeDatePickers();
        openPicker.querySelector("[data-date-picker-trigger]").focus();
      }
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const dayButton = event.target.closest("[data-calendar-day]");
    if (!dayButton) return;
    event.preventDefault();
    const date = parseLocalDate(dayButton.dataset.calendarDay);
    const shift = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : 7;
    date.setDate(date.getDate() + shift);
    const picker = dayButton.closest("[data-date-picker]");
    const nextDate = toLocalDateString(date);
    picker.dataset.viewMonth = nextDate.slice(0, 7);
    picker.dataset.focusDate = nextDate;
    renderDatePicker(picker);
    picker.querySelector(`[data-calendar-day="${nextDate}"]`)?.focus();
  });
}

function syncCustomSelect(select) {
  const wrapper = select.closest("[data-custom-select]");
  if (!wrapper) return;
  const selectedOption = select.options[select.selectedIndex];
  wrapper.querySelector("[data-custom-select-value]").textContent = selectedOption?.textContent || "";
  wrapper.querySelectorAll("[data-custom-select-option]").forEach(optionButton => {
    const isSelected = optionButton.dataset.value === select.value;
    optionButton.setAttribute("aria-selected", String(isSelected));
    optionButton.tabIndex = isSelected ? 0 : -1;
  });
}

function renderCustomSelect(wrapper) {
  const select = wrapper.querySelector("select");
  const listbox = wrapper.querySelector("[data-custom-select-listbox]");
  listbox.innerHTML = [...select.options].map(option => {
    const selected = option.value === select.value;
    return `<button type="button" class="custom-select-option" role="option" data-custom-select-option data-value="${escapeHtml(option.value)}" aria-selected="${selected}" ${option.disabled ? "disabled" : ""} tabindex="${selected ? 0 : -1}">${escapeHtml(option.textContent)}</button>`;
  }).join("");
}

function closeCustomSelects(exceptWrapper) {
  document.querySelectorAll("[data-custom-select]").forEach(wrapper => {
    if (wrapper === exceptWrapper) return;
    wrapper.querySelector("[data-custom-select-listbox]").hidden = true;
    wrapper.querySelector("[data-custom-select-trigger]").setAttribute("aria-expanded", "false");
    wrapper.classList.remove("custom-select-open");
    wrapper.removeAttribute("data-placement");
    wrapper.closest("form")?.classList.remove("custom-select-form-open");
  });
}

function openCustomSelect(wrapper) {
  const trigger = wrapper.querySelector("[data-custom-select-trigger]");
  const listbox = wrapper.querySelector("[data-custom-select-listbox]");
  closeCustomSelects(wrapper);
  renderCustomSelect(wrapper);
  listbox.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  wrapper.classList.add("custom-select-open");
  wrapper.closest("form")?.classList.add("custom-select-form-open");

  const wrapperRect = wrapper.getBoundingClientRect();
  const listHeight = listbox.getBoundingClientRect().height;
  const nav = document.querySelector("#app-shell nav[aria-label='Primary']");
  const navRect = nav.getBoundingClientRect();
  const spaceAbove = wrapperRect.top - (navRect.top <= 0 ? navRect.bottom : 0) - 16;
  const spaceBelow = window.innerHeight - wrapperRect.bottom - 16;
  wrapper.dataset.placement = listHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const firstEnabled = listbox.querySelector('[role="option"]:not(:disabled)');
  const selectedEnabled = listbox.querySelector('[aria-selected="true"]:not(:disabled)');
  (selectedEnabled || firstEnabled)?.focus();
}

function initializeCustomSelects() {
  document.querySelectorAll("[data-custom-select]").forEach(wrapper => {
    const select = wrapper.querySelector("select");
    const trigger = wrapper.querySelector("[data-custom-select-trigger]");
    const listbox = wrapper.querySelector("[data-custom-select-listbox]");
    listbox.id = `${select.id}-listbox`;
    trigger.setAttribute("aria-controls", listbox.id);
    select.addEventListener("change", () => syncCustomSelect(select));
    renderCustomSelect(wrapper);
    syncCustomSelect(select);
  });

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-custom-select-trigger]");
    if (trigger) {
      const wrapper = trigger.closest("[data-custom-select]");
      const listbox = wrapper.querySelector("[data-custom-select-listbox]");
      if (listbox.hidden) openCustomSelect(wrapper);
      else {
        closeCustomSelects();
        trigger.focus();
      }
      return;
    }

    const option = event.target.closest("[data-custom-select-option]");
    if (option) {
      if (option.disabled) return;
      const wrapper = option.closest("[data-custom-select]");
      const select = wrapper.querySelector("select");
      select.value = option.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelects();
      wrapper.querySelector("[data-custom-select-trigger]").focus();
      return;
    }

    if (!event.target.closest("[data-custom-select]")) closeCustomSelects();
  });

  document.addEventListener("keydown", event => {
    const option = event.target.closest("[data-custom-select-option]");
    const trigger = event.target.closest("[data-custom-select-trigger]");
    const wrapper = option?.closest("[data-custom-select]") || trigger?.closest("[data-custom-select]");
    if (!wrapper) return;
    const listbox = wrapper.querySelector("[data-custom-select-listbox]");
    const options = [...listbox.querySelectorAll('[role="option"]:not(:disabled)')];

    if (trigger && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (listbox.hidden) openCustomSelect(wrapper);
      else (options[0])?.focus();
      return;
    }
    if (event.key === "Escape" && !listbox.hidden) {
      event.preventDefault();
      closeCustomSelects();
      wrapper.querySelector("[data-custom-select-trigger]").focus();
      return;
    }
    if (!option) return;

    const index = options.indexOf(option);
    let nextIndex = index;
    if (event.key === "ArrowDown") nextIndex = Math.min(options.length - 1, index + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      option.click();
      return;
    } else {
      return;
    }
    event.preventDefault();
    options[nextIndex]?.focus();
  });
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleEl.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  themeToggleEl.setAttribute("title", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  themeToggleEl.setAttribute("aria-pressed", String(theme === "light"));
  themeToggleEl.querySelectorAll("[data-theme-icon]").forEach(icon => {
    icon.classList.toggle("hidden", icon.dataset.themeIcon !== theme);
  });
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#080809" : "#f2f5f3";
}

setTheme(initialTheme);

themeToggleEl.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  setTheme(nextTheme);
});

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function derivePinHash(pin, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure PIN verification is not available in this browser context.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: APP_PIN_ITERATIONS,
    hash: "SHA-256"
  }, key, 256);
  return new Uint8Array(bits);
}

function equalBytes(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function createRecoveryCredential() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(20));
  const normalizedCode = Array.from(randomBytes, byte => RECOVERY_CODE_ALPHABET[byte & 31]).join("");
  const recoveryCode = normalizedCode.match(/.{4}/g).join("-");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(normalizedCode, salt);
  return {
    recoveryCode,
    recoverySalt: bytesToBase64(salt),
    recoveryHash: bytesToBase64(hash)
  };
}

function presentRecoveryCode(code) {
  recoveryCodePending = code;
  recoveryCodeEl.textContent = code;
  return new Promise(resolve => {
    resolveRecoveryCode = resolve;
    try {
      recoveryDialog.showModal();
    } catch (error) {
      console.error("Could not display the recovery code.", error);
      recoveryCodePending = null;
      resolveRecoveryCode = null;
      resolve(false);
    }
  });
}

function finishRecoveryCode() {
  const resolve = resolveRecoveryCode;
  resolveRecoveryCode = null;
  recoveryCodePending = null;
  if (recoveryDialog.open) recoveryDialog.close();
  resolve?.(true);
}

function finishPinRequest(authenticated) {
  const resolve = resolvePinRequest;
  resolvePinRequest = null;
  pinRequestPromise = null;
  pinRequestMode = null;
  pinVerificationPending = false;
  pinSubmitButton.disabled = false;
  pinCancelButton.disabled = false;
  if (pinDialog.open) pinDialog.close();
  resolve?.(authenticated);
}

function configurePinPrompt(mode) {
  pinRequestMode = mode;
  const isSetup = mode === "setup" || mode === "resetSetup";
  const isRecovery = mode === "recovery";
  pinTitle.textContent = isSetup
    ? mode === "setup" ? "Create an app PIN" : "Choose a new app PIN"
    : isRecovery ? "Reset your app PIN" : "Verify your app PIN";
  pinDescription.textContent = isSetup
    ? "Set a 4–12 digit PIN. You’ll enter it before adding or deleting expenses."
    : isRecovery
      ? "Enter the recovery code you saved to choose a new app PIN."
      : mode === "change"
        ? "Enter your current PIN to choose a new one."
        : "Enter your app PIN to continue with this expense action.";
  pinLabel.textContent = isSetup ? "New PIN" : isRecovery ? "Recovery code" : "PIN";
  pinInput.type = isRecovery ? "text" : "password";
  pinInput.inputMode = isRecovery ? "text" : "numeric";
  pinInput.autocomplete = isSetup ? "new-password" : isRecovery ? "off" : "current-password";
  pinInput.autocapitalize = isRecovery ? "characters" : "off";
  pinInput.minLength = 0;
  pinInput.maxLength = isRecovery ? 24 : 12;
  pinInput.minLength = isRecovery ? 20 : 4;
  if (isRecovery) pinInput.pattern = "[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){4}";
  else pinInput.pattern = "[0-9]{4,12}";
  pinConfirmWrap.classList.toggle("hidden", !isSetup);
  pinConfirmInput.required = isSetup;
  pinForgotButton.classList.toggle("hidden", !(mode === "verify" || mode === "change"));
  pinCancelButton.classList.toggle("hidden", mode === "setup");
  pinSubmitButton.textContent = isSetup ? "Save PIN" : isRecovery ? "Continue" : "Verify PIN";
  pinSubmitButton.disabled = false;
  pinCancelButton.disabled = false;
  pinVerificationPending = false;
  pinInput.value = "";
  pinConfirmInput.value = "";
  pinError.textContent = "";
  pinError.classList.add("hidden");
}

function requestAppPin(mode) {
  if (pinRequestPromise) return pinRequestPromise;

  const savedPin = localStorage.getItem(APP_PIN_STORAGE_KEY);
  const initialMode = mode === "setup" || !savedPin ? "setup" : mode;
  configurePinPrompt(initialMode);

  pinRequestPromise = new Promise(resolve => {
    resolvePinRequest = resolve;
  });
  const request = pinRequestPromise;
  try {
    pinDialog.showModal();
    pinInput.focus();
  } catch (error) {
    console.error("Could not open the app PIN prompt.", error);
    finishPinRequest(false);
    showToast("Could not open PIN verification. No expense was changed.");
  }
  return request;
}

pinForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (pinVerificationPending) return;
  pinVerificationPending = true;
  pinSubmitButton.disabled = true;
  pinCancelButton.disabled = true;
  const pin = pinInput.value;
  const isSetup = pinRequestMode === "setup";
  const isSettingUp = isSetup || pinRequestMode === "resetSetup";
  if (isSettingUp && pin !== pinConfirmInput.value) {
    pinVerificationPending = false;
    pinSubmitButton.disabled = false;
    pinCancelButton.disabled = false;
    pinError.textContent = "The PINs do not match.";
    pinError.classList.remove("hidden");
    pinConfirmInput.focus();
    return;
  }

  try {
    if (isSettingUp) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derivePinHash(pin, salt);
      const recovery = await createRecoveryCredential();
      localStorage.setItem(APP_PIN_STORAGE_KEY, JSON.stringify({
        salt: bytesToBase64(salt),
        hash: bytesToBase64(hash),
        iterations: APP_PIN_ITERATIONS,
        recoverySalt: recovery.recoverySalt,
        recoveryHash: recovery.recoveryHash
      }));
      pinDialog.close();
      await presentRecoveryCode(recovery.recoveryCode);
      finishPinRequest(true);
      return;
    }

    const stored = JSON.parse(localStorage.getItem(APP_PIN_STORAGE_KEY));
    if (!stored || stored.iterations !== APP_PIN_ITERATIONS) {
      throw new Error("The saved app PIN data is missing or invalid.");
    }
    const isRecovery = pinRequestMode === "recovery";
    const saltValue = isRecovery ? stored.recoverySalt : stored.salt;
    const hashValue = isRecovery ? stored.recoveryHash : stored.hash;
    if (typeof saltValue !== "string" || typeof hashValue !== "string") {
      throw new Error("The saved app verification data is missing or invalid.");
    }
    const normalizedValue = isRecovery ? pin.toUpperCase().replace(/-/g, "") : pin;
    const actualHash = await derivePinHash(normalizedValue, base64ToBytes(saltValue));
    const expectedHash = base64ToBytes(hashValue);
    if (!equalBytes(actualHash, expectedHash)) {
      pinError.textContent = isRecovery
        ? "That recovery code is incorrect. Try again."
        : "That PIN is incorrect. Try again.";
      pinError.classList.remove("hidden");
      pinInput.value = "";
      pinInput.focus();
      pinVerificationPending = false;
      pinSubmitButton.disabled = false;
      pinCancelButton.disabled = false;
      return;
    }
    if (pinRequestMode === "recovery" || pinRequestMode === "change") {
      configurePinPrompt("resetSetup");
      return;
    }
    finishPinRequest(true);
  } catch (error) {
    console.error("App PIN verification failed.", error);
    pinError.textContent = "PIN verification failed. This action was not completed.";
    pinError.classList.remove("hidden");
    pinVerificationPending = false;
    pinSubmitButton.disabled = false;
    pinCancelButton.disabled = false;
  }
});

pinCancelButton.addEventListener("click", () => finishPinRequest(false));
pinForgotButton.addEventListener("click", () => configurePinPrompt("recovery"));
pinDialog.addEventListener("cancel", event => {
  event.preventDefault();
  if (!pinVerificationPending && pinRequestMode !== "setup") finishPinRequest(false);
});

recoverySavedButton.addEventListener("click", finishRecoveryCode);
copyRecoveryCodeButton.addEventListener("click", async () => {
  if (!recoveryCodePending) return;
  try {
    await navigator.clipboard.writeText(recoveryCodePending);
    showToast("Recovery code copied.");
  } catch (error) {
    console.error("Could not copy the recovery code.", error);
    showToast("Copy failed. Select the code and copy it manually.");
  }
});
recoveryDialog.addEventListener("cancel", event => event.preventDefault());
changePinButton.addEventListener("click", () => requestAppPin("change"));

async function addRecoveryCodeIfMissing() {
  try {
    const stored = JSON.parse(localStorage.getItem(APP_PIN_STORAGE_KEY));
    if (!stored) return;
    if (stored.recoverySalt && stored.recoveryHash) return;
    if (stored.iterations !== APP_PIN_ITERATIONS ||
        typeof stored.salt !== "string" || typeof stored.hash !== "string") {
      throw new Error("The saved app PIN data is missing or invalid.");
    }
    const recovery = await createRecoveryCredential();
    stored.recoverySalt = recovery.recoverySalt;
    stored.recoveryHash = recovery.recoveryHash;
    localStorage.setItem(APP_PIN_STORAGE_KEY, JSON.stringify(stored));
    await presentRecoveryCode(recovery.recoveryCode);
  } catch (error) {
    console.error("Could not create an app PIN recovery code.", error);
    showToast("Could not create a recovery code. Try reloading the app.");
  }
}

// --- INITIALIZATION ---
function init() {
  dateInput.value = todayStr;
  document.getElementById("planned-date").value = todayStr;
  plannedCategoryEl.innerHTML = DEFAULT_CATEGORIES.map(category =>
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  ).join("");
  initializeCustomSelects();
  initializeDatePickers();
  buildCategoryLimitInputs();
  renderPlannedExpenses();
  renderSavingsGoals();
  renderSharedExpenses();
  updateNotificationStatus();
  history.replaceState({ ...(history.state || {}), hostelSpendView: "dashboard" }, "", location.href);
  showView("dashboard");
  if (!localStorage.getItem(APP_PIN_STORAGE_KEY)) {
    requestAppPin("setup");
  } else {
    addRecoveryCodeIfMissing();
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(err => console.error(err));
  }
}

// --- NAVIGATION ---
function showView(targetView) {
  if (!VALID_VIEWS.has(targetView)) return;
  currentView = targetView;

  navBtns.forEach(btn => {
    const active = btn.dataset.nav === targetView;
    btn.classList.toggle("text-teal-300", active);
    btn.classList.toggle("text-zinc-400", !active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  views.forEach(view => view.classList.toggle("hidden", view.dataset.view !== targetView));

  if (targetView === "dashboard") {
    appHeading.textContent = "Dashboard";
    updateDashboard();
  } else if (targetView === "add") {
    appHeading.textContent = "Add Expense";
  } else {
    appHeading.textContent = "Limits & Budget";
    document.getElementById("monthly-budget").value = baseMonthlyBudget || "";
  }
}

navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetView = btn.dataset.nav;
    if (!VALID_VIEWS.has(targetView) || targetView === currentView) return;
    history.pushState({ ...(history.state || {}), hostelSpendView: targetView }, "", location.href);
    showView(targetView);
  });
});

window.addEventListener("popstate", event => {
  const targetView = VALID_VIEWS.has(event.state?.hostelSpendView)
    ? event.state.hostelSpendView
    : "dashboard";
  showView(targetView);
});

// --- CORE LOGIC & UI UPDATES ---
function updateDashboard() {
  const now = new Date();
  monthLabel.textContent = "30-day cycle";

  // Expense dates are stored as YYYY-MM-DD, so compare them with the cycle's UTC dates.
  const cycleStartDay = budgetStartDate.toISOString().split('T')[0];
  const cycleEndDay = new Date(budgetStartDate.getTime() + BUDGET_CYCLE_IN_MS).toISOString().split('T')[0];
  const cycleExpenses = expenses.filter(exp => exp.date >= cycleStartDay && exp.date < cycleEndDay);
  const totalSpent = cycleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const upcomingPlans = plannedExpenses.filter(plan => plan.dueDate < cycleEndDay);
  const reservedTotal = upcomingPlans.reduce((sum, plan) => sum + plan.amount, 0);
  const spendableTotal = effectiveBudget - totalSpent - reservedTotal;

  spentTotalEl.innerHTML = `&#8377;${totalSpent.toFixed(2)}`;
  budgetTotalEl.innerHTML = `&#8377;${effectiveBudget.toFixed(2)}`;
  
  if (effectiveBudget > 0) {
    const remaining = effectiveBudget - totalSpent;
    budgetRemainingEl.innerHTML = `&#8377;${Math.max(0, remaining).toFixed(2)} left`;
    
    let percentage = (totalSpent / effectiveBudget) * 100;
    if (percentage > 100) percentage = 100;
    budgetProgressEl.style.width = `${percentage}%`;
    
    if (percentage > 90) budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-rose-500";
    else if (percentage > 75) budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-orange-400";
    else budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-teal-400";
  }

  // --- CUMULATIVE DAILY MATH ---
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - budgetStartDate.getTime()) / DAY_IN_MS));
  const daysPassed = Math.min(BUDGET_CYCLE_DAYS, elapsedDays + 1);
  const daysLeft = Math.max(0, BUDGET_CYCLE_DAYS - elapsedDays);
  const totalDaysInCycle = BUDGET_CYCLE_DAYS;

  daysLeftEl.innerHTML = `${daysLeft} days left`;
  upcomingTotalEl.textContent = `₹${reservedTotal.toFixed(2)}`;
  spendableTotalEl.textContent = `After planned costs: ₹${Math.max(0, spendableTotal).toFixed(2)} available`;

  const currentWeekIndex = Math.max(0, Math.min(4, Math.floor(elapsedDays / 7)));
  const weekStart = new Date(budgetStartDate.getTime() + currentWeekIndex * 7 * DAY_IN_MS);
  const weekEnd = new Date(Math.min(
    budgetStartDate.getTime() + BUDGET_CYCLE_IN_MS,
    weekStart.getTime() + 7 * DAY_IN_MS
  ));
  const weekStartDay = weekStart.toISOString().split("T")[0];
  const weekEndDay = weekEnd.toISOString().split("T")[0];
  const weekSpent = expenses
    .filter(exp => exp.date >= weekStartDay && exp.date < weekEndDay && exp.date <= todayStr)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const weekDuration = (weekEnd.getTime() - weekStart.getTime()) / DAY_IN_MS;
  const weekTarget = effectiveBudget * weekDuration / BUDGET_CYCLE_DAYS;
  weeklySpentEl.textContent = `₹${weekSpent.toFixed(2)} spent`;
  weeklyTargetEl.textContent = `Target ₹${weekTarget.toFixed(2)}`;
  weeklyProgressEl.style.width = `${Math.min(100, weekTarget > 0 ? weekSpent / weekTarget * 100 : 0)}%`;

  if (baseMonthlyBudget === 0) {
    dailyAllowableEl.innerHTML = "&#8377;0";
    dailyStatusEl.textContent = "Set a budget first";
    dailyStatusEl.className = "rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300";
  } else {
    const remainingTotal = spendableTotal;
    if (remainingTotal <= 0) {
      dailyAllowableEl.innerHTML = "&#8377;0";
      dailyStatusEl.textContent = "Budget Exceeded";
      dailyStatusEl.className = "rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300";
    } else {
      // The cumulative formula: (Base daily limit * Days passed) - Total spent so far
      const baseDailyLimit = effectiveBudget / totalDaysInCycle;
      const allowableCumulative = baseDailyLimit * daysPassed;
      const todayLimit = allowableCumulative - totalSpent - reservedTotal;
      
      if (todayLimit < 0) {
          dailyAllowableEl.innerHTML = "&#8377;0";
          dailyStatusEl.textContent = "Over Daily Pacing";
          dailyStatusEl.className = "rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-400";
      } else {
          dailyAllowableEl.innerHTML = `&#8377;${Math.floor(todayLimit)}`;
          dailyStatusEl.textContent = "On Track";
          dailyStatusEl.className = "rounded-full bg-teal-400/15 px-2.5 py-1 text-xs font-semibold text-teal-200";
      }
    }
  }

  renderRecentExpenses(cycleExpenses);
  renderCategoryLimits(cycleExpenses);
  renderExpenseHistory(cycleStartDay);
  renderSpendingReport(cycleExpenses, cycleStartDay);
  updateBudgetAlert(totalSpent, reservedTotal, elapsedDays, cycleStartDay);
}

function renderRecentExpenses(cycleExpenses) {
  renderExpenseItems(expenseListEl, cycleExpenses, "No expenses yet.", 10);
}

function renderExpenseItems(listEl, listExpenses, emptyMessage, limit = Infinity) {
  if (listExpenses.length === 0) {
    listEl.innerHTML = `<li class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-8 text-center text-sm text-zinc-500">${emptyMessage}</li>`;
    return;
  }

  const sorted = [...listExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  listEl.innerHTML = sorted.map(exp => `
    <li class="flex items-center justify-between rounded-2xl border border-white/5 bg-ink-900/50 p-4">
      <div>
        <p class="text-sm font-medium text-zinc-200">${escapeHtml(exp.category)}</p>
        <p class="mt-0.5 text-xs text-zinc-500">${escapeHtml(exp.date)} ${exp.note ? '&bull; ' + escapeHtml(exp.note) : ''}</p>
        <span class="mt-1 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">${expenseKindLabel(exp.kind)}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-semibold text-white">&#8377;${exp.amount.toFixed(2)}</span>
        <button data-delete-id="${escapeHtml(exp.id)}" class="rounded-lg bg-rose-500/10 p-2 text-rose-400 transition hover:bg-rose-500/20 active:scale-95" aria-label="Delete expense">
          <svg class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </li>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expenseKindLabel(kind) {
  if (kind === "need") return "Need";
  if (kind === "want") return "Want";
  if (kind === "savings") return "Savings";
  return "Unclassified";
}

function renderExpenseHistory(cycleStartDay) {
  const previousExpenses = expenses.filter(exp => exp.date < cycleStartDay);
  const months = [...new Set(previousExpenses.map(exp => exp.date.slice(0, 7)))].sort().reverse();
  const selectedMonth = months.includes(historyMonthEl.value) ? historyMonthEl.value : months[0];

  historyMonthEl.innerHTML = months.map(month => {
    const [year, monthNumber] = month.split("-").map(Number);
    const label = new Date(year, monthNumber - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
    return `<option value="${month}">${label}</option>`;
  }).join("");

  if (!selectedMonth) {
    historyMonthEl.disabled = true;
    historyTotalEl.textContent = "";
    renderExpenseItems(historyListEl, [], "No previous expenses yet.");
    return;
  }

  historyMonthEl.disabled = false;
  historyMonthEl.value = selectedMonth;
  const monthExpenses = previousExpenses.filter(exp => exp.date.startsWith(selectedMonth));
  const monthTotal = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  historyTotalEl.textContent = `${monthExpenses.length} expense${monthExpenses.length === 1 ? "" : "s"} · ₹${monthTotal.toFixed(2)} total`;
  renderExpenseItems(historyListEl, monthExpenses, "No expenses for this month.");
}

function renderSpendingReport(cycleExpenses, cycleStartDay) {
  const previousStart = new Date(budgetStartDate.getTime() - BUDGET_CYCLE_IN_MS).toISOString().split("T")[0];
  const previousSpent = expenses
    .filter(exp => exp.date >= previousStart && exp.date < cycleStartDay)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const currentSpent = cycleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const difference = currentSpent - previousSpent;
  const comparison = difference === 0
    ? "Spending matches the previous cycle."
    : `Spending is ₹${Math.abs(difference).toFixed(2)} ${difference > 0 ? "higher" : "lower"} than the previous cycle.`;
  cycleComparisonEl.textContent = previousSpent === 0 && currentSpent === 0
    ? "Add expenses to compare with the previous cycle."
    : comparison;

  const totalsByKind = { need: 0, want: 0 };
  const totalsByCategory = {};
  cycleExpenses.forEach(exp => {
    if (exp.kind === "need" || exp.kind === "want") totalsByKind[exp.kind] += exp.amount;
    totalsByCategory[exp.category] = (totalsByCategory[exp.category] || 0) + exp.amount;
  });
  needsTotalEl.textContent = `₹${totalsByKind.need.toFixed(2)}`;
  wantsTotalEl.textContent = `₹${totalsByKind.want.toFixed(2)}`;
  reportCategoryListEl.innerHTML = Object.entries(totalsByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => `
      <li class="flex items-center justify-between rounded-xl bg-ink-800/40 px-3 py-2 text-sm">
        <span class="text-zinc-300">${escapeHtml(category)}</span>
        <span class="font-medium text-white">₹${total.toFixed(2)}</span>
      </li>
    `).join("") || `<li class="report-empty-state text-sm text-zinc-500">No spending recorded this cycle.</li>`;
}

function updateBudgetAlert(totalSpent, reservedTotal, elapsedDays, cycleStartDay) {
  if (effectiveBudget <= 0) {
    budgetAlertEl.classList.add("hidden");
    return;
  }

  const plannedRemaining = effectiveBudget - totalSpent - reservedTotal;
  const spendPace = (totalSpent + reservedTotal) / effectiveBudget;
  const expectedPace = Math.min(1, (elapsedDays + 1) / BUDGET_CYCLE_DAYS);
  let message = "";
  let alertKind = "";
  if (plannedRemaining <= 0) {
    message = "Your budget is fully spent or reserved. Review your planned costs before spending more.";
    alertKind = "empty";
  } else if (spendPace >= 0.8) {
    message = `Only ₹${plannedRemaining.toFixed(2)} remains after planned costs.`;
    alertKind = "low";
  } else if (spendPace > expectedPace + 0.1) {
    message = "Spending is ahead of pace. Consider slowing down to stay within your budget.";
    alertKind = "pace";
  }

  budgetAlertEl.textContent = message;
  budgetAlertEl.classList.toggle("hidden", !message);
  if (!message || typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const alertKey = `hostelSpend_alert_${cycleStartDay}_${alertKind}`;
  if (localStorage.getItem(alertKey)) return;
  localStorage.setItem(alertKey, "sent");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then(registration => registration.showNotification("HostelSpend budget alert", { body: message, tag: alertKey }))
      .catch(error => console.error("Could not show budget notification:", error));
  } else {
    new Notification("HostelSpend budget alert", { body: message, tag: alertKey });
  }
}

function updateNotificationStatus() {
  if (typeof Notification === "undefined") {
    notificationStatusEl.textContent = "In-app warnings are always on. Device notifications are not supported by this browser.";
    notificationEnableEl.disabled = true;
    return;
  }

  const status = Notification.permission;
  notificationStatusEl.textContent = status === "granted"
    ? "Device notifications are enabled and checked while the app is open. In-app warnings are always on."
    : status === "denied"
      ? "Notifications are blocked in browser settings. In-app warnings are always on."
      : "In-app warnings are always on. Device notifications are checked while the app is open.";
  notificationEnableEl.textContent = status === "granted" ? "Device notifications enabled" : "Enable device notifications";
  notificationEnableEl.disabled = status === "granted" || status === "denied";
}

function exportFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function exportExpensesCsv() {
  const columns = ["date", "amount", "category", "type", "note", "savingsGoal"];
  const rows = expenses.map(exp => [
    exp.date,
    exp.amount,
    exp.category,
    expenseKindLabel(exp.kind),
    exp.note || "",
    exp.goalId ? savingsGoals.find(goal => goal.id === exp.goalId)?.title || "" : ""
  ]);
  const csv = [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  exportFile("hostelspend-expenses.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function exportLocalBackup() {
  const data = Object.fromEntries(
    Object.keys(localStorage)
      .filter(key => key.startsWith("hostelSpend_"))
      .sort()
      .map(key => [key, localStorage.getItem(key)])
  );
  const backup = {
    format: "HostelSpend backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data
  };
  exportFile("hostelspend-backup.json", JSON.stringify(backup, null, 2), "application/json");
}

function mergeLocalBackup(backup) {
  if (!backup || backup.format !== "HostelSpend backup" || !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
    throw new Error("This is not a valid HostelSpend JSON backup.");
  }

  const collectionKeys = new Set([
    "hostelSpend_expenses",
    "hostelSpend_plannedExpenses",
    "hostelSpend_savingsGoals",
    "hostelSpend_sharedExpenses"
  ]);
  for (const [key, importedValue] of Object.entries(backup.data)) {
    if (!key.startsWith("hostelSpend_") || typeof importedValue !== "string") continue;
    if (collectionKeys.has(key)) {
      const importedItems = JSON.parse(importedValue);
      if (!Array.isArray(importedItems) || importedItems.some(item => !item || typeof item !== "object" || typeof item.id !== "string")) {
        throw new Error(`Invalid records in ${key}.`);
      }
      if (key === "hostelSpend_expenses" && importedItems.some(item =>
        !Number.isFinite(item.amount) || item.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || typeof item.category !== "string"
      )) {
        throw new Error("Backup contains invalid expense records.");
      }
      if (key === "hostelSpend_plannedExpenses" && importedItems.some(item =>
        !Number.isFinite(item.amount) || item.amount <= 0 || typeof item.title !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) || !DEFAULT_CATEGORIES.includes(item.category) ||
        !["none", "weekly", "monthly"].includes(item.frequency)
      )) {
        throw new Error("Backup contains invalid planned expenses.");
      }
      if (key === "hostelSpend_savingsGoals" && importedItems.some(item =>
        !Number.isFinite(item.target) || item.target <= 0 || typeof item.title !== "string"
      )) {
        throw new Error("Backup contains invalid savings goals.");
      }
      if (key === "hostelSpend_sharedExpenses" && importedItems.some(item =>
        !Number.isFinite(item.amount) || item.amount <= 0 || typeof item.title !== "string" ||
        typeof item.payer !== "string" || !Array.isArray(item.participants) || item.participants.length < 2 ||
        item.participants.some(name => typeof name !== "string" || !name.trim())
      )) {
        throw new Error("Backup contains invalid shared expense records.");
      }
      const currentItems = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(currentItems)) throw new Error(`Existing ${key} data is invalid.`);
      const mergedItems = new Map(currentItems.map(item => [item.id, item]));
      importedItems.forEach(item => {
        if (!mergedItems.has(item.id)) mergedItems.set(item.id, item);
      });
      localStorage.setItem(key, JSON.stringify([...mergedItems.values()]));
    } else if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, importedValue);
    }
  }
}

function addRecurringInterval(dateString, frequency) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  return date.toISOString().split("T")[0];
}

function renderPlannedExpenses() {
  const sortedPlans = [...plannedExpenses].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  plannedListEl.innerHTML = sortedPlans.map(plan => `
    <li class="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-ink-900/50 p-4">
      <div>
        <p class="text-sm font-medium text-zinc-200">${escapeHtml(plan.title)}</p>
        <p class="mt-1 text-xs text-zinc-500">${escapeHtml(plan.category)} · Due ${escapeHtml(plan.dueDate)} · ${plan.frequency === "none" ? "Once" : `Repeats ${escapeHtml(plan.frequency)}`}</p>
        <p class="mt-1 font-semibold text-white">₹${plan.amount.toFixed(2)}</p>
      </div>
      <div class="flex shrink-0 flex-col gap-2">
        <button type="button" data-plan-paid="${escapeHtml(plan.id)}" class="rounded-lg bg-teal-400/15 px-3 py-2 text-xs font-semibold text-teal-200">Mark paid</button>
        <button type="button" data-plan-delete="${escapeHtml(plan.id)}" class="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">Remove</button>
      </div>
    </li>
  `).join("") || `<li class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-6 text-center text-sm text-zinc-500">No planned costs yet.</li>`;
}

function renderSavingsGoals() {
  goalListEl.innerHTML = savingsGoals.map(goal => {
    const saved = expenses.filter(exp => exp.goalId === goal.id).reduce((sum, exp) => sum + exp.amount, 0);
    const progress = Math.min(100, goal.target > 0 ? saved / goal.target * 100 : 0);
    return `
      <li class="rounded-2xl border border-white/5 bg-ink-900/50 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-medium text-zinc-200">${escapeHtml(goal.title)}</p>
            <p class="mt-1 text-xs text-zinc-500">₹${saved.toFixed(2)} saved of ₹${goal.target.toFixed(2)}</p>
          </div>
          <button type="button" data-goal-delete="${escapeHtml(goal.id)}" class="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300">Remove</button>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div class="h-full rounded-full bg-teal-400" style="width:${progress}%"></div>
        </div>
        <div class="mt-3 flex gap-2">
          <input type="number" min="0.01" step="0.01" inputmode="decimal" data-goal-amount="${escapeHtml(goal.id)}" placeholder="Add savings" aria-label="Amount to add to ${escapeHtml(goal.title)}" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white" />
          <button type="button" data-goal-contribute="${escapeHtml(goal.id)}" class="rounded-xl bg-teal-400/15 px-3 py-2 text-xs font-semibold text-teal-200">Add</button>
        </div>
      </li>
    `;
  }).join("") || `<p class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-6 text-center text-sm text-zinc-500">No savings goals yet.</p>`;
}

function renderSharedExpenses() {
  const paidByPerson = new Map();
  const shareByPerson = new Map();
  sharedExpenses.forEach(item => {
    const share = item.amount / item.participants.length;
    item.participants.forEach(name => {
      shareByPerson.set(name, (shareByPerson.get(name) || 0) + share);
    });
    paidByPerson.set(item.payer, (paidByPerson.get(item.payer) || 0) + item.amount);
  });

  const people = new Set([...paidByPerson.keys(), ...shareByPerson.keys()]);
  const balances = [...people].map(name => ({
    name,
    balance: (paidByPerson.get(name) || 0) - (shareByPerson.get(name) || 0)
  }));
  const debtors = balances.filter(item => item.balance < -0.01).map(item => ({ name: item.name, amount: -item.balance }));
  const creditors = balances.filter(item => item.balance > 0.01).map(item => ({ name: item.name, amount: item.balance }));
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
    settlements.push(`${escapeHtml(debtors[debtorIndex].name)} owes ${escapeHtml(creditors[creditorIndex].name)} ₹${amount.toFixed(2)}`);
    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;
    if (debtors[debtorIndex].amount < 0.01) debtorIndex++;
    if (creditors[creditorIndex].amount < 0.01) creditorIndex++;
  }
  sharedBalancesEl.textContent = settlements.length ? `Suggested settlement: ${settlements.join("; ")}` : "Everyone is settled up.";
  sharedListEl.innerHTML = [...sharedExpenses].reverse().map(item => `
    <li class="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-ink-900/50 p-3">
      <div>
        <p class="text-sm font-medium text-zinc-200">${escapeHtml(item.title)}</p>
        <p class="mt-1 text-xs text-zinc-500">Paid by ${escapeHtml(item.payer)} · Split between ${item.participants.length}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-semibold text-white">₹${item.amount.toFixed(2)}</span>
        <button type="button" data-shared-delete="${escapeHtml(item.id)}" aria-label="Remove shared expense" class="rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs font-semibold text-rose-300">Remove</button>
      </div>
    </li>
  `).join("") || `<p class="text-sm text-zinc-500">No shared expenses yet.</p>`;
}

function renderCategoryLimits(cycleExpenses) {
  const categoryTotals = {};
  DEFAULT_CATEGORIES.forEach(c => categoryTotals[c] = 0);
  
  cycleExpenses.forEach(exp => {
    if (categoryTotals[exp.category] !== undefined) {
      categoryTotals[exp.category] += exp.amount;
    }
  });

  categoryListEl.innerHTML = DEFAULT_CATEGORIES.map(cat => {
    const spent = categoryTotals[cat];
    const limit = categoryLimits[cat];
    if (!limit && spent === 0) return '';
    
    let progressHtml = '';
    if (limit) {
      let pct = (spent / limit) * 100;
      if (pct > 100) pct = 100;
      const colorClass = pct > 90 ? 'bg-rose-500' : 'bg-teal-400';
      progressHtml = `
        <div class="mt-2.5 flex items-center justify-between text-xs">
          <span class="text-zinc-500">&#8377;${spent.toFixed(0)} / &#8377;${limit}</span>
          <span class="${pct > 90 ? 'text-rose-400' : 'text-zinc-400'}">${Math.floor(pct)}%</span>
        </div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div class="h-full w-0 rounded-full ${colorClass} transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      `;
    } else {
      progressHtml = `<div class="mt-1 text-xs text-zinc-500">&#8377;${spent.toFixed(0)} spent (No limit)</div>`;
    }

    return `
      <div class="rounded-2xl border border-white/5 bg-ink-900/50 p-4">
        <p class="text-sm font-medium text-zinc-200">${cat}</p>
        ${progressHtml}
      </div>
    `;
  }).join('');
  
  if (categoryListEl.innerHTML.trim() === '') {
    categoryListEl.innerHTML = `<p class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-8 text-center text-sm text-zinc-500">Add an expense or set limits to see breakdowns.</p>`;
  }
}

function buildCategoryLimitInputs() {
  categoryLimitsContainer.innerHTML = DEFAULT_CATEGORIES.map(cat => `
    <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-ink-800/50 p-3">
      <label class="text-sm font-medium text-zinc-300 w-1/2 truncate">${cat}</label>
      <input 
        type="number" 
        data-limit-category="${cat}"
        value="${categoryLimits[cat] || ''}"
        placeholder="No limit"
        class="w-1/2 rounded-xl bg-ink-900 px-3 py-2 text-sm text-white outline-none ring-teal-400/40 focus:ring"
      />
    </div>
  `).join('');
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

// --- EVENT LISTENERS ---
expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (expenseMutationPending) return;

  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const date = document.getElementById("date").value;
  const kind = document.getElementById("expense-kind").value;
  const note = document.getElementById("note").value.trim();

  if (!Number.isFinite(amount) || amount <= 0 || !category || !date) return;

  expenseMutationPending = true;
  try {
    if (!(await requestAppPin("verify"))) return;

    expenses.push({
      id: createId(),
      amount,
      category,
      date,
      kind,
      note
    });
    localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));

    showToast("Expense added successfully!");

    document.getElementById("amount").value = "";
    document.getElementById("category").value = "";
    document.getElementById("expense-kind").value = "need";
    syncCustomSelect(document.getElementById("category"));
    syncCustomSelect(document.getElementById("expense-kind"));
    document.getElementById("note").value = "";

    updateDashboard();
  } finally {
    expenseMutationPending = false;
  }
});

plannedForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const formData = new FormData(plannedForm);
  const amount = Number(formData.get("amount"));
  const title = String(formData.get("title")).trim();
  const dueDate = String(formData.get("dueDate"));
  const category = String(formData.get("category"));
  const frequency = String(formData.get("frequency"));
  if (!Number.isFinite(amount) || amount <= 0 || !title || !dueDate || !DEFAULT_CATEGORIES.includes(category)) {
    showToast("Enter a name, valid amount, date, and category.");
    return;
  }

  plannedExpenses.push({ id: createId(), title, amount, dueDate, category, frequency });
  localStorage.setItem("hostelSpend_plannedExpenses", JSON.stringify(plannedExpenses));
  plannedForm.reset();
  setDatePickerValue(document.getElementById("planned-date"), todayStr);
  plannedCategoryEl.value = DEFAULT_CATEGORIES[0];
  syncCustomSelect(plannedCategoryEl);
  syncCustomSelect(document.getElementById("planned-frequency"));
  renderPlannedExpenses();
  updateDashboard();
  showToast("Planned expense added.");
});

plannedListEl.addEventListener("click", (e) => {
  const paidButton = e.target.closest("button[data-plan-paid]");
  const deleteButton = e.target.closest("button[data-plan-delete]");
  const planId = paidButton?.dataset.planPaid || deleteButton?.dataset.planDelete;
  if (!planId) return;

  const plan = plannedExpenses.find(item => item.id === planId);
  if (!plan) return;
  if (deleteButton) {
    plannedExpenses = plannedExpenses.filter(item => item.id !== planId);
    localStorage.setItem("hostelSpend_plannedExpenses", JSON.stringify(plannedExpenses));
    showToast("Planned expense removed.");
  } else {
    expenses.push({
      id: createId(),
      amount: plan.amount,
      category: plan.category,
      date: todayStr,
      kind: "need",
      note: `Planned: ${plan.title}`
    });
    if (plan.frequency === "none") {
      plannedExpenses = plannedExpenses.filter(item => item.id !== planId);
    } else {
      const intervalStart = plan.dueDate < todayStr ? todayStr : plan.dueDate;
      plan.dueDate = addRecurringInterval(intervalStart, plan.frequency);
    }
    localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));
    localStorage.setItem("hostelSpend_plannedExpenses", JSON.stringify(plannedExpenses));
    showToast(plan.frequency === "none" ? "Expense marked paid." : "Expense recorded and next due date scheduled.");
  }
  renderPlannedExpenses();
  updateDashboard();
});

goalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("goal-title").value.trim();
  const target = Number(document.getElementById("goal-target").value);
  if (!title || !Number.isFinite(target) || target <= 0) {
    showToast("Enter a goal name and a valid target amount.");
    return;
  }
  savingsGoals.push({ id: createId(), title, target });
  localStorage.setItem("hostelSpend_savingsGoals", JSON.stringify(savingsGoals));
  goalForm.reset();
  renderSavingsGoals();
  showToast("Savings goal added.");
});

goalListEl.addEventListener("click", (e) => {
  const deleteButton = e.target.closest("button[data-goal-delete]");
  if (deleteButton) {
    const goalId = deleteButton.dataset.goalDelete;
    if (confirm("Remove this goal? Contributions already recorded remain in your expense history.")) {
      savingsGoals = savingsGoals.filter(goal => goal.id !== goalId);
      localStorage.setItem("hostelSpend_savingsGoals", JSON.stringify(savingsGoals));
      renderSavingsGoals();
      showToast("Savings goal removed.");
    }
    return;
  }

  const contributeButton = e.target.closest("button[data-goal-contribute]");
  if (!contributeButton) return;
  const goalId = contributeButton.dataset.goalContribute;
  const goal = savingsGoals.find(item => item.id === goalId);
  const amountInput = [...goalListEl.querySelectorAll("[data-goal-amount]")]
    .find(input => input.dataset.goalAmount === goalId);
  const amount = Number(amountInput.value);
  if (!goal || !Number.isFinite(amount) || amount <= 0) {
    showToast("Enter a valid savings contribution.");
    return;
  }
  expenses.push({
    id: createId(),
    amount,
    category: "Savings",
    date: todayStr,
    kind: "savings",
    note: `Savings goal: ${goal.title}`,
    goalId
  });
  localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));
  renderSavingsGoals();
  updateDashboard();
  showToast("Savings contribution recorded.");
});

sharedForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const formData = new FormData(sharedForm);
  const title = String(formData.get("title")).trim();
  const amount = Number(formData.get("amount"));
  const payer = String(formData.get("payer")).trim();
  const participantsByNormalizedName = new Map();
  String(formData.get("people"))
    .split(",")
    .map(name => name.trim())
    .filter(Boolean)
    .forEach(name => participantsByNormalizedName.set(name.toLocaleLowerCase(), name));
  const participants = [...participantsByNormalizedName.values()];
  if (!title || !Number.isFinite(amount) || amount <= 0 || !payer) {
    showToast("Enter an expense name, valid amount, and payer.");
    return;
  }
  const payerInGroup = participants.find(name => name.toLocaleLowerCase() === payer.toLocaleLowerCase());
  if (!payerInGroup) {
    participants.push(payer);
  }
  if (participants.length < 2) {
    showToast("Add at least two people to split an expense.");
    return;
  }
  sharedExpenses.push({ id: createId(), title, amount, payer: payerInGroup || payer, participants, date: todayStr });
  localStorage.setItem("hostelSpend_sharedExpenses", JSON.stringify(sharedExpenses));
  sharedForm.reset();
  renderSharedExpenses();
  showToast("Shared expense added.");
});

sharedListEl.addEventListener("click", (e) => {
  const deleteButton = e.target.closest("button[data-shared-delete]");
  if (!deleteButton) return;
  sharedExpenses = sharedExpenses.filter(item => item.id !== deleteButton.dataset.sharedDelete);
  localStorage.setItem("hostelSpend_sharedExpenses", JSON.stringify(sharedExpenses));
  renderSharedExpenses();
  showToast("Shared expense removed.");
});

notificationEnableEl.addEventListener("click", async () => {
  if (typeof Notification === "undefined") {
    updateNotificationStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    updateNotificationStatus();
    showToast(permission === "granted" ? "Device notifications enabled." : "Notification permission was not granted.");
  } catch (error) {
    console.error("Could not request notification permission:", error);
    notificationStatusEl.textContent = "Could not enable device notifications. In-app warnings remain on.";
    showToast("Could not enable device notifications.");
  }
});

document.querySelectorAll("button[data-export]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.export === "csv") exportExpensesCsv();
    else exportLocalBackup();
  });
});

backupImportEl.addEventListener("change", async () => {
  const file = backupImportEl.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Backup file is too large (maximum 5 MB).");
    backupImportEl.value = "";
    return;
  }
  try {
    const backup = JSON.parse(await file.text());
    mergeLocalBackup(backup);
    showToast("Backup merged. Reloading to show restored data.");
    setTimeout(() => location.reload(), 800);
  } catch (error) {
    console.error("Could not import expense backup:", error);
    showToast(error instanceof Error ? `Import failed: ${error.message}` : "Import failed. Check the JSON backup file.");
  } finally {
    backupImportEl.value = "";
  }
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const budgetInput = document.getElementById("monthly-budget").value;
  baseMonthlyBudget = parseFloat(budgetInput) || 0;
  
  const limitInputs = document.querySelectorAll("input[data-limit-category]");
  categoryLimits = {};
  limitInputs.forEach(input => {
    const val = parseFloat(input.value);
    if (val > 0) categoryLimits[input.dataset.limitCategory] = val;
  });

  // Start a fresh 30-day cycle from the exact time the budget is saved.
  budgetStartDate = new Date();
  budgetStartDateStr = budgetStartDate.toISOString();
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
  localStorage.setItem("hostelSpend_budget", baseMonthlyBudget);
  localStorage.setItem("hostelSpend_categoryLimits", JSON.stringify(categoryLimits));
  
  effectiveBudget = baseMonthlyBudget + rolloverAmount;
  
  showToast("Limits updated & 30-day budget cycle restarted!");
  updateDashboard();
});

// Handle Deleting an Expense
expenseListEl.addEventListener("click", (e) => {
  handleExpenseDelete(e);
});

historyListEl.addEventListener("click", (e) => {
  handleExpenseDelete(e);
});

historyMonthEl.addEventListener("change", () => {
  const cycleStartDay = budgetStartDate.toISOString().split('T')[0];
  renderExpenseHistory(cycleStartDay);
});

async function handleExpenseDelete(e) {
  const deleteBtn = e.target.closest("button[data-delete-id]");
  if (!deleteBtn || expenseMutationPending) return;

  const idToDelete = deleteBtn.dataset.deleteId;
  expenseMutationPending = true;
  try {
    if (!(await requestAppPin("verify"))) return;
    if (!expenses.some(exp => exp.id === idToDelete)) return;
    if (!confirm("Are you sure you want to delete this expense?")) return;

    expenses = expenses.filter(exp => exp.id !== idToDelete);
    localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));
    showToast("Expense deleted!");
    updateDashboard();
  } finally {
    expenseMutationPending = false;
  }
}

// Run on load
init();